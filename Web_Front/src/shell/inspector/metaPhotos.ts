import type { FileItem } from '../../types';
import type { ExtractedImagePage } from '../../documentBreakout';
import type { MetaPhoto } from './types';

/** Crop sub-area meta-photos out of an image: the title block, each face, the
 *  first three OCR word regions, and the four quadrants. */
export async function generateMetaPhotos(
  fileItem: FileItem,
  rustAnalyzer: any,
  rustPhoto: any,
  rustOcr: any
): Promise<MetaPhoto[]> {
  return new Promise((resolve) => {
    const img = new Image();
    const url = URL.createObjectURL(fileItem.file);
    img.onload = () => {
      const results: MetaPhoto[] = [];
      const naturalW = img.naturalWidth || img.width;
      const naturalH = img.naturalHeight || img.height;

      function crop(x: number, y: number, w: number, h: number, title: string) {
        const cropX = Math.max(0, Math.min(naturalW - 1, Math.round(x)));
        const cropY = Math.max(0, Math.min(naturalH - 1, Math.round(y)));
        const cropW = Math.max(1, Math.min(naturalW - cropX, Math.round(w)));
        const cropH = Math.max(1, Math.min(naturalH - cropY, Math.round(h)));

        if (cropW < 5 || cropH < 5) return;

        const canvas = document.createElement('canvas');
        canvas.width = Math.min(cropW, 2000);
        canvas.height = Math.min(cropH, 2000);
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(img, cropX, cropY, cropW, cropH, 0, 0, canvas.width, canvas.height);
          results.push({
            id: `meta_${results.length + 1}`,
            title,
            dataUrl: canvas.toDataURL('image/png'),
            width: cropW,
            height: cropH,
            x: cropX,
            y: cropY
          });
        }
      }

      // 1. Title Block Crop
      if (rustAnalyzer?.title_block?.found) {
        const tb = rustAnalyzer.title_block;
        crop(tb.x, tb.y, tb.width, tb.height, '📌 Title Block Crop');
      }

      // 2. Face Detection Crops
      const faceBoxes = rustPhoto?.face_detection?.face_boxes || [];
      faceBoxes.forEach((box: any, idx: number) => {
        crop(box.x, box.y, box.width, box.height, `👤 Face Crop #${idx + 1}`);
      });

      // 3. Top OCR / Text Region Crops
      const wordRegions = rustOcr?.word_regions || [];
      if (wordRegions.length > 0) {
        const significant = wordRegions.slice(0, 3);
        significant.forEach((w: any, idx: number) => {
          crop(w.x || 0, w.y || 0, w.width || 100, w.height || 40, `🔤 Text Crop #${idx + 1}: "${(w.text || '').slice(0, 12)}"`);
        });
      }

      // 4. Sub-Panel Quadrant Meta-Photos (Top-Left, Top-Right, Bottom-Left, Bottom-Right)
      const halfW = Math.floor(naturalW / 2);
      const halfH = Math.floor(naturalH / 2);
      if (halfW > 20 && halfH > 20) {
        crop(0, 0, halfW, halfH, '🎛️ Sub-Panel (Top-Left)');
        crop(halfW, 0, naturalW - halfW, halfH, '🎛️ Sub-Panel (Top-Right)');
        crop(0, halfH, halfW, naturalH - halfH, '🎛️ Sub-Panel (Bottom-Left)');
        crop(halfW, halfH, naturalW - halfW, naturalH - halfH, '🎛️ Sub-Panel (Bottom-Right)');
      }

      URL.revokeObjectURL(url);
      resolve(results);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      resolve([]);
    };
    img.src = url;
  });
}

/** The pages broken out of a PDF or DOCX, as meta-photos at the origin. */
export function breakoutPagesAsMetaPhotos(docBreakoutPages: ExtractedImagePage[]): MetaPhoto[] {
  return docBreakoutPages.map(p => ({
    id: p.id,
    title: p.title,
    dataUrl: p.dataUrl,
    width: p.width,
    height: p.height,
    x: 0,
    y: 0
  }));
}
