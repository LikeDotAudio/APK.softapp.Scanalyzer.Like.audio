// Part of the APK.audio project — http://APK.audio — made by Anthony Kuzub
// MIT Licence. Free, for everyone, for ever. Full text in LICENSE at the root.
// The percent-fill chip (../Pct.tsx) as a DOM node, for an APKTable cell: the
// same markup percent-fill.css defines, the clamp still percentFill.ts's.
import { percentChip, ratioChip } from '../../percentFill'

export function pctNode(arg: { value?: number | null; ratio?: number | null; title?: string }): HTMLElement {
  const chip = arg.ratio === undefined ? percentChip(arg.value) : ratioChip(arg.ratio)
  const s = document.createElement('span')
  s.className = chip.none ? 'apk-pct is-none' : 'apk-pct'
  s.style.setProperty('--pct', String(chip.fill))
  const t = chip.none ? (arg.title ?? 'no value') : arg.title
  if (t) s.title = t
  s.textContent = chip.text
  return s
}
