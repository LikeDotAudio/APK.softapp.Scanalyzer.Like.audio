// Part of the APK.audio project — http://APK.audio — made by Anthony Kuzub
// MIT Licence. Free, for everyone, for ever. Full text in LICENSE at the root.
/**
 * The two decisions behind the percent-fill chip, for this bundle.
 *
 * `percent-fill.css` beside this file is the primitive and holds the argument;
 * `APK:OS/core/theme/percent-fill.js` is the reference emitter and this is its
 * twin, not a re-derivation. It is a `.ts` and not a `.tsx` on purpose: node
 * strips TypeScript natively, so `test/*.test.mjs` can import THIS FILE and
 * call the rule under test with nothing installed — which is the rung-1 shape
 * the whole `Web_Front/test` tree is built on, and JSX would put it out of
 * reach of it. `Pct.tsx` beside this is the markup and nothing else.
 *
 * - CLAMPED FOR THE FILL, HONEST IN THE TEXT. A value outside 0..100 still
 *   prints the number it was given; only the fill is clamped, because a track
 *   cannot be 120% full and the digits must not be quietly rewritten.
 * - NO DATA IS NOT ZERO. `null`, `undefined` and a non-finite number get the em
 *   dash and `.is-none`, never a 0% fill — a record analysed before a feature
 *   existed has no value, and a full-looking empty track claims a measurement
 *   nobody took. `SliceTable.tsx` was writing `(s.relative_level ?? 0) * 100`,
 *   which is that exact claim: a slice with no level drew a hard 0%.
 *
 * PLAN-924.02, extending PLAN-924.01.
 */

/** What a chip should draw for one value. */
export interface PercentChip {
  /** 0..100, clamped — what `--pct` is set to. `0` when there is no value. */
  fill: number
  /** What the reader sees. An em dash when there is no value. */
  text: string
  /** True when there is no value, which is not the same as zero. */
  none: boolean
}

const EM_DASH = '—'

/** A chip for a value already expressed as a PERCENTAGE (0..100). */
export function percentChip(percent: number | null | undefined): PercentChip {
  const n = Number(percent)
  if (percent === null || percent === undefined || !Number.isFinite(n)) {
    return { fill: 0, text: EM_DASH, none: true }
  }
  return { fill: Math.max(0, Math.min(100, n)), text: `${Math.round(n)}%`, none: false }
}

/**
 * The same chip for a value that arrives as a RATIO (0..1), which is how most
 * of this app's shares are computed — and the conversion is the step where a
 * caller would otherwise re-derive the clamp.
 */
export function ratioChip(ratio: number | null | undefined): PercentChip {
  const n = Number(ratio)
  if (ratio === null || ratio === undefined || !Number.isFinite(n)) return percentChip(null)
  return percentChip(n * 100)
}
