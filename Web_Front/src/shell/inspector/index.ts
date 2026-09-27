import type { FileItem } from '../../types';
import type { ExtractedImagePage } from '../../documentBreakout';
import { extractDocxImages, extractPdfPagesAsImages } from '../../documentBreakout';
import { extractImageMetadata } from '../../imageExtractor';
import { shell } from '../state';
import { els } from '../dom';
import { matchInventoryForFile } from '../inventory/match';
import { pushRecentSlideshow } from '../browse/slideshow';
import { renderVisualDocumentOverlays } from '../overlays/render';
import { renderBreakoutPages, renderInitialPreview } from './preview';
import { fetchAnalysis } from './fetchAnalysis';
import { breakoutPagesAsMetaPhotos, generateMetaPhotos } from './metaPhotos';
import { extractFilenameTags, readScanSidecars } from './cards/scanCards';
import { inspectorCardsHTML } from './cards';
import { bindInspector } from './bindings';

/** Inspect one file: preview it, ask the micro-API about it, break a document
 *  out into pages, crop meta-photos, and draw every card about it. */
export async function inspectFileItem(fileItem: FileItem) {
  // Push to recent 5-item slideshow
  pushRecentSlideshow(fileItem, inspectFileItem);
  shell.currentInspectedFileItem = fileItem;

  // 1. UPDATE LEFT 1/3 IMAGE PREVIEW
  const isPdf = fileItem.name.toLowerCase().endsWith('.pdf') || fileItem.type === 'application/pdf';
  renderInitialPreview(fileItem, isPdf);

  // 2. FETCH EVERYTHING ABOUT THE FILE FROM RUST MICRO-API
  els.masterInspectorContainer.innerHTML = `<div class="empty-state">Extracting OCR, EXIF, Image Analysis, SVG Vector, Face Detection, and Sidecar Tags...</div>`;

  const isDocx = fileItem.name.toLowerCase().endsWith('.docx') || fileItem.name.toLowerCase().endsWith('.doc');
  const isDxf = fileItem.name.toLowerCase().endsWith('.dxf');
  const analysis = await fetchAnalysis(fileItem, isDocx, isDxf);
  const { rustOcr, rustAnalyzer, rustSvg, rustPhoto } = analysis;

  let docBreakoutPages: ExtractedImagePage[] = [];
  if (isPdf) {
    docBreakoutPages = await extractPdfPagesAsImages(fileItem.file);
  } else if (isDocx) {
    docBreakoutPages = await extractDocxImages(fileItem.file);
  }

  renderBreakoutPages(fileItem, docBreakoutPages);

  shell.currentInspectedOcrData = rustOcr;
  shell.currentInspectedPhotoData = rustPhoto;
  shell.currentInspectedAnalyzerData = rustAnalyzer;
  shell.currentInspectedSvgData = rustSvg;

  if (fileItem.isImage) {
    renderVisualDocumentOverlays();
  }

  let metaPhotos: any[] = [];
  if (fileItem.isImage) {
    metaPhotos = await generateMetaPhotos(fileItem, rustAnalyzer, rustPhoto, rustOcr);
  } else if (docBreakoutPages.length > 0) {
    metaPhotos = breakoutPagesAsMetaPhotos(docBreakoutPages);
  }

  const meta = await extractImageMetadata(fileItem);
  const fileTags = extractFilenameTags(fileItem.name);

  // Cross-reference the optional inventory served by /api/inventory.
  const inventoryMatches = matchInventoryForFile(shell.manualInventory, fileItem);

  const { scanned, storedFacts, storedOcrText } = await readScanSidecars(fileItem);

  // Render Everything in Right Column
  els.masterInspectorContainer.innerHTML = inspectorCardsHTML({
    fileItem, isPdf, currentInspectedImgUrl: shell.currentInspectedImgUrl,
    scanned, storedFacts, storedOcrText, inventoryMatches, fileTags, metaPhotos, meta,
    ...analysis,
  });

  bindInspector(fileItem);
}
