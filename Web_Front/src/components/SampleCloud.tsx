// Part of the APK.audio project — http://APK.audio — made by Anthony Kuzub
// MIT Licence. Free, for everyone, for ever. Full text in LICENSE at the root.
import { useRef, useMemo, useEffect, useState } from 'react'
import { Canvas, useThree, useFrame, type ThreeEvent } from '@react-three/fiber'
import { OrbitControls, Line, Html } from '@react-three/drei'
import * as THREE from 'three'
import { subKey, ucsColor, ucsSubColor, taxonomyKeys } from '../groupColors'
import type { Taxonomy } from '../groupColors'
import { adsrNumber } from '../envelopeSlices'
import { puck, puckFlyable } from '../spaceMouse'
import { ACCENT } from '../brand';
import { RECORDING_NUMERIC, RECORDING_CATEGORICAL } from '../recordings'

// The subgroup, but only when it is a CURATED level (Perc -> Conga) rather than
// the auto "group + length tier" one; '' when the subgroup merely echoes its
// group. Ported from `graphing_rs/src/main.rs:99` `deeper_sub()`, which held this
// rule until PLAN-109.04 retired that crate — nothing called it, and a lane was
// compiling it anyway. **This function is now the only copy.** What the Rust used
// to prove is proved instead by `test/depth-axis.test.mjs`, which replays the
// retired binary's own captured answers against this source; the crate is in git
// history if the vectors ever need regenerating. The measurement that says so is the
// audit 20260829_GRAPHING_RS_VS_CLOUDTAB.md, filed under Code-Quality-Audits/ in
// the APK:Documentation audits lane. NAMED BY FILENAME ON PURPOSE: that lane was
// renumbered twice on 2026-08-30 alone, so a path here would already be wrong.
//
// The test is a lowercased prefix test in BOTH directions on purpose: it has to
// reject `Perc`/`Perc Long` (subgroup extends the group) as well as
// `Perc Long`/`Perc` (group extends the subgroup). Equality alone would let the
// auto tier through as a level and double every group in the depth axis.
export function deeperSub(group: string, subgroup: string): string {
  const g = (group ?? '').trim();
  const sg = (subgroup ?? '').trim();
  const gl = g.toLowerCase();
  const sgl = sg.toLowerCase();
  if (sg !== '' && sgl !== gl && !sgl.startsWith(gl) && !gl.startsWith(sgl)) return sg;
  return '';
}

// The LEADING U+001F IS LOAD-BEARING, and a plain ' › ' is measurably wrong.
//
// `makeAxis` orders a categorical axis by sorting the distinct set, so the level
// order has to fall out of the string. The Rust built it by hand — a BTreeMap of
// group -> BTreeSet of subgroups, group level emitted before its subgroups — and
// the only way a flat sort reproduces that is if the separator sorts BELOW every
// character a group name can start with. U+001F (unit separator) does; a space
// does not, because a group named `Perc Long` then lands between `Perc` and
// `Perc › Conga` and the hierarchy interleaves. That is the same reason
// `subKey()` in ../groupColors uses charCode 31, and it is the same convention.
//
// The ' › ' after it is cosmetic: nothing renders a categorical value today
// (`makeAxis` only ever calls `cats.indexOf` on it), and if anything ever does,
// it reads as `Perc › Conga` with an invisible byte in front.
const DEPTH_SEP = '\u001f › ';

// Feature registry: label → how to read it. Numeric features are normalized
// across the dataset; categorical ones are spread into bands. Mirrors the
// desktop graph tab's ISO_FEATURES.
type Feature = { categorical?: boolean; get: (it: any) => number | string };
export const CLOUD_FEATURES: Record<string, Feature> = {
  Group: { categorical: true, get: (it) => it.classification?.group || 'Unclassified' },
  Subgroup: { categorical: true, get: (it) => it.classification?.subgroup || '—' },
  // Hierarchical depth: a group, and its curated subgroups one level deeper.
  // `Group` and `Subgroup` above are two independent FLAT axes — pick one and
  // the other is ignored — so neither can show a sample sitting at the group
  // level beside its siblings that are one level down. This is the axis that
  // can. The group fallback is 'Unclassified' rather than the Rust's 'Other'
  // so that one record does not answer to two different names on two axes.
  Depth: {
    categorical: true,
    get: (it) => {
      const g = it.classification?.group || 'Unclassified';
      const sub = deeperSub(g, it.classification?.subgroup || '');
      return sub ? g + DEPTH_SEP + sub : g;
    },
  },
  Timbre: { categorical: true, get: (it) => it.classification?.timbre || '?' },
  Cluster: { categorical: true, get: (it) => it.unsupervised?.cluster != null && it.unsupervised.cluster !== -1 ? 'C' + it.unsupervised.cluster : '—' },
  Length: { get: (it) => it.metadata?.length_seconds ?? 0 },
  Complexity: { get: (it) => it.spectral_features?.complexity ?? 0 },
  'Brightness (centroid)': { get: (it) => it.spectral_features?.spectral_centroid_hz ?? 0 },
  Harmonicity: { get: (it) => it.spectral_features?.harmonicity ?? 0 },
  // Peak-relative, so null on a multi-event file — read the loudest slice
  // rather than 0, which would stack every loop at the origin of this axis.
  Sustain: { get: (it) => adsrNumber(it, 'envelope_sustain_level') },
  Attack: { get: (it) => it.envelope?.attack_seconds ?? 0 },
  Pitch: { get: (it) => it.musicality?.pitch_hz ?? 0 },
  BPM: { get: (it) => it.musicality?.beats_per_minute ?? 0 },
  RMS: { get: (it) => it.spectral_features?.root_mean_square_level ?? 0 },
  ZCR: { get: (it) => it.spectral_features?.zero_crossings_per_second ?? 0 },
  Transients: { get: (it) => it.envelope?.transient_count ?? 0 },
  'Crest Factor': { get: (it) => it.spectral_features?.crest_factor ?? 0 },
  Flatness: { get: (it) => it.spectral_features?.spectral_flatness ?? 0 },
  // The bench's recordings (recordings.ts): what a device read, as numbers and names.
  ...Object.fromEntries(Object.entries(RECORDING_CATEGORICAL).map(([k, get]) => [k, { categorical: true, get }])),
  ...Object.fromEntries(Object.entries(RECORDING_NUMERIC).map(([k, get]) => [k, { get: (it: any) => { const v = get(it); return Number.isFinite(v) ? v : 0; } }])),
};

export const AXIS_OPTIONS = Object.keys(CLOUD_FEATURES);
export const SIZE_OPTIONS = Object.entries(CLOUD_FEATURES)
  .filter(([, f]) => !f.categorical)
  .map(([label]) => label);
// UCS is the only taxonomy the cloud speaks. Category = hue, Subcategory = shade within it.
export const COLOR_OPTIONS = ['UCS Category', 'UCS Subcategory'];
export const SHAPE_OPTIONS = ['Instrument', 'Timbre', 'Uniform'];

const SPAN = 30; // world units each axis is spread over

// Deterministic jitter in [-1,1] from an integer index (stable across renders).
function jitter(i: number): number {
  const x = Math.sin(i * 12.9898) * 43758.5453;
  return (x - Math.floor(x)) * 2 - 1;
}

function makeAxis(data: any[], label: string): (it: any, i: number) => number {
  const f = CLOUD_FEATURES[label];
  if (!f) return () => 0;
  if (f.categorical) {
    const cats = Array.from(new Set(data.map((it) => f.get!(it)))).sort();
    const n = Math.max(1, cats.length - 1);
    return (it, i) => ((cats.indexOf(f.get!(it)) / n) - 0.5) * SPAN + jitter(i) * 1.4;
  }
  let mn = Infinity, mx = -Infinity;
  for (const it of data) {
    const v = Number(f.get(it));
    if (Number.isFinite(v)) { if (v < mn) mn = v; if (v > mx) mx = v; }
  }
  const range = mx - mn || 1;
  return (it) => {
    const v = Number(f.get(it));
    const nv = Number.isFinite(v) ? (v - mn) / range : 0.5;
    return (nv - 0.5) * SPAN;
  };
}

function makeSize(data: any[], label: string): (it: any) => number {
  const f = CLOUD_FEATURES[label];
  if (!f || f.categorical) return () => 0.7;
  let mn = Infinity, mx = -Infinity;
  for (const it of data) {
    const v = Number(f.get(it));
    if (Number.isFinite(v)) { if (v < mn) mn = v; if (v > mx) mx = v; }
  }
  const range = mx - mn || 1;
  return (it) => {
    const v = Number(f.get(it));
    const nv = Number.isFinite(v) ? (v - mn) / range : 0.5;
    return 0.35 + nv * 1.6;
  };
}

function colorFor(item: any, colorBy: string): string {
  // The UCS taxonomy (82 categories, scored per file) — hue = parent category,
  // shade = subcategory. Distinct from the god categories, which are six
  // envelope buckets over the drum-pack name groups.
  if (colorBy === 'UCS Subcategory') {
    return ucsSubColor(item.ucs?.category || '', item.ucs?.subcategory || '');
  }
  // Default and 'UCS Category': hue by UCS category.
  return ucsColor(item.ucs?.category || '');
}

function getShapeFor(it: any, shapeBy: string): string {
  if (shapeBy === 'Uniform') return 'sphere';

  const g = (it.classification?.group || '').toLowerCase();
  // Not a scope taxonomy — just a shape heuristic. `role` is the record's stored
  // music-production field when present, else its UCS category — which now carries the
  // instrument family (DRUMS, CYMBALS, …) since MUSICPROD folded into UCS.
  const role = it.classification?.music_production_category
    || it.ucs?.category || '';
  const t = (it.classification?.timbre || '').toLowerCase();
  const transient_count = it.envelope?.transient_count ?? 0;

  if (shapeBy === 'Timbre') {
    if (t === 'percussive') return 'pyramid';
    if (t === 'loop') return 'torus';
    if (t === 'bass') return 'cylinder';
    if (t === 'tonal') return 'cube';
    if (t === 'noise') return 'diamond';
    if (t === 'bright') return 'icosahedron';
    if (t === 'pad') return 'dodecahedron';
    return 'sphere';
  }

  // Instrument (default). Group-name substrings first, then the UCS-category / role name.
  if (g.includes('kick') || g.includes('snare') || g.includes('tom') || g.includes('clap') || role === 'DRUMS') return 'cylinder';
  if (g.includes('cymbal') || g.includes('hi-hat') || g.includes('ride') || g.includes('crash') || g.includes('hihat') || role === 'CYMBALS') return 'disc';
  if (g === 'ir' || role === 'IMPULSE RESPONSE') return 'diamond';
  if (g === 'perc' || role === 'PERCUSSION' || role === 'PERCUSSION TUNED' || role === 'SHAKEN' || role === 'MALLET') return 'pyramid';
  if (transient_count > 1 || role === 'LOOP' || role === 'LOOPS' || role === 'EXPERIMENTAL' || g.includes('loop') || g === 'fx') return 'torus';
  if (g === 'bass' || g.includes('synth') || role === 'SYNTHESIZED' || role === 'KEYED' || role === 'INSTRUMENT'
      || role === 'SYNTH' || role === 'KEYBOARD' || role === 'PIANO' || role === 'STRINGS' || role === 'GUITAR'
      || role === 'BRASS' || role === 'WOODWIND') return 'cube';
  if (g === 'voice' || g.includes('voice') || role === 'PERFORMANCE' || role === 'VOCALS') return 'icosahedron';
  return 'sphere'; // default for unclassified
}

// 3D axis lines through the origin + DOM labels at their ends.
function Axes({ xLabel, yLabel, zLabel }: { xLabel: string; yLabel: string; zLabel: string }) {
  const L = SPAN / 2 + 2;
  const label: React.CSSProperties = { fontSize: '11px', fontWeight: 700, whiteSpace: 'nowrap', pointerEvents: 'none', userSelect: 'none', textShadow: '0 0 3px #000' };
  return (
    <group>
      <Line points={[[-L, 0, 0], [L, 0, 0]]} color={ACCENT} lineWidth={1} transparent opacity={0.4} />
      <Line points={[[0, -L, 0], [0, L, 0]]} color="#0ea5e9" lineWidth={1} transparent opacity={0.4} />
      <Line points={[[0, 0, -L], [0, 0, L]]} color="#aaaaaa" lineWidth={1} transparent opacity={0.4} />
      <Html position={[L + 1, 0, 0]} center><span style={{ ...label, color: ACCENT }}>X · {xLabel}</span></Html>
      <Html position={[0, L + 1, 0]} center><span style={{ ...label, color: '#0ea5e9' }}>Y · {yLabel}</span></Html>
      <Html position={[0, 0, L + 1]} center><span style={{ ...label, color: '#cbd5e1' }}>Z · {zLabel}</span></Html>
    </group>
  );
}

interface CloudProps {
  data: any[];
  xAxis: string; yAxis: string; zAxis: string; sizeAxis: string; colorBy: string; shapeBy: string;
  hiddenGroups: Set<string>;
  selectedIndex: number | null;
  onPick: (index: number) => void;
  playing: boolean;
}

interface ShapeData {
  positions: [number, number, number][];
  colors: THREE.Color[];
  sizes: number[];
  origIndex: number[];
}

function ShapeMesh({ shape, sData, hiddenGroups, allData, taxonomy, onPick }: { shape: string, sData: ShapeData, hiddenGroups: Set<string>, allData: any[], taxonomy: Taxonomy, onPick: (i: number) => void }) {
  const meshRef = useRef<THREE.InstancedMesh>(null!);
  const dummy = useMemo(() => new THREE.Object3D(), []);
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);
  
  // Track the max capacity we've needed so far. We never shrink args, only grow it,
  // to prevent R3F from destroying and recreating the WebGL buffers during filtering.
  const [capacity, setCapacity] = useState(sData.positions.length || 100);
  if (sData.positions.length > capacity) {
    setCapacity(sData.positions.length);
  }
  
  useEffect(() => {
    const mesh = meshRef.current;
    if (!mesh || sData.positions.length === 0) return;
    const currentCapacity = mesh.instanceMatrix.array.length / 16;
    const limit = Math.min(sData.positions.length, currentCapacity);
    
    // Explicitly set how many instances to draw!
    mesh.count = limit;
    
    for (let i = 0; i < limit; i++) {
      const origIdx = sData.origIndex[i];
      const [x, y, z] = sData.positions[i];
      const origIt = allData[origIdx];
      const [g, sg] = taxonomyKeys(origIt, taxonomy);
      const hidden = hiddenGroups.has(g) || (!!sg && hiddenGroups.has(subKey(g, sg)));
      
      dummy.position.set(x, y, z);
      if (shape === 'pyramid') dummy.rotation.set(Math.PI/2, Math.PI/4, 0);
      else if (shape === 'diamond' || shape === 'cube' || shape === 'icosahedron' || shape === 'dodecahedron') dummy.rotation.set(Math.PI/4, 0, Math.PI/4);
      else if (shape === 'cylinder' || shape === 'disc' || shape === 'torus') dummy.rotation.set(Math.PI/2, 0, 0);
      else dummy.rotation.set(0, 0, 0);

      dummy.scale.setScalar(hidden ? 0.0001 : sData.sizes[i]);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
      mesh.setColorAt(i, sData.colors[i]);
    }
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    // Raycasting tests the mesh's bounding sphere first, and three computes it only once
    // (at the first raycast). Recompute after every matrix rewrite or hover/click picking
    // goes blind — or falsely hits — once the scope filter moves the instances.
    mesh.computeBoundingSphere();
  }, [sData, hiddenGroups, allData, dummy, shape, taxonomy]);

  const handleClick = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation();
    if (e.instanceId != null) onPick(sData.origIndex[e.instanceId]);
  };

  const handlePointerOver = (e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation();
    if (e.instanceId != null) {
      setHoveredIdx(e.instanceId);
      document.body.style.cursor = 'pointer';
    }
  };

  const handlePointerOut = (e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation();
    setHoveredIdx(null);
    document.body.style.cursor = 'auto';
  };

  // Clean up cursor if unmounted while hovered. MUST stay above the empty-bucket return:
  // a hook after a conditional return renders a different hook count when a shape's bucket
  // empties (e.g. the scope narrows to one category), and React throws — which the
  // WebGLBoundary then mislabels as "WebGL couldn't start".
  useEffect(() => {
    return () => { document.body.style.cursor = 'auto'; };
  }, []);

  if (sData.positions.length === 0) return null;

  let geom;
  if (shape === 'cylinder') geom = <cylinderGeometry args={[0.5, 0.5, 0.9, 16]} />;
  else if (shape === 'disc') geom = <cylinderGeometry args={[0.6, 0.6, 0.15, 16]} />;
  else if (shape === 'diamond') geom = <octahedronGeometry args={[0.6, 0]} />;
  else if (shape === 'pyramid') geom = <coneGeometry args={[0.6, 0.9, 4]} />;
  else if (shape === 'cube') geom = <boxGeometry args={[0.8, 0.8, 0.8]} />;
  else if (shape === 'torus') geom = <torusGeometry args={[0.5, 0.2, 12, 16]} />;
  else if (shape === 'icosahedron') geom = <icosahedronGeometry args={[0.6, 0]} />;
  else if (shape === 'dodecahedron') geom = <dodecahedronGeometry args={[0.55, 0]} />;
  else geom = <sphereGeometry args={[0.5, 10, 10]} />;

  return (
    <instancedMesh 
      ref={meshRef} 
      args={[undefined as any, undefined as any, capacity]} 
      onClick={handleClick}
      onPointerOver={handlePointerOver}
      onPointerOut={handlePointerOut}
    >
      {geom}
      <meshBasicMaterial toneMapped={false} />
      {hoveredIdx != null && sData.positions[hoveredIdx] && (
        <Html position={sData.positions[hoveredIdx]} style={{ pointerEvents: 'none', zIndex: 100 }}>
          {/* Offset up-and-right of the anchor so the box never sits over the hovered
              block or the cursor pointing at it (`center` would park it on both). */}
          <div style={{
            transform: 'translate(22px, calc(-100% - 18px))',
            background: 'rgba(15, 19, 27, 0.9)',
            border: '1px solid rgba(255, 255, 255, 0.1)',
            padding: '4px 8px',
            borderRadius: '4px',
            color: '#f8fafc',
            fontSize: '11px',
            whiteSpace: 'nowrap',
            boxShadow: '0 4px 12px rgba(0,0,0,0.5)',
            userSelect: 'none',
          }}>
            <div style={{ fontWeight: 'bold', color: 'var(--accent-primary)', marginBottom: '0.2rem' }}>
              {allData[sData.origIndex[hoveredIdx]]?.metadata?.name || 'Unknown'}
            </div>
            <div><strong style={{ color: 'var(--text-secondary)' }}>Category:</strong> {allData[sData.origIndex[hoveredIdx]]?.ucs?.category || '(unclassified)'} {allData[sData.origIndex[hoveredIdx]]?.ucs?.subcategory ? `/ ${allData[sData.origIndex[hoveredIdx]]?.ucs?.subcategory}` : ''}</div>
            <div><strong style={{ color: 'var(--text-secondary)' }}>Instrument:</strong> {allData[sData.origIndex[hoveredIdx]]?.classification?.timbre || 'Unknown'}</div>
            <div><strong style={{ color: 'var(--text-secondary)' }}>Length:</strong> {allData[sData.origIndex[hoveredIdx]]?.metadata?.length_seconds?.toFixed(2)}s</div>
          </div>
        </Html>
      )}
    </instancedMesh>
  );
}

function CloudPoints({ data, xAxis, yAxis, zAxis, sizeAxis, colorBy, shapeBy, hiddenGroups, selectedIndex, onPick, playing }: CloudProps) {
  const count = data.length
  // UCS is the only taxonomy the cloud speaks.
  const taxonomy = 'UCS' as const;

  const { shapeData, allPositions, selectedSize, selectedShape } = useMemo(() => {
    const xf = makeAxis(data, xAxis);
    const yf = makeAxis(data, yAxis);
    const zf = makeAxis(data, zAxis);
    const sf = makeSize(data, sizeAxis);
    
    const shapes: Record<string, ShapeData> = {
      sphere: { positions: [], colors: [], sizes: [], origIndex: [] },
      cylinder: { positions: [], colors: [], sizes: [], origIndex: [] },
      disc: { positions: [], colors: [], sizes: [], origIndex: [] },
      diamond: { positions: [], colors: [], sizes: [], origIndex: [] },
      pyramid: { positions: [], colors: [], sizes: [], origIndex: [] },
      cube: { positions: [], colors: [], sizes: [], origIndex: [] },
      torus: { positions: [], colors: [], sizes: [], origIndex: [] },
      icosahedron: { positions: [], colors: [], sizes: [], origIndex: [] },
      dodecahedron: { positions: [], colors: [], sizes: [], origIndex: [] },
    };

    const allPositions: [number, number, number][] = [];
    let selectedSize = 0.7;
    let selectedShape = 'sphere';

    for (let i = 0; i < count; i++) {
      const it = data[i];
      const pos: [number, number, number] = [xf(it, i), yf(it, i), zf(it, i)];
      allPositions.push(pos);
      
      const shape = getShapeFor(it, shapeBy);
      const sh = shapes[shape];
      sh.positions.push(pos);
      sh.colors.push(new THREE.Color(colorFor(it, colorBy)));
      const size = sf(it);
      sh.sizes.push(size);
      sh.origIndex.push(i);

      if (i === selectedIndex) {
        selectedSize = size;
        selectedShape = shape;
      }
    }
    return { shapeData: shapes, allPositions, selectedSize, selectedShape };
  }, [data, count, xAxis, yAxis, zAxis, sizeAxis, colorBy, shapeBy, selectedIndex]);



  // Arrow keys move the selection to the nearest point in that screen direction.
  const { camera } = useThree();
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key)) return;
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return;
      if (selectedIndex == null || selectedIndex < 0 || selectedIndex >= allPositions.length) return;
      e.preventDefault();
      const sel = new THREE.Vector3(...allPositions[selectedIndex]).project(camera);
      const p = new THREE.Vector3();
      let best = -1, bestScore = Infinity;
      for (let i = 0; i < allPositions.length; i++) {
        if (i === selectedIndex) continue;
        const [g, sg] = taxonomyKeys(data[i], taxonomy);
        if (hiddenGroups.has(g) || (sg && hiddenGroups.has(subKey(g, sg)))) continue;
        p.set(...allPositions[i]).project(camera);
        const dx = p.x - sel.x, dy = p.y - sel.y;
        let along = 0, perp = 0;
        if (e.key === 'ArrowRight') { along = dx; perp = Math.abs(dy); }
        else if (e.key === 'ArrowLeft') { along = -dx; perp = Math.abs(dy); }
        else if (e.key === 'ArrowUp') { along = dy; perp = Math.abs(dx); }
        else { along = -dy; perp = Math.abs(dx); }
        if (along <= 0 || perp > along) continue; // outside a 45° cone toward the key
        const score = Math.hypot(dx, dy);
        if (score < bestScore) { bestScore = score; best = i; }
      }
      if (best >= 0) onPick(best);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [allPositions, selectedIndex, hiddenGroups, data, onPick, camera, taxonomy]);

  // The wireframe highlight over the selected point. While its sample is playing
  // it breathes — scale + opacity swing on a ~1.6 Hz sine — so the cloud shows,
  // not just the top-left readout, which dot you're hearing. Idle, it sits static.
  const selMeshRef = useRef<THREE.Mesh>(null!);
  const baseScaleRef = useRef(1);
  useFrame(({ clock }) => {
    const m = selMeshRef.current;
    if (!m) return;
    const base = baseScaleRef.current;
    if (playing) {
      const s = 0.5 + 0.5 * Math.sin(clock.getElapsedTime() * 10);
      m.scale.setScalar(base * (1 + 0.35 * s));
      const mat = m.material as THREE.MeshBasicMaterial;
      if (mat) mat.opacity = 0.5 + 0.45 * s;
    } else {
      m.scale.setScalar(base);
      const mat = m.material as THREE.MeshBasicMaterial;
      if (mat) mat.opacity = 0.9;
    }
  });

  if (count === 0) return null;

  const selPos = selectedIndex != null && selectedIndex >= 0 && selectedIndex < allPositions.length ? allPositions[selectedIndex] : null;
  baseScaleRef.current = (selectedSize || 0.7) * 0.5 + 0.6;

  let selGeom;
  if (selectedShape === 'cylinder') selGeom = <cylinderGeometry args={[0.6, 0.6, 1.1, 16]} />;
  else if (selectedShape === 'disc') selGeom = <cylinderGeometry args={[0.7, 0.7, 0.2, 16]} />;
  else if (selectedShape === 'diamond') selGeom = <octahedronGeometry args={[0.7, 0]} />;
  else if (selectedShape === 'pyramid') selGeom = <coneGeometry args={[0.7, 1.1, 4]} />;
  else if (selectedShape === 'cube') selGeom = <boxGeometry args={[1.0, 1.0, 1.0]} />;
  else if (selectedShape === 'torus') selGeom = <torusGeometry args={[0.6, 0.25, 12, 16]} />;
  else if (selectedShape === 'icosahedron') selGeom = <icosahedronGeometry args={[0.7, 0]} />;
  else if (selectedShape === 'dodecahedron') selGeom = <dodecahedronGeometry args={[0.65, 0]} />;
  else selGeom = <sphereGeometry args={[0.6, 12, 12]} />;

  const meshRot = (shape: string): [number, number, number] => {
    if (shape === 'pyramid') return [Math.PI/2, Math.PI/4, 0];
    if (shape === 'diamond' || shape === 'cube' || shape === 'icosahedron' || shape === 'dodecahedron') return [Math.PI/4, 0, Math.PI/4];
    if (shape === 'cylinder' || shape === 'disc' || shape === 'torus') return [Math.PI/2, 0, 0];
    return [0, 0, 0];
  };

  return (
    <>
      {Object.entries(shapeData).map(([shape, sData]) => (
        <ShapeMesh key={shape} shape={shape} sData={sData} hiddenGroups={hiddenGroups} allData={data} taxonomy={taxonomy} onPick={onPick} />
      ))}
      {selPos && (
        <mesh ref={selMeshRef} position={selPos} rotation={meshRot(selectedShape)} scale={baseScaleRef.current}>
          {selGeom}
          <meshBasicMaterial color="#ffffff" wireframe transparent opacity={0.9} />
        </mesh>
      )}
    </>
  );
}

// SIX DEGREES OF FREEDOM ONTO SIX. The point cloud was chosen as the puck's
// first consuming surface for exactly this reason: every other candidate — the
// schematic canvas, the CAD elevations, the vision mixer — needs a projection
// decided before it needs code, and this one does not. Each axis lands on the
// camera move that shares its name.
//
//   y  push / pull      -> dolly, in and out along the view
//   x  left / right     -> truck, across the screen
//   z  lift / press     -> pedestal, up the camera's own up
//   yaw   twist         -> orbit, azimuth about the target
//   pitch nose up/down  -> orbit, elevation
//   roll  tilt          -> roll, the camera's up about the view axis
//
// The sense comes from the producer (right-handed, +X right, +Y forward, +Z up)
// and NOT from here. A consumer that decides its own sign is the fourth puck
// this whole arrangement exists to prevent.
//
// WHETHER THAT SENSE HAS EVER BEEN CHECKED against a hand is `puck.senseConfirmed`,
// readable here in one expression. This loop does not branch on it, and that is a
// decision rather than an oversight: the rule in force is fly-and-say-so, and the
// saying-so is drawn by CloudTab off `senseWarning`. The flag is carried this far
// so that a surface choosing to refuse an unverified frame costs a guard on the
// line below instead of a redesign — but refusing here would make this the only
// puck in the tree that does not move, on every bench, until somebody confirms one.
//
// It is reachable and unread, which to a lint sweep is dead code. What keeps it
// alive is not this comment: `puck` is typed `… & FrameQualification`, the same
// named interface `PuckStatus` extends and `senseWarning` takes, so deleting the
// two fields is a `tsc -b` failure, and `npm run build` runs `tsc -b`. That
// is the whole of PLAN-501.01; `senseWarning(puck)` is the one-line call a
// refusing surface would add here, and adding it is still somebody else's
// decision.
//
// RATES ARE PER SECOND, not per frame. `delta` is what makes a 20 Hz beat and a
// 144 Hz redraw fly at the same speed; multiplying a normalised axis straight
// into a position makes the puck faster on a better graphics card.
const PUCK_DOLLY = 18;      // world units per second at full deflection
const PUCK_TRUCK = 14;
const PUCK_ORBIT = 1.6;     // radians per second
const PUCK_ROLL = 1.2;
const PUCK_DEAD = 0.002;    // the probe already has a deadband; this is float noise

function SpaceMouseFly() {
  const { camera, controls } = useThree();

  useFrame((_state, delta) => {
    const f = puck.frame;

    // ONE CALL, AND IT IS THE ONLY WAY THIS SURFACE MAY ASK — PLAN-901.02.
    // This was two guards: `if (!puck.moving) return;` and then
    // `if (puckStale(Date.now())) return;`. Both are still what happens, in
    // that order and at that cost — `puckFlyable` short-circuits on `moving`
    // before it reads the clock — but the pairing now has a name, so the next
    // surface has one thing to call instead of a comment to obey.
    //
    // THE DEATH NOBODY ANNOUNCES is what the second half defends against.
    // `moving` is cleared only when a status says `offline` — that is, only
    // when the producer's Last Will fires. If frames simply STOP with the
    // deflection held, no status is ever posted, `moving` stays true, `f` keeps
    // its last non-zero value, and every line below would integrate it for as
    // long as the page is open.
    //
    // The window it tests against is derived from the producer's advertised
    // `pacing` rather than typed here. That is the entire point: under
    // `when: 'on_change'` with no heartbeat a held push is INDISTINGUISHABLE
    // from a dead wire, so a producer that promises no cadence gets no timeout
    // and flies forever — the old behaviour, kept exactly, for exactly that
    // case. PLAN-625.01, unblocked by PLAN-694.01.
    //
    // STOP, not zero: this returns without touching `puck`, so the next frame
    // to arrive resumes the flight with nothing to reset, and no frame the
    // producer did not send is invented on its behalf. The reasoning is on
    // `puckStale` itself, next to the stamp it reads.
    if (!puckFlyable()) return;

    const step = Math.min(delta, 0.1);   // a backgrounded tab must not teleport

    const target: THREE.Vector3 = (controls as any)?.target ?? new THREE.Vector3();
    const view = new THREE.Vector3().subVectors(camera.position, target);
    const radius = view.length();
    if (!(radius > 0)) return;

    // Orbit: yaw about the world up, pitch about the camera's own right.
    const yaw = Math.abs(f.yaw) > PUCK_DEAD ? -f.yaw * PUCK_ORBIT * step : 0;
    const pitch = Math.abs(f.pitch) > PUCK_DEAD ? f.pitch * PUCK_ORBIT * step : 0;
    if (yaw) view.applyAxisAngle(camera.up.clone().normalize(), yaw);
    if (pitch) {
      const right = new THREE.Vector3().crossVectors(view, camera.up).normalize();
      view.applyAxisAngle(right, pitch);
    }

    // Dolly: along the view, and never through the target.
    if (Math.abs(f.y) > PUCK_DEAD) {
      const wanted = radius - f.y * PUCK_DOLLY * step;
      view.setLength(Math.max(1.5, Math.min(500, wanted)));
    }

    // Truck and pedestal: the target moves with the camera, so the pan is a
    // pan and not a second orbit.
    const right = new THREE.Vector3().crossVectors(view, camera.up).normalize();
    const pan = new THREE.Vector3();
    if (Math.abs(f.x) > PUCK_DEAD) pan.addScaledVector(right, f.x * PUCK_TRUCK * step);
    if (Math.abs(f.z) > PUCK_DEAD) pan.addScaledVector(camera.up.clone().normalize(), f.z * PUCK_TRUCK * step);
    if (pan.lengthSq() > 0) target.add(pan);

    // Roll: the camera's up about the view axis. The sixth axis is consumed
    // rather than dropped — a puck that moves five of six is a puck the hand
    // keeps discovering the edge of.
    if (Math.abs(f.roll) > PUCK_DEAD) {
      camera.up.applyAxisAngle(view.clone().normalize(), -f.roll * PUCK_ROLL * step).normalize();
    }

    camera.position.copy(target).add(view);
    camera.lookAt(target);
    (controls as any)?.update?.();
  });

  return null;
}

interface SampleCloudProps {
  data?: any[];
  xAxis?: string; yAxis?: string; zAxis?: string; sizeAxis?: string; colorBy?: string; shapeBy?: string;
  hiddenGroups?: Set<string>;
  selectedIndex?: number | null;
  onPick?: (index: number) => void;
  showAxes?: boolean;
  playing?: boolean;
}

export default function SampleCloud({
  data = [], xAxis = 'Pitch', yAxis = 'Group', zAxis = 'Complexity',
  sizeAxis = 'Length', colorBy = 'Group', shapeBy = 'Instrument', hiddenGroups = new Set(),
  selectedIndex = null, onPick = () => {}, showAxes = true, playing = false,
}: SampleCloudProps) {
  return (
    <div style={{ width: '100%', height: '100%', position: 'absolute', inset: 0, zIndex: 0 }}>
      {data.length === 0 && (
        <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-secondary)', zIndex: 10 }}>
          Upload a .PEAK file or scan a folder to visualize the cloud.
        </div>
      )}
      <Canvas camera={{ position: [0, 0, 45], fov: 60 }} raycaster={{ params: { Points: { threshold: 0.6 } } as any }}
        aria-label="Three-dimensional point cloud of the scanned library, one point per sample"
        style={{ touchAction: 'none' }}>
        <color attach="background" args={['#0B0E14']} />
        <ambientLight intensity={0.7} />
        <directionalLight position={[10, 10, 10]} intensity={0.6} />
        {showAxes && <Axes xLabel={xAxis} yLabel={yAxis} zLabel={zAxis} />}
        <CloudPoints
          data={data} xAxis={xAxis} yAxis={yAxis} zAxis={zAxis}
          sizeAxis={sizeAxis} colorBy={colorBy} shapeBy={shapeBy} hiddenGroups={hiddenGroups}
          selectedIndex={selectedIndex} onPick={onPick} playing={playing}
        />
        <OrbitControls makeDefault enablePan enableZoom enableRotate autoRotate={false} />
        <SpaceMouseFly />
      </Canvas>
    </div>
  )
}
