import type { FileItem } from '../../types';
import ImageTracer from 'imagetracerjs';
import { KNOBS_HIGH_DETAIL_PRESET } from '../../svgConverter';
import { apiUrl } from '../../apiBase';
import type { InspectionResult } from './types';
import { renderDxfPreview } from './preview';
import { viaBus } from '../../graphicsSuiteJob';
import { connectedClient } from '../../busLink';

/** Ask the Rust micro-API everything it can say about one file: the four image
 *  routes (with ImageTracer as the SVG fallback), the DOCX parser, or the DXF
 *  parser and renderer. A DXF render replaces the preview as soon as it lands.
 *  OCR and DXF text are written back onto `fileItem.ocrText`. */
export async function fetchAnalysis(fileItem: FileItem, isDocx: boolean, isDxf: boolean): Promise<InspectionResult> {
  let rustOcr: any = null;
  let rustAnalyzer: any = null;
  let rustSvg: any = null;
  let rustPhoto: any = null;
  let rustDocx: any = null;

  let rustDxf: any = null;

  const fileBytes = await fileItem.file.arrayBuffer();

  if (fileItem.isImage) {
    try {
      // OCR and to-svg are Worker-GRAPHICS_SUITE jobs when this page has a bus;
      // the micro-API answers them only where there is none (graphicsSuiteJob.ts).
      // analyze-image and photo-id have no worker op and stay HTTP.
      const post = (route: string) => fetch(apiUrl(route), { method: 'POST', body: fileBytes });
      const json = async (r: Response) => (r.ok ? r.json() : null);
      const [ocrBus, svgBus] = await Promise.all([
        viaBus(connectedClient, 'ocr', fileItem.file.name, fileBytes),
        viaBus(connectedClient, 'vectorize', fileItem.file.name, fileBytes),
      ]);
      const [ocrR, anR, svgR, photoR] = await Promise.all([
        ocrBus ?? post('/api/ocr').then(json),
        post('/api/analyze-image').then(json),
        svgBus ?? post('/api/to-svg').then(json),
        post('/api/photo-id').then(json),
      ]);

      rustOcr = ocrR;
      if (rustOcr && rustOcr.extracted_text) {
        fileItem.ocrText = rustOcr.extracted_text;
      }
      rustAnalyzer = anR;
      rustSvg = svgR;
      rustPhoto = photoR;
    } catch (err) {
      console.warn("Rust API offline, using partial local extraction", err);
    }

    if (!rustSvg || !rustSvg.path_count || rustSvg.path_count < 200) {
      try {
        const highDetailSvg = await new Promise<any>((resolve) => {
          const url = URL.createObjectURL(fileItem.file);
          ImageTracer.imageToSVG(
            url,
            (svgString: string) => {
              URL.revokeObjectURL(url);
              const pathMatches = svgString.match(/<path/g);
              resolve({
                svg_xml: svgString,
                path_count: pathMatches ? pathMatches.length : 0
              });
            },
            KNOBS_HIGH_DETAIL_PRESET
          );
        });
        if (highDetailSvg && highDetailSvg.path_count > 0) {
          rustSvg = highDetailSvg;
        }
      } catch (err) {
        console.warn("High detail ImageTracer error", err);
      }
    }
  } else if (isDocx) {
    try {
      const docxR = await fetch(apiUrl('/api/docx-parse'), { method: 'POST', body: fileBytes });
      if (docxR.ok) rustDocx = await docxR.json();
    } catch (err) {
      console.warn("DOCX parser offline", err);
    }
  } else if (isDxf) {
    try {
      const [dxfParseR, dxfRenderR] = await Promise.all([
        fetch(apiUrl('/api/dxf-parse'), { method: 'POST', body: fileBytes }),
        fetch(apiUrl('/api/dxf-render'), { method: 'POST', body: fileBytes })
      ]);

      if (dxfParseR.ok) {
        rustDxf = await dxfParseR.json();
        if (rustDxf && rustDxf.extracted_text && rustDxf.extracted_text.length > 0) {
          fileItem.ocrText = rustDxf.extracted_text.join('\n');
        }
      }

      if (dxfRenderR.ok) {
        const dxfData = await dxfRenderR.json();
        if (dxfData.png_base64) {
          renderDxfPreview(fileItem, dxfData.png_base64);
        }
      }
    } catch (err) {
      console.warn("DXF parser or renderer offline", err);
    }
  }

  return { rustOcr, rustAnalyzer, rustSvg, rustPhoto, rustDocx, rustDxf };
}
