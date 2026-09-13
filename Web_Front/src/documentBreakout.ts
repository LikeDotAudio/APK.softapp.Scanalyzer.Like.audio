import * as pdfjsLib from 'pdfjs-dist';
import JSZip from 'jszip';

// Set up PDF.js worker URL
pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.mjs`;

export interface ExtractedImagePage {
  id: string;
  title: string;
  dataUrl: string;
  width: number;
  height: number;
  pageNum?: number;
  sourceType: 'pdf_page' | 'docx_image';
}

/**
 * Break out a DOCX file into all embedded media images (PNG, JPEG, GIF, SVG, BMP)
 */
export async function extractDocxImages(file: File): Promise<ExtractedImagePage[]> {
  const results: ExtractedImagePage[] = [];
  try {
    const arrayBuffer = await file.arrayBuffer();
    const zip = await JSZip.loadAsync(arrayBuffer);
    
    // Find all files in word/media/
    const mediaFiles = Object.keys(zip.files).filter(filename => 
      filename.startsWith('word/media/') && !zip.files[filename].dir
    );

    let idx = 1;
    for (const filename of mediaFiles) {
      const zipFile = zip.files[filename];
      const blob = await zipFile.async('blob');
      const base64Url = await blobToDataUrl(blob);

      // Measure dimensions
      const dims = await getImageDimensions(base64Url);

      const baseName = filename.split('/').pop() || `image_${idx}`;
      results.push({
        id: `docx_media_${idx}`,
        title: `🖼️ DOCX Media #${idx}: ${baseName}`,
        dataUrl: base64Url,
        width: dims.width,
        height: dims.height,
        sourceType: 'docx_image'
      });
      idx++;
    }
  } catch (err) {
    console.warn("Error extracting DOCX images via JSZip:", err);
  }
  return results;
}

/**
 * Break out a PDF file into individual page images rendered to canvas
 */
export async function extractPdfPagesAsImages(file: File, maxPages: number = 20): Promise<ExtractedImagePage[]> {
  const results: ExtractedImagePage[] = [];
  try {
    const arrayBuffer = await file.arrayBuffer();
    const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
    const pdf = await loadingTask.promise;

    const pageCount = Math.min(pdf.numPages, maxPages);

    for (let pageNum = 1; pageNum <= pageCount; pageNum++) {
      const page = await pdf.getPage(pageNum);
      const viewport = page.getViewport({ scale: 1.5 });

      const canvas = document.createElement('canvas');
      const context = canvas.getContext('2d');
      canvas.width = viewport.width;
      canvas.height = viewport.height;

      if (context) {
        await page.render({ canvasContext: context, canvas, viewport } as any).promise;
        const dataUrl = canvas.toDataURL('image/png');
        results.push({
          id: `pdf_page_${pageNum}`,
          title: `📄 PDF Page #${pageNum} of ${pdf.numPages}`,
          dataUrl,
          width: Math.round(viewport.width),
          height: Math.round(viewport.height),
          pageNum,
          sourceType: 'pdf_page'
        });
      }
    }
  } catch (err) {
    console.warn("Error breaking out PDF pages via PDF.js:", err);
  }
  return results;
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

function getImageDimensions(dataUrl: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve({ width: img.naturalWidth || img.width, height: img.naturalHeight || img.height });
    img.onerror = () => resolve({ width: 0, height: 0 });
    img.src = dataUrl;
  });
}
