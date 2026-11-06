//! The 32 facial responses: the 4th dimension of the 4D ball.
//!
//! The 3D cloud places a sample by three acoustic features. That leaves its
//! CATEGORY to be carried by colour alone, which is why the clusters in the
//! current graph overlap: nothing in the geometry keeps two categories apart.
//!
//! Here category becomes geometric. A truncated icosahedron has 32 faces, and
//! each face is one FACIAL RESPONSE — what a character's face does when this
//! sound plays. Every UCS category routes to exactly one face, so a sample is
//! positioned by its acoustics AND pulled toward the face its category answers
//! to. That pull is the fourth dimension: it is not a spatial axis, it is the
//! response class, and it is what separates the clusters on the ball.
//!
// THE SOLID ITSELF moved to VISUALIZER.Like.audio (src/core/solid.mjs, ROAD-3571,
// 2026-11-06): the 4D viewer builds and validates it. What stays here is what a
// face MEANS to Scanalyzer: the 32 responses below, in face order, which the 4D
// tab sends as the `Response` field's declared order (FaceBallTab/faceRecords.ts).

// ---------------------------------------------------------------- responses

export type ResponseFamily = 'Viseme' | 'Startle' | 'Effort' | 'Aversion' | 'Attend' | 'Ambient';

export interface FacialResponse {
  id: string;
  name: string;
  family: ResponseFamily;
  /** Blendshape / FACS Action Unit targets the amplitude drives. */
  actionUnits: string[];
  /** Peak blendshape weight at full amplitude (0..1). A gunshot flinches hard;
   *  a distant vehicle should barely move the face. */
  intensity: number;
  /** Minimum gap between re-triggers, so a machine-gun's 15 transients do not
   *  make the face flutter. Per-transient triggering reads the ADSR slice array. */
  cooldownMs: number;
  /** UCS categories that route here. */
  categories: string[];
}

/**
 * The 32 responses, in face order: the first 12 land on pentagons (the primary,
 * high-salience reactions) and the remaining 20 on hexagons (secondary and
 * ambient). Pentagons are the rarer face, which is the right home for the rarer
 * and stronger reactions.
 */
export const RESPONSES: FacialResponse[] = [
  // ---- 12 pentagons: primary, strong blendshape drive
  { id: 'speech-viseme', name: 'Speech Viseme', family: 'Viseme',
    actionUnits: ['JawOpen', 'MouthFunnel', 'MouthPucker', 'MouthClose'],
    intensity: 1.0, cooldownMs: 0, categories: ['VOICES'] },
  { id: 'sung-viseme', name: 'Sung Viseme', family: 'Viseme',
    actionUnits: ['JawOpen', 'MouthFunnel', 'BrowInnerUp'],
    intensity: 1.0, cooldownMs: 0, categories: ['VOCALS'] },
  { id: 'creature-vocal', name: 'Creature Vocalisation', family: 'Viseme',
    actionUnits: ['JawOpen', 'MouthUpperUpLeft', 'MouthUpperUpRight', 'NoseSneer'],
    intensity: 0.85, cooldownMs: 120, categories: ['CREATURES', 'ANIMALS', 'BIRDS'] },
  { id: 'gunshot-flinch', name: 'Gunshot Flinch', family: 'Startle',
    actionUnits: ['EyeSquintLeft', 'EyeSquintRight', 'BrowDown', 'MouthPress'],
    intensity: 1.0, cooldownMs: 260, categories: ['GUNS', 'BULLETS', 'WEAPONS'] },
  { id: 'blast-recoil', name: 'Blast Recoil', family: 'Startle',
    actionUnits: ['EyeBlink', 'BrowDown', 'JawOpen', 'CheekSquint'],
    intensity: 1.0, cooldownMs: 400, categories: ['EXPLOSIONS', 'FIREWORKS', 'NATURAL_DISASTER'] },
  { id: 'impact-wince', name: 'Impact Wince', family: 'Startle',
    actionUnits: ['EyeSquintLeft', 'EyeSquintRight', 'MouthFrown', 'BrowDown'],
    intensity: 0.9, cooldownMs: 220, categories: ['DESTRUCTION', 'FIGHT', 'GORE'] },
  { id: 'shatter-squint', name: 'Shatter Squint', family: 'Startle',
    actionUnits: ['EyeSquintLeft', 'EyeSquintRight', 'NoseSneer'],
    intensity: 0.8, cooldownMs: 180, categories: ['GLASS', 'CERAMICS'] },
  { id: 'alarm-startle', name: 'Alarm Startle', family: 'Startle',
    actionUnits: ['EyeWide', 'BrowInnerUp', 'MouthStretch'],
    intensity: 0.85, cooldownMs: 500, categories: ['ALARMS', 'HORNS'] },
  { id: 'exertion-breath', name: 'Exertion Breath', family: 'Effort',
    actionUnits: ['JawOpen', 'MouthStretch', 'BrowDown'],
    intensity: 0.7, cooldownMs: 90, categories: ['HUMAN', 'SPORTS'] },
  { id: 'locomotion-effort', name: 'Locomotion Effort', family: 'Effort',
    actionUnits: ['MouthPress', 'JawForward'],
    intensity: 0.45, cooldownMs: 140, categories: ['FOOTSTEPS', 'MOVEMENT'] },
  { id: 'disgust-recoil', name: 'Disgust Recoil', family: 'Aversion',
    actionUnits: ['NoseSneer', 'MouthUpperUpLeft', 'MouthUpperUpRight', 'EyeSquint'],
    intensity: 0.8, cooldownMs: 300, categories: ['FARTS', 'LIQUID_MUD', 'FOOD_DRINK'] },
  { id: 'thermal-shiver', name: 'Thermal Shiver', family: 'Aversion',
    actionUnits: ['MouthPress', 'CheekSquint', 'BrowInnerUp'],
    intensity: 0.6, cooldownMs: 350, categories: ['SNOW', 'ICE', 'FIRE', 'GEOTHERMAL'] },

  // ---- 20 hexagons: secondary, attentional and ambient
  { id: 'crowd-attend', name: 'Crowd Attend', family: 'Attend',
    actionUnits: ['EyeLookOut', 'BrowInnerUp'],
    intensity: 0.4, cooldownMs: 600, categories: ['CROWDS'] },
  { id: 'comms-attend', name: 'Comms Attend', family: 'Attend',
    actionUnits: ['EyeLookIn', 'BrowInnerUp'],
    intensity: 0.35, cooldownMs: 400, categories: ['COMMUNICATIONS', 'USER_INTERFACE', 'BEEPS'] },
  { id: 'machine-drone', name: 'Machine Drone', family: 'Ambient',
    actionUnits: ['BrowDown'],
    intensity: 0.15, cooldownMs: 1200, categories: ['MACHINES', 'MECHANICAL', 'MOTORS', 'EQUIPMENT'] },
  { id: 'vehicle-pass', name: 'Vehicle Pass', family: 'Ambient',
    actionUnits: ['EyeLookOut'],
    intensity: 0.2, cooldownMs: 900, categories: ['VEHICLES', 'AIRCRAFT', 'BOATS', 'TRAINS'] },
  { id: 'electric-tick', name: 'Electric Tick', family: 'Attend',
    actionUnits: ['EyeBlink', 'BrowInnerUp'],
    intensity: 0.3, cooldownMs: 500, categories: ['ELECTRICITY', 'COMPUTERS', 'ROBOTS'] },
  { id: 'scifi-wonder', name: 'Sci-Fi Wonder', family: 'Attend',
    actionUnits: ['EyeWide', 'BrowOuterUp'],
    intensity: 0.45, cooldownMs: 500, categories: ['SCIFI', 'LASERS', 'MAGIC'] },
  { id: 'designed-abstract', name: 'Designed / Abstract', family: 'Ambient',
    actionUnits: [],
    intensity: 0.1, cooldownMs: 1000, categories: ['DESIGNED', 'SWOOSHES', 'SYNTH', 'LOOPS'] },
  { id: 'toon-react', name: 'Cartoon React', family: 'Attend',
    actionUnits: ['EyeWide', 'MouthSmile', 'BrowOuterUp'],
    intensity: 0.7, cooldownMs: 200, categories: ['CARTOON', 'TOYS', 'GAMES'] },
  { id: 'metal-ring', name: 'Metal Ring', family: 'Attend',
    actionUnits: ['EyeSquint', 'BrowDown'],
    intensity: 0.4, cooldownMs: 300, categories: ['METAL', 'CHAINS', 'BELLS', 'CYMBALS'] },
  { id: 'wood-knock', name: 'Wood Knock', family: 'Attend',
    actionUnits: ['EyeBlink', 'EyeLookOut'],
    intensity: 0.35, cooldownMs: 300, categories: ['WOOD', 'DOORS', 'DRAWERS', 'WINDOWS'] },
  { id: 'soft-handle', name: 'Soft Handling', family: 'Ambient',
    actionUnits: [],
    intensity: 0.12, cooldownMs: 800, categories: ['CLOTH', 'LEATHER', 'RUBBER', 'PAPER', 'PLASTIC', 'ROPE'] },
  { id: 'granular-ground', name: 'Granular Ground', family: 'Ambient',
    actionUnits: ['EyeLookDown'],
    intensity: 0.18, cooldownMs: 700, categories: ['DIRT_SAND', 'ROCKS', 'VEGETATION'] },
  { id: 'water-flow', name: 'Water Flow', family: 'Ambient',
    actionUnits: [],
    intensity: 0.12, cooldownMs: 1000, categories: ['WATER', 'RAIN'] },
  { id: 'ambient-observe', name: 'Ambient / Observe', family: 'Ambient',
    actionUnits: ['EyeLookOut', 'EyeLookIn'],
    intensity: 0.08, cooldownMs: 1500, categories: ['AMBIENCE', 'WIND', 'AIR', 'WEATHER', 'ARCHIVED'] },
  { id: 'tool-work', name: 'Tool Work', family: 'Effort',
    actionUnits: ['BrowDown', 'MouthPress'],
    intensity: 0.35, cooldownMs: 350, categories: ['TOOLS', 'FOLEY', 'OBJECTS', 'CHEMICALS'] },
  { id: 'wing-flutter', name: 'Wing Flutter', family: 'Attend',
    actionUnits: ['EyeBlink', 'EyeLookUp'],
    intensity: 0.3, cooldownMs: 400, categories: ['WINGS'] },
  { id: 'clock-tick', name: 'Clock Tick', family: 'Ambient',
    actionUnits: ['EyeBlink'],
    intensity: 0.15, cooldownMs: 900, categories: ['CLOCKS'] },
  { id: 'whistle-attend', name: 'Whistle Attend', family: 'Attend',
    actionUnits: ['EyeWide', 'BrowInnerUp'],
    intensity: 0.5, cooldownMs: 450, categories: ['WHISTLES'] },
  { id: 'percussive-music', name: 'Percussive Music', family: 'Ambient',
    actionUnits: ['JawOpen'],
    intensity: 0.2, cooldownMs: 250, categories: ['DRUMS', 'PERCUSSION', 'MALLET'] },
  { id: 'melodic-music', name: 'Melodic Music', family: 'Ambient',
    actionUnits: [],
    intensity: 0.12, cooldownMs: 800,
    categories: ['PIANO', 'GUITAR', 'STRINGS', 'BRASS', 'WOODWIND', 'KEYBOARD'] },
];

/** The response a sound with no recognised category falls back to. Deliberately
 *  the most inert one: an unclassified sound must not drive a face. */
export const FALLBACK_RESPONSE_INDEX =
  RESPONSES.findIndex((r) => r.id === 'ambient-observe');

const CATEGORY_TO_FACE: Map<string, number> = (() => {
  const m = new Map<string, number>();
  RESPONSES.forEach((r, i) => r.categories.forEach((c) => m.set(c.toUpperCase(), i)));
  return m;
})();

/** Face index (0–31) for a UCS category name. */
export function faceOfCategory(category: string | undefined | null): number {
  if (!category) return FALLBACK_RESPONSE_INDEX;
  const hit = CATEGORY_TO_FACE.get(category.trim().toUpperCase());
  return hit === undefined ? FALLBACK_RESPONSE_INDEX : hit;
}

/** Face index for a record. */
export function faceOfItem(item: any): number {
  return faceOfCategory(item?.ucs?.category);
}

/** Every category that routes to a face, for legends and hover panels. */
export function categoriesOfFace(faceIndex: number): string[] {
  return RESPONSES[faceIndex]?.categories ?? [];
}

/** Categories the RESPONSES table does not mention — a real gap, since such a
 *  sound silently lands on the inert fallback. Pass the taxonomy's category list. */
export function unmappedCategories(all: string[]): string[] {
  return all.filter((c) => !CATEGORY_TO_FACE.has(c.trim().toUpperCase()));
}

// ------------------------------------------------------- blendshape driving

/**
 * The blendshape weight timeline for one record, one keyframe per transient.
 *
 * This is where the per-slice ADSR earns its keep. A file-level attack/decay is
 * meaningless on a multi-event sound — a 15-round burst has 15 attacks, and
 * animating one envelope across the whole file would make the face wince once,
 * slowly, over three seconds. Each slice drives its own trigger, scaled by that
 * slice's own level, and the response's cooldown suppresses re-triggers that are
 * too close together to read as separate reactions.
 */
export interface BlendshapeKey {
  timeSeconds: number;
  /** 0..1 target weight for this response's action units. */
  weight: number;
  /** Seconds to reach the weight, and to fall back to neutral — taken from the
   *  slice's own measured attack and release. */
  attackSeconds: number;
  releaseSeconds: number;
}

export function blendshapeTimeline(item: any): { response: FacialResponse; keys: BlendshapeKey[] } {
  const faceIndex = faceOfItem(item);
  const response = RESPONSES[faceIndex];
  const slices: any[] = Array.isArray(item?.envelope?.slices) ? item.envelope.slices : [];
  const keys: BlendshapeKey[] = [];
  let lastTriggerMs = -Infinity;

  for (const s of slices) {
    const t = Number(s.start_seconds) || 0;
    const tMs = t * 1000;
    if (tMs - lastTriggerMs < response.cooldownMs) continue; // too soon to read as separate
    lastTriggerMs = tMs;
    const level = Math.max(0, Math.min(1, Number(s.relative_level ?? 1)));
    keys.push({
      timeSeconds: t,
      weight: level * response.intensity,
      attackSeconds: Math.max(0.01, Number(s.envelope_attack_seconds) || 0.02),
      releaseSeconds: Math.max(0.05, Number(s.envelope_release_seconds) || 0.15),
    });
  }
  return { response, keys };
}
