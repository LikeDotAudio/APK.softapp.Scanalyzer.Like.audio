// Types for scripts/ocr-assets.mjs, so vite.config.ts (tsconfig.node.json) type-checks.
import type { Plugin } from 'vite';

export const PINS: Readonly<Record<'tesseract.js' | 'tesseract.js-core' | '@tesseract.js-data/eng', string>>;
export function ocrAssetMap(): Record<string, string>;
export function checkPins(): void;
export function bundleUsesTesseract(bundle: Record<string, unknown>): boolean;
export function ocrAssetsPlugin(): Plugin;
