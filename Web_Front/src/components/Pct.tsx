// Part of the APK.audio project — http://APK.audio — made by Anthony Kuzub
// MIT Licence. Free, for everyone, for ever. Full text in LICENSE at the root.
/**
 * The percent-fill chip, as a component.
 *
 * It emits exactly the markup `percent-fill.css` defines and nothing more —
 * `<span class="apk-pct" style="--pct:57">57%</span>` — so the fill sits BEHIND
 * digits that were going to be there regardless and the chip is the same width
 * at 0% and at 100%. A column of these does not reflow as values arrive, and it
 * costs no width at all, which is the whole argument for retiring a separate
 * track beside a number.
 *
 * ONLY FOR A PART OF A BOUNDED WHOLE. A fill behind a number that cannot be
 * full is a lie; the CSS header lists the four measured counter-examples in this
 * repository. The test is not "does it end in %" — it is "is there a whole, and
 * is this a part of it".
 *
 * The clamp and the missing-value case are `percentFill.ts`'s and are not
 * re-derived here. PLAN-924.02.
 */
import { percentChip, ratioChip } from '../percentFill'

interface PctProps {
  /** A percentage, 0..100. Pass this or `ratio`, not both. */
  value?: number | null
  /** A ratio, 0..1 — converted here so the caller does not re-derive the clamp. */
  ratio?: number | null
  title?: string
}

export default function Pct({ value, ratio, title }: PctProps) {
  const chip = ratio === undefined ? percentChip(value) : ratioChip(ratio)
  return (
    <span
      className={chip.none ? 'apk-pct is-none' : 'apk-pct'}
      style={{ ['--pct' as string]: chip.fill }}
      title={chip.none ? (title ?? 'no value') : title}
    >
      {chip.text}
    </span>
  )
}
