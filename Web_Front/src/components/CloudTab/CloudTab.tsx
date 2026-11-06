// Part of the APK.audio project — http://APK.audio — made by Anthony Kuzub
// MIT Licence. Free, for everyone, for ever. Full text in LICENSE at the root.
import { useState, useEffect, useMemo, useRef } from 'react';
import AudioEye from '../AudioEye';
import { resolveAudioUrl } from '../../audioLinking';
import { ucsColor } from '../../groupColors';
import { decodePreview, previewShimSamples } from '../../peakPreview';
import { VizFrame } from '../../vizHost';
import { cloudRecords, cloudSchema, savedCloudView, saveCloudView, sampleId } from './cloudRecords';
import {
  puck, puckFlyable, receivePuck, senseWarning, stallWarning, puckAbsent, puckStale,
  staleWindowFor, stallPollMs, SENSE_CONFIRM_COMMAND, type PuckStatus,
} from '../../spaceMouse';

interface CloudTabProps {
  analysisResult: any[];
  // The scoped set (scope bar + text filter) the cloud draws.
  filteredData: any[];
  audioFiles: File[];
  onSound?: (name: string) => void;
  selectedItem?: any;
  playing?: boolean;
  // Open the selected file in the Examiner / Extractor (filtered to its name).
  onExamine?: (name: string) => void;
  onExtract?: (name: string) => void;
  // The app footer's shared <audio> element — the EYE overlay visualizes and scrubs it
  // rather than owning a second element (which would double the audio).
  eyeAudio?: HTMLAudioElement | null;
  // The footer's play/pause action, reused by the EYE's centre button.
  onEyePlay?: () => void;
}

/* THE AMBER A QUALIFIER IS DRAWN IN, and it is the token's, read rather than
   copied. `contracts/tokens/state.json` is where the three tones are DECIDED;
   main.tsx loads the vendored `vendor/apk-contracts/apk-tokens.css` (held to its
   source by the root `check.sh webtokens` lane) before anything renders, so
   `var(--apk-state-kinda)` is that decision itself and there is no hex here to
   drift. (DevicesTab.tsx one directory over still carries a hex copy because it
   maps WORDS to tones, and `check.sh statewords` holds that copy hex-for-hex.)

   WHY A QUALIFIER IS A STATE AT ALL, which is the question `PLAN-1061.01` had
   to answer before it could route this. `kinda`'s own role text in the token
   reads "Neither. Declared and unconfirmed, or heard once and not since" — and
   the two notices this colour draws are those two halves verbatim: `sense
   unverified` is a frame convention somebody declared and nobody confirmed,
   `not reporting` is a producer heard once and not since. A chip that qualifies
   a state is answering the same question the state answers, so it gets the same
   colour from the same place.

   IT WAS HAND-TYPED UNTIL 2026-09-10, at `#e0a33a` — 6.07 dE from this value in
   CIELAB, a colour copied NEARLY rather than wrongly, which `state.json`'s
   comment block calls the harder half of the family. Then it was a hex copy of
   the token (PLAN-3434.01 replaced it with the var); reading the var is what
   makes a fourth amber here impossible rather than merely checked.

   ONLY `kinda` IS USED. The badge draws no green and no red — a puck that is
   there and a puck that is gone are drawn in the shell's own text tones, not in
   the state tones. */
const STATE_KINDA = 'var(--apk-state-kinda)';

// A qualifier on the puck badge — something true about the frames that is NOT a
// change of state. There are two (`sense unverified`, `not reporting`) and they
// share one component so the amber cannot drift apart between them: a colour
// copied NEARLY is the harder half of the family `contracts/tokens/state.json`
// describes, and two hand-typed ambers a line apart is how it starts.
//
// THE GLYPH IS LOAD-BEARING, not decoration. It is the only thing separating the
// two chips for a reader who cannot use the tone — and the tone is the one thing
// a colour-blind operator cannot remap (`PLAN-791.01`), so the distinction is
// carried by the glyph and the words and never by the colour. It is
// `aria-hidden` because the text beside it already says the same thing to a
// screen reader; the glyph is for the sighted monochrome read.
function PuckQualifier({ glyph, text }: { glyph: string; text: string }) {
  return (
    <span
      style={{
        display: 'inline-flex', alignItems: 'center', gap: '0.2rem',
        marginLeft: '0.15rem', paddingLeft: '0.45rem',
        borderLeft: `1px solid ${STATE_KINDA}`,
        color: STATE_KINDA, fontWeight: 600, letterSpacing: '0.02em',
      }}
    >
      <span aria-hidden="true">{glyph}</span>
      <span>{text}</span>
    </span>
  );
}

export default function CloudTab({
  filteredData, audioFiles, onSound, selectedItem, playing, eyeAudio, onEyePlay
}: CloudTabProps) {
  // THE CLOUD IS A VIEWER NOW (ROAD-3571): VISUALIZER.Like.audio's 3d.html, framed
  // below and fed one flat record per sample (cloudRecords.ts says what a sample
  // is). Its own bar picks the axes, colour, size and shape; what the user picks
  // comes back as `view` and is remembered here, so the cloud reopens as it was left.
  const records = useMemo(() => cloudRecords(filteredData), [filteredData]);
  const [initialView] = useState(savedCloudView);
  const schema = useMemo(() => cloudSchema(records, initialView), [records, initialView]);

  const handlePick = (id: string | number) => onSound?.(String(id));
  const selectedIds = useMemo(() => (selectedItem ? [sampleId(selectedItem)] : []), [selectedItem]);

  // THE PUCK FLIES THE VIEWER, and this is the only place that decides whether a
  // frame is fit to fly: `puckFlyable()` (spaceMouse.ts) — moving AND not stale.
  // The viewer flies what it is sent and stops when frames stop coming, so a
  // frame this loop declines is a camera that stops, never one that runs on.
  const fly = useRef<((f: { x: number; y: number; z: number; yaw: number; pitch: number; roll: number }) => void) | null>(null);
  useEffect(() => {
    let raf = 0;
    const tick = () => {
      raf = requestAnimationFrame(tick);
      if (!puckFlyable()) return;
      const f = puck.frame;
      fly.current?.({ x: f.x, y: f.y, z: f.z, yaw: f.yaw, pitch: f.pitch, roll: f.roll });
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  // The selected record's stored peak map — the EYE ring paints it the instant a point
  // is picked, before (or without) any audio decode.
  const eyePreview = useMemo(() => {
    const pv = selectedItem ? decodePreview(selectedItem) : null;
    return pv ? previewShimSamples(pv) : null;
  }, [selectedItem]);

  // Resolve the selected sample's URL for the EYE overlay's ring decode. This is a
  // second blob URL over the same bytes the footer plays — ours to revoke on change.
  // THE PUCK, AND WHETHER IT IS STILL THERE.
  //
  // Frames do not come through state — see spaceMouse.ts — but presence does,
  // because presence changes twice and a camera moves twenty times a second.
  // The badge exists for the Last Will: a probe that dies flips its retained
  // status to offline, and a viewport that says nothing about it is a viewport
  // showing a plausible frozen picture of a puck nobody is holding.
  const [puckStatus, setPuckStatus] = useState<PuckStatus | null>(null);
  useEffect(() => receivePuck(setPuckStatus), []);

  // AND WHETHER WHAT IT SAYS ABOUT ITSELF IS KNOWN TO BE TRUE.
  //
  // The frame the producer publishes — +X right, +Y forward, +Z up — is a
  // declaration until a hand has been on a real puck. `senseWarning` holds the
  // rule (spaceMouse.ts); this is the branch that obeys it. It was a suffix on a
  // `title=` attribute, which is a notice nobody has ever read: the camera flew
  // on six possibly-inverted axes and the only trace was eleven characters
  // behind a hover. PLAN-394.01.
  const senseNotice = senseWarning(puckStatus);

  // AND WHETHER THERE IS A PUCK ON THIS BENCH AT ALL.
  //
  // Three states, not two. `online` and `offline` are the producer's words; the
  // third is that no probe has ever spoken on this branch, which is the state
  // MOST benches are in and the one that used to be drawn as nothing at all —
  // this badge waited on a status that was never coming, forever. An
  // absent-hardware path that renders blank is indistinguishable from a relay
  // that failed to start, so it is said, quietly: no warning colour, no fault
  // wording, because a bench with no 3D mouse on it is not broken. PLAN-393.03.
  const noPuck = puckAbsent(puckStatus);

  // AND WHETHER THE PRODUCER IS STILL SAYING ANYTHING AT ALL.
  //
  // The third path onto this badge, and the one with no producer word behind it:
  // `SpaceMouseFly` stops flying when frames stop arriving with a deflection
  // held (PLAN-625.01), and until PLAN-901.01 it did that in complete silence —
  // the status still said `online`, no Last Will had fired, and the badge below
  // went on saying `puck on <host>` in the lit colour while the camera refused
  // to move. A hand on the puck and nothing happening was indistinguishable
  // from an unplugged puck, an unconfirmed sense, and a bug.
  //
  // FRAMES STILL DO NOT BECOME RENDERS. This is a poll, not a subscription, and
  // it is armed off the window rather than run always:
  //
  //   - The window comes from what the PRODUCER advertised, through
  //     `staleWindowFor` — the same derivation the render loop uses, so the two
  //     cannot time out against different milliseconds. `stallPollMs` returns 0
  //     for an unbounded producer, so `heartbeat_s: 0` arms NO timer and can
  //     draw no notice. That is PLAN-625.01's third "must not be broken", made
  //     structural: there is nothing to forget to branch on.
  //   - It re-arms when the pacing changes, because `pacing` now rides on
  //     `PuckStatus` (React state) rather than only on the mutable `puck`
  //     singleton, which no effect can depend on. An operator turning the
  //     heartbeat off widens this to "never" on the next retained status.
  //   - It sets state only on a TRANSITION. `puckStale` is one subtraction and
  //     the functional update returns the identical boolean when nothing moved,
  //     so React bails out. Fresh -> stale is two renders, not twenty a second.
  //   - It does not mutate `puck` and it does not latch. `puckStale` stays the
  //     read-only test it was; recovery is the next frame moving `puck.at`,
  //     which this poll observes on its next tick with nothing to reset.
  const [puckStalled, setPuckStalled] = useState(false);
  const pollMs = stallPollMs(staleWindowFor(puckStatus?.pacing));
  const puckOnline = puckStatus?.state === 'online';
  useEffect(() => {
    // Disarmed: no advertised cadence, or a producer that has stopped/never
    // started. Clear any verdict we were holding rather than leaving a notice
    // standing over a status that has since explained itself.
    if (!pollMs || !puckOnline) {
      setPuckStalled(false);
      return;
    }
    const tick = () => setPuckStalled(prev => {
      const now = puckStale(Date.now());
      return now === prev ? prev : now;
    });
    tick();
    const timer = setInterval(tick, pollMs);
    return () => clearInterval(timer);
  }, [pollMs, puckOnline]);

  // The sentence, from the same place `senseWarning`'s comes from. Both are
  // qualifiers on the state rather than states of their own — see the badge.
  const stallNotice = stallWarning(puckStatus, puckStalled);

  // ONE AMBER FOR "QUALIFIED, NOT FAULTED", and both notices share it. A second
  // amber a shade off the first is the defect `PLAN-892.01` names in the network
  // display and `contracts/tokens/state.json` calls the harder half of its own
  // family — a colour copied NEARLY rather than wrongly. What separates these
  // two notices is what each one SAYS and the glyph in front of it, never the
  // tone, which is also the only reading a colour-blind operator has
  // (`PLAN-791.01`).
  const qualified = Boolean(senseNotice || stallNotice);

  const [eyeSrc, setEyeSrc] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const url = selectedItem ? await resolveAudioUrl(audioFiles, selectedItem) : null;
      if (cancelled) {
        if (url?.startsWith('blob:')) URL.revokeObjectURL(url);
        return;
      }
      setEyeSrc(prev => {
        if (prev?.startsWith('blob:') && prev !== url) URL.revokeObjectURL(prev);
        return url;
      });
    })();
    return () => { cancelled = true; };
  }, [selectedItem, audioFiles]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, width: '100%', height: '100%' }}>

      <section className="main-view glass-panel" style={{ margin: 0, padding: 0, overflow: 'hidden', flex: 1, position: 'relative' }}>
        <VizFrame
          page="3d"
          records={records}
          schema={schema}
          title="Scanalyzer — scoped samples"
          selectedIds={selectedIds}
          pulse={!!playing}
          onPick={handlePick}
          onView={saveCloudView}
          flyRef={fly}
        />




        {/* The puck, in all three of its states — and drawn in all three. It
            used to be `{puckStatus && …}`, which meant a bench with no puck
            drew nothing, forever, and could not be told from a shell whose
            relay never started. PLAN-393.03. */}
        <div
          style={{
            position: 'absolute', top: '4.4rem', left: '1rem', zIndex: 20,
            display: 'flex', alignItems: 'center', gap: '0.4rem',
            padding: '0.25rem 0.6rem', borderRadius: 4, fontSize: '0.75rem',
            border: `1px solid ${qualified ? STATE_KINDA : 'var(--border-color)'}`,
            /* The scrim is NOT the token's `kinda` tint and deliberately so. This
               badge floats over a moving 3D cloud, so it needs an opaque ground to
               stay readable against whatever is behind it; the token's tint is
               `--apk-state-kinda-tint` (12% amber), which over that canvas is no ground at all.
               47.73 dE from `kinda` — far outside the near-miss band — so it reads
               as a dark surface rather than as a fourth amber. */
            background: qualified ? 'rgba(90,60,0,0.75)' : 'rgba(0,0,0,0.55)',
            opacity: noPuck ? 0.6 : 1,
            color: puckStatus?.state === 'online' ? 'var(--text-primary)' : 'var(--text-secondary)',
          }}
          title={[
            noPuck
              ? 'No SpaceNavigator probe has published on this bench. The retained status topic is empty rather than offline, which is what a bench with no puck looks like — nothing has failed. Six axes are not available here.'
              : (puckStatus?.frame || 'Six axes relayed by the shell from the SpaceNavigator probe.'),
            senseNotice
              ? `Nobody has checked which way is push on this hardware. The camera is flying on a declared frame, so an axis may run backwards. Confirm it with: ${SENSE_CONFIRM_COMMAND}`
              : '',
            // Names the window it was measured against, because "not reporting"
            // without a number invites the reading that the puck is broken. It
            // is not: the producer advertised a cadence and has missed three of
            // them, which is a statement about the CHANNEL. And it says the
            // notice clears itself, rather than naming a command to run — no
            // command on this bench ends this condition. The one thing that does
            // is the next frame arriving.
            stallNotice && puckStatus
              ? `No frame has arrived for longer than this producer said it would go quiet: it advertised a heartbeat every ${puckStatus.pacing?.heartbeat_s}s, and three missed beats (${Math.round(staleWindowFor(puckStatus.pacing) / 100) / 10}s) is treated as stopped. The camera has stopped flying rather than keep integrating the last deflection — nothing is being invented on the puck's behalf. The status topic still says online and no Last Will has fired, so this is the relay or the network between ${puckStatus.host || 'the probe'} and this window, not the probe announcing anything. It clears itself the moment a frame arrives.`
              : '',
          ].filter(Boolean).join('\n\n')}
        >
          <span>🕹️</span>
          <span>
            {noPuck
              ? 'no puck on this bench'
              : puckStatus?.state === 'online'
                ? `puck on ${puckStatus.host}`
                : `puck gone${puckStatus?.host ? ` (${puckStatus.host})` : ''}`}
          </span>
          {/* Not a suffix. A flag that qualifies the convention and changes
              nothing on screen is indistinguishable from no flag.

              TWO of them now, and they compose rather than replacing the state:
              the badge keeps saying what the producer's retained status SAYS
              (`puck on <host>`) and the chips say what this consumer has
              CONCLUDED about it. Rewriting the state word on a stall would be
              publishing a status the producer never sent, which is the error
              `puckStale` refuses by name — a consumer may decline to fly a
              frame, it may not invent one. PLAN-901.01. */}
          {senseNotice && <PuckQualifier glyph="⚠" text={senseNotice} />}
          {stallNotice && <PuckQualifier glyph="⏸" text={stallNotice} />}
        </div>

        {/* EYE player — the selected sample's scrubbable radial waveform, overlaid
            bottom-right. Drives the shared footer audio, so ring, playhead and sound
            are one transport. */}
        {eyeSrc && selectedItem && (
          <div style={{ position: 'absolute', bottom: '0.75rem', right: '0.75rem', zIndex: 15 }}>
            <AudioEye
              src={eyeSrc}
              name={selectedItem.metadata?.name || ''}
              color={ucsColor(selectedItem.ucs?.category || '')}
              size={150}
              audioEl={eyeAudio}
              onTogglePlay={onEyePlay}
              autoPlay={false}
              previewSamples={eyePreview}
            />
          </div>
        )}
      </section>
    </div>
  );
}
