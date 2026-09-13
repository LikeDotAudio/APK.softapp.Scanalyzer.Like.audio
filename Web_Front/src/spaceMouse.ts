// Part of the APK.audio project — http://APK.audio — made by Anthony Kuzub
// MIT Licence. Free, for everyone, for ever. Full text in LICENSE at the root.
// THE PUCK, ARRIVING FROM THE SHELL.
//
// A 3Dconnexion SpaceNavigator publishes six axes on the APK.audio bus. This
// build has no bus client in it and is not getting one: it runs inside an
// iframe whose parent already holds the connection, and a second connection
// would be a second thing to authenticate and a second thing to reconnect. So
// APK:OS/Scanalyzer/puck/relay-puck-to-cloud.js subscribes and posts frames
// inward on the same `{ apkos: 'scanalyzer', … }` channel the sample hand-off
// uses (see soloWindow.ts).
//
// WHAT ARRIVES, AND WHAT IS NOT DECIDED HERE. `unit` is the six axes already
// normalised to −1..1 and already shaped — deadband, curve, sensitivity,
// smoothing and per-axis invert are applied ONCE, at the producer, so that
// every subscribing surface gets the same feel. Nothing in this file re-shapes
// them; re-smoothing a coalesced beat is lag, and re-deciding a sign is how
// four consumers become four different pucks.
//
// The convention arrives with the status rather than being written down here:
// right-handed, +X right, +Y forward (away from the operator), +Z up, and the
// producer says so on its retained topic. `senseConfirmed` is false until a
// hand has been on a real puck — the frame is a decision, the mapping of raw
// counts onto it is a measurement.

export interface PuckFrame {
  x: number; y: number; z: number;
  pitch: number; roll: number; yaw: number;
}

/**
 * THE TWO FACTS THAT QUALIFY A FRAME, named once and shared, because they are
 * carried on two objects for two different readers and they are one idea.
 *
 * This interface is the reason the qualification cannot be tidied away. `puck`
 * below carries it for the render loop and `PuckStatus` carries it for React,
 * and both say so by naming this type rather than by repeating two properties —
 * so deleting either field from either object is a compile error, and deleting
 * the field from HERE breaks `senseWarning`, which `CloudTab` calls to draw the
 * notice. Written-and-never-read and deliberately-reachable look identical to a
 * lint sweep, a bundle-size pass and a session tidying an unfamiliar file; a
 * comment is a defence against a careful reader and none at all against those.
 * PLAN-501.01, carved by PLAN-432.01 for exactly that reason.
 */
export interface FrameQualification {
  /** True while a probe is publishing; false the moment its Last Will fires. */
  online: boolean;
  /** False until somebody has confirmed which way is push against real hardware. */
  senseConfirmed: boolean;
}

export interface PuckStatus extends FrameQualification {
  /** 'online' while a probe is publishing; 'offline' the moment its Last Will fires. */
  state: string;
  /** The producer's own statement of the frame, for display. */
  frame: string;
  host: string;
  /**
   * THE PRODUCER'S DECLARED CADENCE, forwarded to React rather than kept in the
   * render loop — `PuckPacing` below, and `null` when the producer did not say.
   *
   * It reaches React for one reason that is not "a surface might want it": a
   * consumer drawing the stall has to RE-ARM when the pacing changes, and the
   * pacing is live settings (an operator turning the heartbeat off in the
   * SpaceMouse window must widen the window to "never" on the next retained
   * status, not on the next page load — see `receivePuck`). `puck.staleAfterMs`
   * already carries the resolved number, but it is a field on a mutable
   * singleton, and a `useEffect` cannot depend on one: nothing re-runs when it
   * changes. Carrying `pacing` on the object React re-renders from is what makes
   * the re-arm happen at all. PLAN-901.01.
   *
   * `relay-puck-to-cloud.js` forwards the group on `puck-status` AND on the
   * `ready` replay, so a window opened late gets it too.
   */
  pacing: PuckPacing | null;
}

/**
 * THE THIRD STATE, AND THE ONLY ONE MOST BENCHES ARE EVER IN.
 *
 * The producer's retained `status` says `online` or `offline`, and a bench with
 * no SpaceNavigator on it says NEITHER — the topic is empty rather than
 * `offline`, permanently and correctly, because a Last Will only fires for a
 * probe that connected once. `relay-puck-to-cloud.js` mints this word for that
 * case and answers the `ready` handshake with it; nothing publishes it, and
 * nothing may (PLAN-393.03).
 *
 * It is a `const` here and a `const` there rather than a string typed twice:
 * `check.sh hid-declaration` reads both and fails when they disagree, which is
 * what stops the relay saying one word while the surface it feeds branches on
 * another.
 */
export const PUCK_ABSENT = 'absent';

/**
 * Is there no puck on this bench, as opposed to one that has died?
 *
 * `null` counts, and that is the point of taking it: a surface that has heard
 * nothing at all is in the same state as one that has been told so, and the
 * difference between them is a race with the relay's startup rather than a
 * difference in what is true. What must NOT happen is either of them being
 * drawn as `offline` — a probe that ran and died is a fault somebody can act on,
 * and a bench that never had a puck is not.
 */
export function puckAbsent(status: PuckStatus | null): boolean {
  return !status || status.state === PUCK_ABSENT;
}

/**
 * THE RULE FOR AN UNCONFIRMED FRAME, stated once because there will be more than
 * one surface flying this puck — the schematic canvas and the CAD elevations are
 * already named as candidates in `relay-puck-to-cloud.js`.
 *
 * The rule is FLY, AND SAY SO — not refuse, and not stay quiet. It was taken
 * deliberately by PLAN-394.01 and the reasoning is worth carrying next to the
 * code that enforces it:
 *
 *   - REFUSING was available. What an unconfirmed sense costs *this* consumer is
 *     a camera that moves the opposite way from the hand, which the operator sees
 *     in one second and no equipment suffers. Refusing would make the puck inert
 *     on every bench in the tree, because `sense_confirmed` is false everywhere
 *     until somebody puts a hand on one, and inert-with-a-tooltip teaches nobody.
 *   - DELETING the flag was available and is the thing this rule exists to
 *     prevent. Six consumers flying regardless, with nothing on screen, IS the
 *     deleted flag — arrived at by default rather than by decision.
 *
 * So an unconfirmed frame is drawn, loudly, and the notice names the one command
 * that ends the condition. What must NOT happen is a consumer correcting a sign
 * locally: a wrong sense is fixed once, by `invert` on one axis in the producer's
 * retained config, for every subscriber at once. A consumer that compensates for
 * itself is how the convention dies (PLAN-368.01).
 *
 * Returns null when there is nothing to say — no status, a confirmed sense, or a
 * puck that is not online and therefore is not flying anything.
 *
 * It takes the QUALIFICATION rather than the whole status, which is the narrower
 * of the two things it could take and the one that matters: `puck` satisfies it
 * as well as `PuckStatus` does, so a surface that later chooses to refuse an
 * unverified frame asks this function from inside its own render loop instead of
 * reimplementing the rule against two bare booleans. That is reachability, not
 * behaviour — nothing here calls it with `puck`, and the rule in force is still
 * fly-and-say-so (PLAN-394.01).
 */
export function senseWarning(q: FrameQualification | null): string | null {
  if (!q || q.senseConfirmed) return null;
  if (!q.online) return null;
  return 'sense unverified';
}

/** What ends the condition — a hand on the puck, not a setting. */
export const SENSE_CONFIRM_COMMAND = 'spacenavigator_probe.py --confirm-sense';

/**
 * THE PRODUCER HAS GONE QUIET AND THE CAMERA HAS STOPPED — SAY SO.
 *
 * The peer of `senseWarning`, and deliberately the same shape: it takes the
 * qualification, it returns a SENTENCE or null, and the surface decides how to
 * draw it. Two notices written as a pair is what stops a third surface inventing
 * a third grammar for them.
 *
 * WHY THIS IS DRAWN AT ALL, since PLAN-625.01 declined to decide it and
 * PLAN-901.01 had to. Three things in this tree already answer it:
 *
 *   - `senseWarning` above states the rule for its own flag: a condition that
 *     changes behaviour "with nothing on screen, IS the deleted flag — arrived
 *     at by default rather than by decision" (PLAN-394.01). The stale guard is
 *     that shape exactly. It stops the camera and says nothing.
 *   - `puckAbsent` states it for the third state: an absent-hardware path that
 *     "renders blank is indistinguishable from a relay that failed to start"
 *     (PLAN-393.03). A stall is WORSE than blank, because the badge does not go
 *     blank — it keeps saying `puck on <host>` in the lit colour. The status is
 *     still `online`, no Last Will has fired, and the screen makes a positive
 *     claim that the puck is there and fine while the loop has decided not to
 *     fly it.
 *   - `due_heartbeat()` in `spacenavigator_probe.py` says what the heartbeat is
 *     FOR: "a frame is owed even with nothing moving, so a subscriber can tell a
 *     still puck from a dead one without also subscribing to status." Telling
 *     those apart is the whole purchase of PLAN-694.01, and leaving it undrawn
 *     spends it on nothing.
 *
 * IT IS NOT GATED ON `puck.moving`, and that was the near miss. The obvious
 * reading is that only a HELD deflection matters — that is the runaway
 * PLAN-625.01 stopped — so a stall with the hand off the puck needs no notice.
 * The docstring above refutes it: the heartbeat fires unconditionally at rest
 * (`due_heartbeat` is a clock test on `published_at`, with no `moving` term), so
 * a healthy idle producer keeps the stamp fresh and a dead relay goes stale at
 * rest exactly as it does under a push. Gating on `moving` would therefore stay
 * silent in the case the operator is most likely to meet first: a puck that was
 * never going to answer the next push, on a bench that looks fine.
 *
 * `stale` is passed IN rather than read here. `puckStale` reads the mutable
 * `puck` singleton, and a function that reaches into it could not be reasoned
 * about from React nor tested without one — so the render loop's object stays
 * the render loop's, and the caller that already owns a clock passes the verdict.
 *
 * Returns null when there is nothing to say: no status, a fresh producer, or a
 * puck that is not online. The last is the important one — an ANNOUNCED death
 * already has its own words (`puck gone`, and `receivePuck` zeroes the frame),
 * and a stall notice on top of it would report the same absence twice in two
 * vocabularies. This is only ever the death nobody announced.
 */
export function stallWarning(q: FrameQualification | null, stale: boolean): string | null {
  if (!q || !q.online) return null;
  if (!stale) return null;
  return 'not reporting';
}

/**
 * HOW OFTEN A DRAWING SURFACE SHOULD ASK `puckStale`, derived from the window it
 * is asking about rather than typed — the same rule `staleWindowFor` follows and
 * for the same reason.
 *
 * A sixth of the window: late by at most ~17% of a window that is already three
 * missed beats wide, which against the producer's default (`heartbeat_s: 2`, so
 * a 6 s window) is a 1 s poll and at most 1 s of lateness on a notice about a
 * 6 s silence. Deriving it rather than typing 500 ms is what keeps a slow
 * producer cheap: `heartbeat_s: 60` is a 180 s window and gets a 30 s poll, not
 * 360 needless wakeups.
 *
 * The floor is 250 ms so that a producer advertising an absurdly tight cadence
 * cannot talk a consumer into a spin. Zero in means zero out, and zero out means
 * DO NOT POLL AT ALL — an unbounded producer has no staleness to draw, and a
 * notice that appeared anyway would be a lie. That is PLAN-625.01's third
 * "must not be broken", and it is structural here rather than a branch somebody
 * has to remember: with no window there is no timer to arm.
 */
export function stallPollMs(staleAfterMs: number): number {
  if (!(staleAfterMs > 0)) return 0;
  return Math.max(250, Math.round(staleAfterMs / 6));
}

/**
 * THE PRODUCER'S DECLARED CADENCE — the `pacing` group off the retained status,
 * which is what decides whether this consumer is allowed to time out at all.
 *
 * Every field is optional because it arrives off a wire whose producer may be
 * older than this reader. `relay-puck-to-cloud.js` forwards the group whole and
 * forwards `null` when the status did not carry one, deliberately: a producer
 * too old to declare its pacing has not thereby promised a heartbeat, and the
 * relay refuses to guess a cadence on its behalf. That `null` is load-bearing
 * here — see `staleWindowFor`.
 */
export interface PuckPacing {
  /** The rate the producer COALESCES at. Not a promise that anything is sent. */
  rate_hz?: number;
  /** 'on_change' or 'every_beat'. */
  when?: string;
  /** Seconds between forced frames with nothing moving. 0 is off. */
  heartbeat_s?: number;
}

/**
 * HOW MANY MISSED BEATS BEFORE SILENCE IS ALLOWED TO MEAN DEATH.
 *
 * Three, and the number is taken from this tree rather than invented. It is the
 * slack `Multiviewer/tile/draw-graph-tile.js` allows a feed before calling it
 * stale, and that is the one house rule of the same SHAPE as this one: measured
 * against the feed's OWN declared rate rather than typed as an absolute.
 * (`DataBus/ledger/bus-ledger.js` allows six and says why — it was three, and a
 * missed beat on a busy box blinked an agent out of a list. That is the looser
 * number bought for the harsher consequence.)
 *
 * Three is the right end of that pair HERE because being wrong is cheap in
 * exactly one direction. A false stale deletes nothing and latches nothing:
 * `puckStale` is a read-only test inside the render loop, so the very next
 * frame — the next heartbeat, or the next millimetre of hand movement — resumes
 * the flight with no state to reset. A false positive costs one paused camera
 * for at most one beat. A false negative is the runaway this plan exists to
 * stop. Telemetry ships at QoS 0 (`bus.telemetry_qos` defaults to "0"), so what
 * the slack is actually buying is two consecutive lost beats, and three buys it.
 */
export const PUCK_STALE_BEATS = 3;

/**
 * The staleness window in milliseconds, derived from what the producer SAID —
 * and 0, meaning NEVER TIME OUT, whenever it did not say enough to be timed out
 * against.
 *
 * THIS IS NOT A CONSTANT, AND THE FIRST DRAFT OF IT WAS ONE. A hardcoded
 * 250 ms was written for this guard on 2026-09-07 and reverted before it
 * reached a commit, because under `when: 'on_change'` with `heartbeat_s: 0` a
 * held deflection publishes ONE frame and then legitimately says nothing, with
 * no upper bound — measured on the real puck at /dev/input/event9 as 1 frame in
 * 10.06 s while a deflection was held. A 250 ms window would have cut that push
 * and left it cut until the hand jittered. Against an unbounded producer EVERY
 * window is wrong, so an unbounded producer gets none: that is the `return 0`
 * below, and it is the whole reason PLAN-694.01 had to land before this could.
 *
 * It is derived from `heartbeat_s` and NOT from `rate_hz`. `rate_hz` is the rate
 * the producer's loop COALESCES at — how often it LOOKS, not how often the topic
 * SPEAKS — and reading it as a delivery promise is the precise mistake that
 * blocked this plan for a day. It enters only as a floor, because nothing can
 * promise frames faster than it samples them.
 *
 * `when: 'every_beat'` is deliberately not given a tighter window of its own.
 * It would derive one at 3/20 Hz = 150 ms, which is inside the jitter of an
 * MQTT hop plus a `postMessage` into an iframe, and a hair-trigger recreated
 * from the producer's settings is the same defect as a hair-trigger typed here.
 * `heartbeat_s` keeps its default of 2 under `every_beat` — the settings UI only
 * hides the field, it does not clear it — so that path is covered by the same
 * window, from the looser end.
 */
export function staleWindowFor(pacing: PuckPacing | null | undefined): number {
  if (!pacing) return 0;
  const beat = Number(pacing.heartbeat_s);
  // 0 is 'off', and it was the producer's default until PLAN-694.01. An absent,
  // malformed or negative value is treated identically, which is the safe
  // direction: no window at all rather than a window nobody promised.
  if (!Number.isFinite(beat) || beat <= 0) return 0;
  const rate = Number(pacing.rate_hz);
  const period = Number.isFinite(rate) && rate > 0 ? 1 / rate : 0;
  return Math.max(beat, period) * 1000 * PUCK_STALE_BEATS;
}

const ZERO: PuckFrame = { x: 0, y: 0, z: 0, pitch: 0, roll: 0, yaw: 0 };

const AXES: (keyof PuckFrame)[] = ['x', 'y', 'z', 'pitch', 'roll', 'yaw'];

function clamp(value: unknown): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return n < -1 ? -1 : n > 1 ? 1 : n;
}

/**
 * The last frame the shell relayed, held in a mutable object rather than in
 * React state.
 *
 * A puck at 20 Hz through `useState` is twenty renders a second of a component
 * tree holding a WebGL scene, to move a camera that is redrawn on its own
 * animation frame anyway. The render loop reads this object; React is told only
 * when the puck arrives or goes away, which is twice.
 *
 * The qualification rides here as well as on `PuckStatus`, and that is not a
 * duplicate. Status goes to React, frames go to this object, and the loop that
 * applies the six axes only ever sees this object — so without it the code doing
 * the flying cannot tell whether the frame it is flying has ever been checked
 * against a hand. It is written twice in a session, not per frame, so it costs
 * the render loop nothing.
 *
 * It is spelled `& FrameQualification` rather than as two more properties on
 * purpose: the annotation is what makes the fields load-bearing to `tsc -b`, and
 * `tsc -b` is what `check.sh scan-web` runs. Two bare booleans nobody reads are
 * indistinguishable from dead code and were deleted clean by an experiment on
 * 2026-09-06; the named type is not.
 *
 * It qualifies the axes; it does not gate them. The rule in force is the one
 * `senseWarning` states — fly, and say so. A surface that later chooses to
 * refuse passes `puck` to `senseWarning` from inside its own loop; nothing here
 * decides that for it, and nothing here may flip a sign (see above).
 */
export const puck: {
  frame: PuckFrame;
  /**
   * WHAT THE PRODUCER LAST SAID ABOUT THE HAND — and it STAYS TRUE WHILE STALE,
   * which is a decision (PLAN-901.01, step 4) and not an oversight.
   *
   * `moving` is a PRODUCER FACT: the last thing the probe said about its own
   * axes. Staleness is a CONSUMER VERDICT: this side's conclusion, drawn from a
   * clock, that the producer has stopped saying anything. They are orthogonal,
   * and collapsing them into this one field would destroy the only thing that
   * separates "the hand came off" from "the wire died with the hand on" — the
   * former arrives as a real zero frame (`due_zero()` in the probe), the latter
   * arrives as nothing at all. `receivePuck` clears this on `offline` because
   * there the producer ANNOUNCED the death and the last deflection is known to
   * be dead; nobody announced a stall, so clearing it here would be inventing
   * telemetry — the error `puckStale` below refuses by name.
   *
   * So a reader must ask BOTH, and the pairing is the contract: `moving` is
   * "was it deflected", `!puckStale(now)` is "is that still worth believing".
   * A consumer that flies on `moving` alone is the runaway PLAN-625.01 stopped.
   */
  moving: boolean;
  at: number;
  staleAfterMs: number;
} & FrameQualification = {
  frame: { ...ZERO },
  moving: false,
  at: 0,
  // The producer's cadence, resolved to one number, refreshed on every status.
  // 0 until a status arrives carrying a `pacing` group that promises a beat —
  // and 0 means the loop never times out. See `staleWindowFor`.
  staleAfterMs: 0,
  online: false,
  senseConfirmed: false,
};

/**
 * HAS THE PRODUCER GONE QUIET FOR LONGER THAN IT SAID IT WOULD?
 *
 * This is the reader of `puck.at`, and it lives in this file rather than in the
 * render loop that calls it so the stamp and the only thing that reads it are
 * one screen apart. `puck.at` spent its whole life written-and-never-read, which
 * is what carved PLAN-625.01; a reader in somebody else's file is how it quietly
 * goes back to being that.
 *
 * Three properties, each a decision the plan asked for by name:
 *
 *   - IT DOES NOT MUTATE. Stale means STOP, not ZERO — and that is the opposite
 *     of what `receivePuck` does below on `offline`, deliberately. Zeroing is
 *     right for the ANNOUNCED death: the producer said it was gone, so the last
 *     deflection is known to be dead and throwing it away is honest. This is the
 *     UNANNOUNCED one. The producer never said anything, and a consumer that
 *     manufactures the zero frame it did not send is inventing telemetry — the
 *     same family of error as a consumer flipping a sign for itself
 *     (PLAN-368.01). The zero-on-release frame is real and it belongs to the
 *     producer; it is `due_zero()` in `spacenavigator_probe.py`. A consumer may
 *     decline to FLY a frame. It may not INVENT one.
 *   - IT DOES NOT LATCH. There is no stale flag and nothing to clear. Recovery
 *     is simply the next frame moving `puck.at`, which makes this false again —
 *     and under `on_change` that frame is the next HEARTBEAT, carrying the held
 *     deflection in full, so a hand that never moved gets its push back without
 *     touching the puck.
 *   - IT DOES NOT RENDER. One subtraction against a mutable object, called from
 *     `useFrame`, nowhere near React state — the rule this file and
 *     `CloudTab.tsx` both argue at length, and the first thing PLAN-625.01 says
 *     must not be broken.
 *
 * `now` is passed in rather than read here so the caller pays for one
 * `Date.now()` per frame and the function stays pure enough to reason about.
 */
export function puckStale(now: number): boolean {
  // No window means the producer never promised a cadence, so silence means
  // nothing and there is nothing to time out. See `staleWindowFor`.
  if (puck.staleAfterMs <= 0) return false;
  // `at === 0` is "no frame has ever arrived", which is not staleness — there is
  // nothing yet to go stale, and `moving` is false anyway.
  if (puck.at <= 0) return false;
  return now - puck.at > puck.staleAfterMs;
}

/**
 * MAY THIS FRAME BE FLOWN? The pairing, as one thing to call.
 *
 * `puck.moving` and `!puckStale(now)` are the contract and the JSDoc on
 * `moving` says so, but a comment is a defence against a careful reader and
 * none at all against the other kind — this file says that about a different
 * field two hundred lines up. A second surface that reads `moving` and flies is
 * the runaway PLAN-625.01 stopped, and it would typecheck and lint. So the
 * pairing is exported as one call, and `puck-flyable.test.mjs` refuses a source
 * outside this module that reads `moving` without it. PLAN-901.02.
 *
 * IT COSTS NOTHING ON AN IDLE BENCH, which is the objection that stopped
 * PLAN-901.01 from simply writing this. `SpaceMouseFly` short-circuited on
 * `if (!puck.moving) return;` BEFORE paying a `Date.now()`, and a naive
 * `puckFlyable(Date.now())` would read the clock every frame with nothing
 * deflected. The clock is therefore read HERE and only after `moving` has
 * already said yes — the same instruction order the hot path had, with the two
 * steps behind one name instead of in front of the caller.
 *
 * `now` STAYS OPTIONAL rather than absent. A caller already holding a timestamp
 * — a loop that stamps once and asks several questions of it — passes it and
 * gets the same answer the rest of that frame gets; `puckStale` keeps taking it
 * positionally for the same reason and is still exported, because a surface may
 * want to know it is stale without asking whether to fly.
 *
 * IT DOES NOT MUTATE AND IT DOES NOT RENDER, exactly like `puckStale`: it is
 * two boolean reads and one subtraction, safe in `useFrame`, nowhere near React
 * state.
 */
export function puckFlyable(now?: number): boolean {
  if (!puck.moving) return false;
  return !puckStale(now ?? Date.now());
}

/**
 * Listen for relayed puck frames.
 *
 * `onStatus` fires on the retained status and on the Last Will, which is the
 * whole reason the status is subscribed at all: a viewport that keeps flying on
 * a puck that has been unplugged shows a plausible frozen picture, and a
 * plausible frozen picture is worse than a blank one.
 */
export function receivePuck(onStatus: (status: PuckStatus | null) => void) {
  const onMessage = (event: MessageEvent) => {
    const data = event.data;
    if (!data || data.apkos !== 'scanalyzer') return;

    if (data.action === 'puck') {
      const unit = data.unit || {};
      const next = { ...ZERO };
      for (const axis of AXES) next[axis] = clamp(unit[axis]);
      puck.frame = next;
      puck.moving = Boolean(data.moving);
      // WHEN THIS FRAME ARRIVED. `puckStale` above is what reads it.
      //
      // The stamp is here for the one death nobody announces: the producer
      // lives, the hand holds a deflection, and the RELAY stops reaching this
      // iframe. No Last Will fires, no status says offline, `moving` stays
      // true, and `SpaceMouseFly` would integrate the last deflection for as
      // long as the page is open. The zeroing below defends the announced
      // death; this stamp and `puckStale` defend the unannounced one.
      //
      // It was written-and-never-read for as long as it existed, and that was
      // correct rather than an oversight: `spacenavigator_probe.py` shipped
      // `pacing.when: 'on_change'` with `heartbeat_s: 0`, so a steady
      // deflection published ONE frame and then legitimately said nothing —
      // `publish_telemetry` returns early on an unchanged state. A held push
      // and a dead channel were the same silence on this wire, and any window
      // picked against it cut the hold. What separates them is a heartbeat the
      // producer ADVERTISES, which is what PLAN-694.01 landed: `heartbeat_s`
      // moved 0 -> 2, the whole `pacing` group is on the retained status, and
      // `relay-puck-to-cloud.js` forwards it on `puck-status` and on the
      // `ready` replay. The window is derived from that and from nothing else.
      puck.at = Date.now();
      return;
    }

    if (data.action === 'puck-status') {
      const online = data.state === 'online';
      const senseConfirmed = data.senseConfirmed === true;
      if (!online) {
        // Not merely "stop moving": zero it, so a half-deflection the hand was
        // holding when the probe died does not keep integrating forever.
        puck.frame = { ...ZERO };
        puck.moving = false;
      }
      // Coerced `=== true` on purpose, here as on the status: a producer that
      // has stopped saying it has not thereby confirmed anything.
      puck.online = online;
      puck.senseConfirmed = senseConfirmed;
      // WHAT THE PRODUCER SAID ABOUT ITS OWN CADENCE, resolved to the one
      // number the render loop needs. Re-read on every status rather than once,
      // because the pacing is live settings: an operator turning the heartbeat
      // off in the SpaceMouse window must widen this consumer's window to
      // "never" on the next retained status, not on the next page load.
      //
      // Absent derives 0, and 0 is "never time out" — the same safe direction
      // the relay takes when it forwards `pacing` as null rather than guessing
      // a cadence. A producer that promises nothing is flown forever rather
      // than cut, which is the failure this guard is allowed to have.
      const pacing = (data.pacing as PuckPacing | null) || null;
      puck.staleAfterMs = staleWindowFor(pacing);
      onStatus({
        state: String(data.state || ''),
        frame: String(data.frame || ''),
        online,
        senseConfirmed,
        host: String(data.host || ''),
        // FORWARDED, not merely consumed. Until PLAN-901.01 the pacing was read
        // here, resolved into `puck.staleAfterMs` and dropped — so the guard had
        // its window and React could not have drawn the stall even if it decided
        // to, because the fact never left this closure. Passing the group itself
        // rather than the resolved number keeps ONE derivation of the window
        // (`staleWindowFor`), so the drawing surface and the render loop cannot
        // time out against two different milliseconds.
        pacing,
      });
    }
  };

  window.addEventListener('message', onMessage);
  return () => window.removeEventListener('message', onMessage);
}
