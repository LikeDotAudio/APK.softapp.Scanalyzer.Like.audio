import type { FileItem, ImageMetadata } from '../../../types';
import type { SidecarSet } from '../../../sidecars';
import type { InventoryRecord } from '../../inventory/store';
import { dxfCard, docxCard, pdfCard } from './documentCards';
import { inventoryCard } from './inventoryCard';
import { exifCard, fileTagsCard, sidecarCard, sidecarJsonCard } from './scanCards';
import { faceCard, metaPhotoCard, metricsCard, ocrCard, photoCard, svgCard, titleBlockCard } from './visionCards';

/** Everything the cards draw from, named as the inspector names it. */
export interface CardContext {
  fileItem: FileItem;
  isPdf: boolean;
  currentInspectedImgUrl: string;
  scanned: SidecarSet | undefined;
  storedFacts: Record<string, unknown> | null;
  storedOcrText: string;
  inventoryMatches: InventoryRecord[];
  fileTags: string[];
  metaPhotos: any[];
  meta: ImageMetadata;
  rustOcr: any;
  rustAnalyzer: any;
  rustSvg: any;
  rustPhoto: any;
  rustDocx: any;
  rustDxf: any;
}

/** The inspector column, card by card in reading order, then the hosts the
 *  two recovered per-file modules mount into. */
export function inspectorCardsHTML(ctx: CardContext): string {
  return `
    <!-- SIDECARS: WHAT THE SCAN WROTE BESIDE THIS FILE -->
    ${sidecarCard(ctx)}

    <!-- PDF DOCUMENT BREAKOUT CARD -->
    ${pdfCard(ctx)}

    <!-- INVENTORY MATCH (from whatever JSON /api/inventory serves) -->
    ${inventoryCard(ctx)}

    <!-- DXF VECTOR DRAWING DATA INSPECTOR CARD -->
    ${dxfCard(ctx)}
${fileTagsCard(ctx)}

    <!-- EXTRACTED SUB-AREA META-PHOTOS & CROPPED ASSETS -->
    ${metaPhotoCard(ctx)}

    <!-- FACE DETECTION, EXTRACTION & IDENTIFICATION / MATCHING -->
    ${faceCard(ctx)}

    <!-- SCHEMATIC TITLE BLOCK & ISOLATED OCR -->
    ${titleBlockCard(ctx)}

    <!-- IMAGE ANALYSIS & VISUAL TAGS -->
    ${metricsCard(ctx)}

    <!-- DOCX / WORD DOCUMENT CONTENT EXTRACTION -->
    ${docxCard(ctx)}

    <!-- OCR EXTRACTED TEXT -->
    ${ocrCard(ctx)}

    <!-- PHOTO IDENTIFIER -->
    ${photoCard(ctx)}

    <!-- SVG VECTOR CONVERSION -->
    ${svgCard(ctx)}

${exifCard(ctx)}

${sidecarJsonCard(ctx)}

    <!-- THE TWO PER-FILE RECOVERED MODULES - PLAN-925.03.
         initAnnotator and identifyPhotoAndWords each take one container and one
         FileItem, so unlike the three library renderers they need no new chrome:
         this column IS their surface, and it is already headed EVERYTHING About
         Selected File. They mount into their own cards below so a re-render of
         this pane replaces them with it rather than leaving two orphans behind.
         NO BACKTICKS IN THIS COMMENT: it lives inside a template literal, and a
         backtick here ends the string mid-markup. -->
    <div class="data-card" id="inspectorAnnotatorCard" style="border:1px solid #f59e0b;">
      <h4 style="color:#f59e0b;">✏️ ANNOTATOR</h4>
      <div id="inspectorAnnotatorHost"></div>
    </div>
    <div class="data-card" id="inspectorIdentifierCard" style="border:1px solid #38bdf8;">
      <h4 style="color:#38bdf8;">🔎 PHOTO &amp; WORD IDENTIFIER</h4>
      <div id="inspectorIdentifierHost"></div>
    </div>
  `;
}
