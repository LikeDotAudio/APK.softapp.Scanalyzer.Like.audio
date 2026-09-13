import { FileItem } from './types';

export interface ImageClassification {
  type: 'SCHEMATIC_DIAGRAM' | 'REAL_PHOTOGRAPH' | 'TEXT_DOCUMENT' | 'VECTOR_ARTWORK';
  label: string;
  emoji: string;
  confidence: number;
  traits: string[];
  metrics: {
    uniqueColorBins: number;
    dominantColorPercent: number;
    grayscalePercent: number;
    edgeDensityPercent: number;
    avgLuminance: number;
    contrastStdDev: number;
  };
}

/**
 * High-Precision Client-Side Image Classifier:
 * Distinguishes between Schematic Diagrams / Blueprints vs Real Photographs vs Documents.
 */
export async function classifyImage(fileItem: FileItem): Promise<ImageClassification> {
  return new Promise((resolve) => {
    const img = new Image();
    const url = URL.createObjectURL(fileItem.file);

    img.onload = () => {
      URL.revokeObjectURL(url);

      const canvas = document.createElement('canvas');
      const sampleSize = 160; // 160x160 sample grid = 25,600 pixels
      canvas.width = sampleSize;
      canvas.height = sampleSize;

      const ctx = canvas.getContext('2d');
      if (!ctx) {
        return resolve(getDefaultClassification(fileItem.name));
      }

      ctx.drawImage(img, 0, 0, sampleSize, sampleSize);
      const imgData = ctx.getImageData(0, 0, sampleSize, sampleSize);
      const data = imgData.data;
      const totalPixels = sampleSize * sampleSize;

      const colorBins = new Map<number, number>();
      let grayscalePixels = 0;
      let totalLuminance = 0;
      let edgePixels = 0;

      const lumArray = new Float32Array(totalPixels);

      for (let i = 0; i < data.length; i += 4) {
        const r = data[i];
        const g = data[i + 1];
        const b = data[i + 2];
        const pixelIdx = i / 4;

        // Quantize RGB to 4-bit per channel (4096 possible color bins)
        const bin = ((r >> 4) << 8) | ((g >> 4) << 4) | (b >> 4);
        colorBins.set(bin, (colorBins.get(bin) || 0) + 1);

        // Calculate luminance
        const lum = 0.299 * r + 0.587 * g + 0.114 * b;
        lumArray[pixelIdx] = lum;
        totalLuminance += lum;

        // Check if grayscale / monochrome
        if (Math.abs(r - g) < 18 && Math.abs(g - b) < 18 && Math.abs(r - b) < 18) {
          grayscalePixels++;
        }
      }

      // Calculate dominant background color frequency
      let maxColorCount = 0;
      for (const count of colorBins.values()) {
        if (count > maxColorCount) maxColorCount = count;
      }

      const dominantColorPercent = (maxColorCount / totalPixels) * 100;
      const uniqueColorBins = colorBins.size;
      const grayscalePercent = (grayscalePixels / totalPixels) * 100;
      const avgLuminance = totalLuminance / totalPixels;

      // Calculate Contrast (Standard Deviation of Luminance) & Edge Density
      let lumVarianceSum = 0;
      for (let y = 0; y < sampleSize; y++) {
        for (let x = 0; x < sampleSize; x++) {
          const idx = y * sampleSize + x;
          const lum = lumArray[idx];
          lumVarianceSum += (lum - avgLuminance) * (lum - avgLuminance);

          // Horizontal edge detection
          if (x < sampleSize - 1) {
            const nextLum = lumArray[idx + 1];
            if (Math.abs(lum - nextLum) > 35) {
              edgePixels++;
            }
          }
        }
      }

      const contrastStdDev = Math.sqrt(lumVarianceSum / totalPixels);
      const edgeDensityPercent = (edgePixels / totalPixels) * 100;

      // Check schematic keywords in file name
      const filenameLower = fileItem.relativePath.toLowerCase();
      const schematicKeywords = ['dwg', 'schematic', 'diagram', 'circuit', 'layout', 'blueprint', 'trace', 'drawing', 'outline', 'knit', 'dwgs', 'iss', 'prelim', 't1202a', 'm480c', 'st2442', 'l3242a'];
      const hasSchematicKeyword = schematicKeywords.some(k => filenameLower.includes(k));

      // Scoring Matrix for Schematic vs Photo Classification
      let schematicScore = 0;
      let photoScore = 0;
      let docScore = 0;
      const traits: string[] = [];

      if (dominantColorPercent > 38) {
        schematicScore += 35;
        traits.push(`📐 High Background Uniformity (${dominantColorPercent.toFixed(1)}% dominant background)`);
      } else {
        photoScore += 25;
      }

      if (uniqueColorBins < 250) {
        schematicScore += 30;
        traits.push(`✏️ Low Palette Diversity (${uniqueColorBins} quantized color bins)`);
      } else if (uniqueColorBins > 450) {
        photoScore += 40;
        traits.push(`📷 Continuous Color Gradients (${uniqueColorBins} distinct color bins)`);
      }

      if (grayscalePercent > 70) {
        schematicScore += 25;
        docScore += 30;
        traits.push(`📄 High Monochrome Ratio (${grayscalePercent.toFixed(1)}% grayscale)`);
      } else {
        photoScore += 25;
        traits.push(`🎨 Rich Multi-Color Palette (${(100 - grayscalePercent).toFixed(1)}% color)`);
      }

      if (edgeDensityPercent > 10 && dominantColorPercent > 35) {
        schematicScore += 20;
        traits.push(`⚡ High Contrast Line Art & Wire Outlines`);
      }

      if (hasSchematicKeyword) {
        schematicScore += 35;
        traits.push(`🏷️ Technical Schematic File Naming Pattern`);
      }

      metricsSummary: {
        // Compile metrics object
      }

      const metrics = {
        uniqueColorBins,
        dominantColorPercent: parseFloat(dominantColorPercent.toFixed(1)),
        grayscalePercent: parseFloat(grayscalePercent.toFixed(1)),
        edgeDensityPercent: parseFloat(edgeDensityPercent.toFixed(1)),
        avgLuminance: parseFloat(avgLuminance.toFixed(1)),
        contrastStdDev: parseFloat(contrastStdDev.toFixed(1))
      };

      // Classification Verdict
      if (schematicScore > photoScore && schematicScore > docScore) {
        const confidence = Math.min(0.99, Math.max(0.65, schematicScore / 110));
        return resolve({
          type: 'SCHEMATIC_DIAGRAM',
          label: '📐 Technical Schematic / Circuit Diagram / Blueprint',
          emoji: '📐',
          confidence: parseFloat(confidence.toFixed(2)),
          traits,
          metrics
        });
      } else if (docScore > photoScore && docScore >= schematicScore) {
        const confidence = Math.min(0.98, Math.max(0.65, docScore / 100));
        return resolve({
          type: 'TEXT_DOCUMENT',
          label: '📑 Scanned Text Document / Specification Sheet',
          emoji: '📑',
          confidence: parseFloat(confidence.toFixed(2)),
          traits,
          metrics
        });
      } else {
        const confidence = Math.min(0.99, Math.max(0.65, photoScore / 100));
        return resolve({
          type: 'REAL_PHOTOGRAPH',
          label: '📷 Real Photograph / Natural Scene / Complex Photo',
          emoji: '📷',
          confidence: parseFloat(confidence.toFixed(2)),
          traits,
          metrics
        });
      }
    };

    img.onerror = () => {
      URL.revokeObjectURL(url);
      resolve(getDefaultClassification(fileItem.name));
    };

    img.src = url;
  });
}

function getDefaultClassification(_name: string): ImageClassification {
  return {
    type: 'REAL_PHOTOGRAPH',
    label: '📷 Image File',
    emoji: '🖼️',
    confidence: 0.5,
    traits: ['Standard Image File'],
    metrics: {
      uniqueColorBins: 0,
      dominantColorPercent: 0,
      grayscalePercent: 0,
      edgeDensityPercent: 0,
      avgLuminance: 0,
      contrastStdDev: 0
    }
  };
}
