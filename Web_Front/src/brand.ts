// Part of the APK.audio project — http://APK.audio — made by Anthony Kuzub
// MIT Licence. Free, for everyone, for ever. Full text in LICENSE at the root.
/** The brand accent, from the contract (root contracts/tokens/brand.json, through the
 *  vendored browser build in ./vendor/apk-contracts/, held to its source by
 *  `.apk.scripts/vendor_contract_web.py --check`). CSS reads the same value as
 *  `var(--apk-accent)` from the vendored apk-tokens.css; code that draws on a canvas
 *  or hands a colour to three.js takes it from here. Never spell the hex again
 *  (SDK audit WS-07). */
// @ts-expect-error TS7016 — untyped vendored ES module (a .d.ts beside it would fail the vendor check)
import { ACCENT as CONTRACT_ACCENT } from './vendor/apk-contracts/apk-contracts.mjs';

export const ACCENT: string = CONTRACT_ACCENT;
