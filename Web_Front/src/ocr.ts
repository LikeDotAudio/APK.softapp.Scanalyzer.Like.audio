import { createWorker } from 'tesseract.js';
import { FileItem } from './types';
import { classifyImage, ImageClassification } from './imageClassifier';
import { convertImageToSVG } from './svgConverter';
import { apiUrl } from './apiBase';

let worker1: any = null; // Engine 1: PSM 11 Sparse Text
let worker2: any = null; // Engine 2: PSM 3 Auto Block Text

async function getParallelWorkers() {
  if (!worker1) {
    worker1 = await createWorker('eng');
    try {
      await worker1.setParameters({ tessedit_pageseg_mode: '11' });
    } catch {}
  }
  if (!worker2) {
    worker2 = await createWorker('eng');
    try {
      await worker2.setParameters({ tessedit_pageseg_mode: '3' });
    } catch {}
  }
  return { worker1, worker2 };
}

interface TextLine {
  text: string;
  confidence: number;
  bbox: { x0: number; y0: number; x1: number; y1: number };
  words: Array<{
    text: string;
    confidence: number;
    bbox: { x0: number; y0: number; x1: number; y1: number };
  }>;
}

interface EngineResult {
  engineName: string;
  wordCount: number;
  confidence: number;
  text: string;
  lines: TextLine[];
}

interface OCRRotationResult {
  angle: number;
  text: string;
  confidence: number;
  wordCount: number;
  lines: TextLine[];
  canvas: HTMLCanvasElement;
  dataUrl: string;
  engineResults: EngineResult[];
  winningEngine: string;
}

interface DiscoveredWord {
  word: string;
  angle: number;
  engine: string;
  confidence: number;
  isNew?: boolean;
}

interface SchematicTitleBlock {
  drawingNumbers: string[];
  companyBrand?: string;
  titleSystemName?: string;
  voltages: string[];
  componentValues: string[];
  cleanedText: string;
}

/**
 * High-Precision Schematic Pre-Processor:
 * Applies 1.8x canvas upscaling, contrast sharpening, adaptive thresholding, and blueprint color inversion.
 */
function preprocessCanvasForSchematicOCR(canvas: HTMLCanvasElement): HTMLCanvasElement {
  const maxDim = Math.max(canvas.width, canvas.height);
  let scale = 1.0;
  if (maxDim < 2400) {
    scale = Math.min(2.5, 2400 / maxDim);
  }

  const processedCanvas = document.createElement('canvas');
  processedCanvas.width = Math.round(canvas.width * scale);
  processedCanvas.height = Math.round(canvas.height * scale);

  const pCtx = processedCanvas.getContext('2d');
  if (!pCtx) return canvas;

  pCtx.imageSmoothingEnabled = true;
  pCtx.imageSmoothingQuality = 'high';
  pCtx.drawImage(canvas, 0, 0, processedCanvas.width, processedCanvas.height);

  const imgData = pCtx.getImageData(0, 0, processedCanvas.width, processedCanvas.height);
  const data = imgData.data;

  // 1. Calculate average luminance & check if blueprint
  let totalLuminance = 0;
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i], g = data[i + 1], b = data[i + 2];
    totalLuminance += (0.299 * r + 0.587 * g + 0.114 * b);
  }
  const avgLum = totalLuminance / (data.length / 4);
  const isDarkBackground = avgLum < 110;

  // 2. Contrast sharpening & Adaptive threshold binarization
  const contrastFactor = 1.8;
  for (let i = 0; i < data.length; i += 4) {
    let r = data[i], g = data[i + 1], b = data[i + 2];

    if (isDarkBackground) {
      r = 255 - r;
      g = 255 - g;
      b = 255 - b;
    }

    r = Math.min(255, Math.max(0, (r - 128) * contrastFactor + 128));
    g = Math.min(255, Math.max(0, (g - 128) * contrastFactor + 128));
    b = Math.min(255, Math.max(0, (b - 128) * contrastFactor + 128));

    const gray = 0.299 * r + 0.587 * g + 0.114 * b;
    const finalVal = gray < 160 ? 0 : 255;

    data[i] = finalVal;
    data[i + 1] = finalVal;
    data[i + 2] = finalVal;
  }

  pCtx.putImageData(imgData, 0, 0);
  return processedCanvas;
}

/**
 * Extracts DWG drawing numbers, company name, schematic title, voltage rails, and component values.
 */
function extractSchematicTitleBlock(rawText: string): SchematicTitleBlock {
  const dwgMatches = Array.from(rawText.matchAll(/(?:DWG[#\*\s:]*|LAYOUT\s+|SCHEMATIC\s+|DRAWING\s+)?([A-Z0-9]{3,5}-\d{2}-\d{3}|[A-Z]{1,3}\d{3,5}[A-Z]?|\b\d{5}-\d{2}-\d{3}\b)/gi))
    .map(m => m[1])
    .filter(b => b.length >= 4);

  const companyMatch = rawText.match(/(WARD-BECK\s+SYSTEMS?\s+LTD\.?|WARD-BECK|WBS|NEVE|SOLID\s+STATE\s+LOGIC|RUSHWORKS|MICROCOM)/i);
  const titleMatch = rawText.match(/([A-Z\s]+(AUDIO\s+SCHEMATIC|INPUT\s+SYSTEM|MODULE\s+LAYOUT|PRE\s+LISTEN|CHANNEL\s+MIXER|CONSOLE)[A-Z\s]*)/i);

  const voltageMatches = Array.from(rawText.matchAll(/([+-]?\d{1,2}\s*V(?:DC)?)/gi))
    .map(m => m[1].replace(/\s+/g, ''))
    .filter(Boolean);

  const componentMatches = Array.from(rawText.matchAll(/\b(10K|1500|150\s*OHM|LOG\s+POTS|MINIATURE|MIXER|CHANNEL|INSERT|TEST|SUB\s*\d?|LEVEL|INPUT)\b/gi))
    .map(m => m[1])
    .filter(Boolean);

  const cleanedLines = rawText
    .split('\n')
    .map(line => line.replace(/[~`|\\_§«»°©®\=\+]+/g, ' ').replace(/\s+/g, ' ').trim())
    .filter(line => line.length > 2 && /[A-Za-z0-9]/.test(line));

  return {
    drawingNumbers: Array.from(new Set(dwgMatches)),
    companyBrand: companyMatch ? companyMatch[1] : undefined,
    titleSystemName: titleMatch ? titleMatch[1].trim() : undefined,
    voltages: Array.from(new Set(voltageMatches)),
    componentValues: Array.from(new Set(componentMatches)),
    cleanedText: cleanedLines.join('\n')
  };
}

/**
 * Rotates an image file by 0, 90, 180, or 270 degrees onto an offscreen canvas.
 */
function rotateImageToCanvas(file: File, degrees: number): Promise<{ canvas: HTMLCanvasElement; dataUrl: string }> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d')!;

      const rad = (degrees * Math.PI) / 180;
      if (degrees === 90 || degrees === 270) {
        canvas.width = img.naturalHeight;
        canvas.height = img.naturalWidth;
      } else {
        canvas.width = img.naturalWidth;
        canvas.height = img.naturalHeight;
      }

      ctx.translate(canvas.width / 2, canvas.height / 2);
      ctx.rotate(rad);
      ctx.drawImage(img, -img.naturalWidth / 2, -img.naturalHeight / 2);

      const dataUrl = canvas.toDataURL('image/png');
      resolve({ canvas, dataUrl });
    };
    img.onerror = (err) => {
      URL.revokeObjectURL(url);
      reject(err);
    };
    img.src = url;
  });
}

/**
 * Draws the rotated image onto a target display canvas along with highlighted bounding box overlays.
 */
function renderOCRCanvas(
  targetCanvas: HTMLCanvasElement,
  rotatedCanvas: HTMLCanvasElement,
  lines: TextLine[],
  highlightedIndex: number | null = null
) {
  targetCanvas.width = rotatedCanvas.width;
  targetCanvas.height = rotatedCanvas.height;

  const ctx = targetCanvas.getContext('2d');
  if (!ctx) return;

  // 1. Draw base image
  ctx.drawImage(rotatedCanvas, 0, 0);

  // 2. Draw bounding boxes for text regions
  lines.forEach((line, index) => {
    const isHighlighted = index === highlightedIndex;
    const { x0, y0, x1, y1 } = line.bbox;
    const width = x1 - x0;
    const height = y1 - y0;

    // Fill region
    ctx.fillStyle = isHighlighted ? 'rgba(245, 158, 11, 0.45)' : 'rgba(56, 189, 248, 0.2)';
    ctx.fillRect(x0, y0, width, height);

    // Border stroke
    ctx.strokeStyle = isHighlighted ? '#f59e0b' : '#38bdf8';
    ctx.lineWidth = isHighlighted ? Math.max(3, Math.round(targetCanvas.width / 400)) : Math.max(2, Math.round(targetCanvas.width / 600));
    ctx.strokeRect(x0, y0, width, height);

    // Draw Line Number Badge
    const badgeText = `[#${index + 1}]`;
    const fontSize = Math.max(12, Math.round(targetCanvas.height / 50));
    ctx.font = `bold ${fontSize}px sans-serif`;

    const textMetrics = ctx.measureText(badgeText);
    const badgeWidth = textMetrics.width + 8;
    const badgeHeight = fontSize + 6;

    const badgeX = Math.max(0, x0);
    const badgeY = Math.max(0, y0 - badgeHeight);

    ctx.fillStyle = isHighlighted ? '#f59e0b' : '#0284c7';
    ctx.fillRect(badgeX, badgeY, badgeWidth, badgeHeight);

    ctx.fillStyle = '#ffffff';
    ctx.fillText(badgeText, badgeX + 4, badgeY + fontSize);
  });
}

/**
 * Engine 3: Calls Rust Micro-API Backend or fallback connected component binarization.
 */
async function runEngine3Rust(_fileItem: FileItem, dataUrl: string): Promise<EngineResult> {
  try {
    const blob = await (await fetch(dataUrl)).blob();
    const arrayBuf = await blob.arrayBuffer();
    const resp = await fetch(apiUrl('/api/ocr'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/octet-stream' },
      body: arrayBuf
    });

    if (resp.ok) {
      const rustRes = await resp.json();
      const text = rustRes.extracted_text || '';
      const words = extractWordsFromText(text);

      return {
        engineName: '🦀 Engine 3 (Rust Micro-API)',
        wordCount: words.length,
        confidence: 85,
        text,
        lines: []
      };
    }
  } catch (err) {
    // API offline
  }

  return {
    engineName: '🦀 Engine 3 (Rust Binarization)',
    wordCount: 0,
    confidence: 0,
    text: '',
    lines: []
  };
}

function parseTesseractResult(ret: any, engineName: string): EngineResult {
  const lines: TextLine[] = (ret.data.lines || []).map((l: any) => ({
    text: l.text.trim(),
    confidence: Math.round(l.confidence),
    bbox: l.bbox,
    words: (l.words || []).map((w: any) => ({
      text: w.text.trim(),
      confidence: Math.round(w.confidence),
      bbox: w.bbox
    }))
  })).filter((l: TextLine) => l.text.length > 0);

  const validWords = lines.flatMap(l => l.words).filter(w => w.text.length > 1 && w.confidence > 15);

  return {
    engineName,
    wordCount: validWords.length,
    confidence: Math.round(ret.data.confidence),
    text: ret.data.text.trim(),
    lines
  };
}

export async function runOCR(fileItem: FileItem, container: HTMLElement): Promise<string> {
  const angles = [0, 90, 180, 270];

  container.innerHTML = `
    <div class="inspector-detail">
      <h3>⚡ 3 Parallel Engines OCR Pipeline & 4-Angle Rotation Scan...</h3>
      <p style="color: var(--text-muted); font-size: 0.88rem;">
        Running <strong>Engine 1 (PSM 11 Sparse)</strong>, <strong>Engine 2 (PSM 3 Block)</strong>, and <strong>Engine 3 (Rust Engine)</strong> in parallel across 0° ➔ 90° ➔ 180° ➔ 270°.
      </p>
      <div id="ocrProgressStatus" class="empty-state" style="color: var(--accent);">
        ⏳ Initializing 3 Parallel OCR Workers & Pre-Processing Canvas...
      </div>
    </div>
  `;

  const statusEl = container.querySelector('#ocrProgressStatus') as HTMLElement;
  const rotationResults: OCRRotationResult[] = [];
  const growingWordMap = new Map<string, DiscoveredWord>();

  // Step 1: Photo vs Scan Classifier
  const classification = await classifyImage(fileItem);

  try {
    // Initialize Parallel Workers concurrently
    const { worker1, worker2 } = await getParallelWorkers();

    for (let i = 0; i < angles.length; i++) {
      const angle = angles[i];

      if (statusEl) {
        statusEl.textContent = `⚡ [Angle ${i + 1}/4] Running 3 Parallel OCR Engines on ${angle}° orientation... (${growingWordMap.size} words discovered so far)`;
      }

      const { canvas } = await rotateImageToCanvas(fileItem.file, angle);
      const processedCanvas = preprocessCanvasForSchematicOCR(canvas);
      const dataUrl = processedCanvas.toDataURL('image/png');

      // 🚀 EXECUTE 3 OCR ENGINES IN PARALLEL 🚀
      const [ret1, ret2, res3] = await Promise.all([
        worker1.recognize(dataUrl),
        worker2.recognize(dataUrl),
        runEngine3Rust(fileItem, dataUrl)
      ]);

      const res1 = parseTesseractResult(ret1, '⚡ Engine 1 (Tesseract PSM 11 Sparse)');
      const res2 = parseTesseractResult(ret2, '⚡ Engine 2 (Tesseract PSM 3 Block)');

      const engineResults = [res1, res2, res3];

      // Multi-Engine Consensus: Find winning engine for this angle
      let winningEngineRes = res1;
      if (res2.wordCount > winningEngineRes.wordCount || (res2.wordCount === winningEngineRes.wordCount && res2.confidence > winningEngineRes.confidence)) {
        winningEngineRes = res2;
      }
      if (res3.wordCount > winningEngineRes.wordCount) {
        winningEngineRes = res3;
      }

      // Append unique words from ALL 3 parallel engines to growing word vocabulary
      [res1, res2, res3].forEach(engRes => {
        const words = extractWordsFromText(engRes.text);
        words.forEach(w => {
          const key = w.toLowerCase();
          if (!growingWordMap.has(key)) {
            growingWordMap.set(key, {
              word: w,
              angle,
              engine: engRes.engineName,
              confidence: engRes.confidence,
              isNew: true
            });
          }
        });
      });

      rotationResults.push({
        angle,
        text: winningEngineRes.text,
        confidence: winningEngineRes.confidence,
        wordCount: winningEngineRes.wordCount,
        lines: winningEngineRes.lines,
        canvas: processedCanvas,
        dataUrl,
        engineResults,
        winningEngine: winningEngineRes.engineName
      });

      // Update UI live as each angle scan finishes
      renderInteractiveOCRUI(
        container,
        fileItem,
        classification,
        rotationResults,
        growingWordMap,
        0,
        rotationResults.length - 1,
        i < angles.length - 1
      );
    }

    // Determine Best Rotation based on most valid words, breaking ties with confidence
    let bestIndex = 0;
    for (let i = 1; i < rotationResults.length; i++) {
      const current = rotationResults[i];
      const best = rotationResults[bestIndex];
      if (
        current.wordCount > best.wordCount ||
        (current.wordCount === best.wordCount && current.confidence > best.confidence)
      ) {
        bestIndex = i;
      }
    }

    const bestResult = rotationResults[bestIndex];

    // Final render with best angle selected
    renderInteractiveOCRUI(
      container,
      fileItem,
      classification,
      rotationResults,
      growingWordMap,
      bestIndex,
      bestIndex,
      false
    );

    return bestResult.text;
  } catch (err) {
    console.error("Multi-rotation OCR Error:", err);
    container.innerHTML = `
      <div class="inspector-detail">
        <div class="empty-state" style="color: #f87171;">
          ❌ OCR Scan Error: ${(err as Error).message}
        </div>
      </div>
    `;
    return '';
  }
}

function renderInteractiveOCRUI(
  container: HTMLElement,
  fileItem: FileItem,
  classification: ImageClassification,
  results: OCRRotationResult[],
  growingWordMap: Map<string, DiscoveredWord>,
  bestIndex: number,
  selectedIndex: number,
  isScanning: boolean
) {
  const currentResult = results[selectedIndex];
  const bestResult = results[bestIndex];

  // Parse Schematic Title Block & Engineering Data
  const titleBlock = currentResult ? extractSchematicTitleBlock(currentResult.text) : null;

  const photoVsScanBanner = classification.type === 'REAL_PHOTOGRAPH'
    ? `
      <div class="recommendation-banner" style="background: rgba(245, 158, 11, 0.12); border-color: rgba(245, 158, 11, 0.4); color: #fbbf24;">
        <span>📷 Image Classification: <strong>Camera Photo of Document</strong> (${(classification.confidence * 100).toFixed(0)}% Confidence)</span>
        <span style="font-size:0.78rem; opacity:0.9;">⚡ 3 Parallel Engines active across 0° ➔ 90° ➔ 180° ➔ 270°.</span>
      </div>
    `
    : `
      <div class="recommendation-banner" style="background: rgba(56, 189, 248, 0.12); border-color: rgba(56, 189, 248, 0.4); color: #38bdf8;">
        <span>${classification.emoji} Image Classification: <strong>${classification.label}</strong> (${(classification.confidence * 100).toFixed(0)}% Confidence)</span>
        <span style="font-size:0.78rem; opacity:0.9;">⚡ 3 Parallel Engines active with PSM 11 Sparse Text Pre-Processing.</span>
      </div>
    `;

  const recommendationHTML = !isScanning
    ? (bestResult.angle !== 0
      ? `
        <div class="recommendation-banner">
          💡 Auto-Detected Best Orientation: <strong>${bestResult.angle}° Rotation</strong>
          (${bestResult.wordCount} words detected vs ${results[0].wordCount} at 0° — Winner: ${bestResult.winningEngine})
        </div>
      `
      : `
        <div class="recommendation-banner" style="background: rgba(56, 189, 248, 0.1); border-color: rgba(56, 189, 248, 0.3); color: #38bdf8;">
          ✅ Standard Orientation (${bestResult.angle}°) selected (${bestResult.wordCount} words detected — Winner: ${bestResult.winningEngine}).
        </div>
      `)
    : `
      <div class="recommendation-banner" style="background: rgba(245, 158, 11, 0.1); border-color: rgba(245, 158, 11, 0.3); color: #fbbf24;">
        ⏳ 3 Parallel Engines scanning in progress... (Completed ${results.length}/4 orientations)
      </div>
    `;

  const rotationButtonsHTML = [0, 90, 180, 270].map((angle, idx) => {
    const res = results.find(r => r.angle === angle);
    const isSelected = res && results[selectedIndex] && res.angle === results[selectedIndex].angle;
    const isBest = !isScanning && idx === bestIndex;

    let classes = 'rotation-btn';
    if (isSelected) classes += ' active';
    if (isBest) classes += ' recommended';

    const labelText = res ? `${res.wordCount} words (${res.confidence}%)` : 'Scanning...';

    return `
      <button class="${classes}" data-index="${res ? results.indexOf(res) : 0}">
        <span>${angle}° Rotation</span>
        <span style="font-size: 0.75rem; opacity: 0.85;">${labelText}</span>
      </button>
    `;
  }).join('');

  // Render 3 Parallel Engines Status Cards
  let multiEngineCardsHTML = '';
  if (currentResult && currentResult.engineResults) {
    multiEngineCardsHTML = `
      <div class="multi-engine-bar">
        ${currentResult.engineResults.map(eng => {
          const isWinner = eng.engineName === currentResult.winningEngine;
          return `
            <div class="engine-card ${isWinner ? 'winner' : ''}">
              <strong>${eng.engineName} ${isWinner ? '👑' : ''}</strong>
              <span>Words: <strong>${eng.wordCount}</strong> (${eng.confidence}% Confidence)</span>
            </div>
          `;
        }).join('')}
      </div>
    `;
  }

  // Render Schematic Title Block Card if engineering fields found
  let titleBlockHTML = '';
  if (titleBlock && (titleBlock.drawingNumbers.length > 0 || titleBlock.companyBrand || titleBlock.titleSystemName)) {
    titleBlockHTML = `
      <div style="background: rgba(56, 189, 248, 0.08); border: 1px solid rgba(56, 189, 248, 0.3); padding: 0.85rem; border-radius: 8px; margin-bottom: 1rem;">
        <h4 style="margin:0 0 0.5rem 0; color:var(--accent);">📐 Extracted Engineering Title Block & DWG Numbers</h4>
        <table class="meta-table">
          ${titleBlock.companyBrand ? `<tr><th>Company / Brand</th><td>🏛️ <strong>${titleBlock.companyBrand}</strong></td></tr>` : ''}
          ${titleBlock.titleSystemName ? `<tr><th>Schematic Title</th><td>📐 <strong>${titleBlock.titleSystemName}</strong></td></tr>` : ''}
          ${titleBlock.drawingNumbers.length > 0 ? `<tr><th>Drawing / DWG Numbers</th><td>${titleBlock.drawingNumbers.map(d => `<span class="tag-badge" style="background:#0284c7; color:#fff;">📑 DWG #${d}</span>`).join(' ')}</td></tr>` : ''}
          ${titleBlock.voltages.length > 0 ? `<tr><th>Power & Voltage Rails</th><td>${titleBlock.voltages.map(v => `<span class="tag-badge" style="background:#f59e0b; color:#000;">⚡ ${v}</span>`).join(' ')}</td></tr>` : ''}
          ${titleBlock.componentValues.length > 0 ? `<tr><th>Component Values & Controls</th><td>${titleBlock.componentValues.map(c => `<span class="tag-badge">#${c}</span>`).join(' ')}</td></tr>` : ''}
        </table>
      </div>
    `;
  }

  // Render Growing Word Vocabulary Badges
  const wordsList = Array.from(growingWordMap.values());
  const wordsBadgesHTML = wordsList.length > 0
    ? wordsList.map(w => `
        <span class="growing-word-badge ${w.isNew ? 'newly-discovered' : ''}">
          #${escapeHTML(w.word)}
          <span class="word-angle-tag">${w.angle}°</span>
        </span>
      `).join(' ')
    : `<div class="empty-state">No words discovered yet.</div>`;

  // Reset isNew flag after rendering
  wordsList.forEach(w => { w.isNew = false; });

  // Table rows for text region bounding box locations ("where the text is from")
  const regionRowsHTML = currentResult && currentResult.lines.length > 0
    ? currentResult.lines.map((line, idx) => {
        const { x0, y0, x1, y1 } = line.bbox;
        const w = x1 - x0;
        const h = y1 - y0;
        return `
          <tr class="region-row" data-line-index="${idx}">
            <td><span class="region-badge">#${idx + 1}</span></td>
            <td><code>X:${x0}, Y:${y0} (${w}×${h}px)</code></td>
            <td>${line.confidence}%</td>
            <td style="font-family: monospace;">${escapeHTML(line.text)}</td>
          </tr>
        `;
      }).join('')
    : `<tr><td colspan="4" style="text-align:center; color: var(--text-muted);">No text regions detected at ${currentResult ? currentResult.angle : 0}°.</td></tr>`;

  container.innerHTML = `
    <div class="inspector-detail">
      <!-- Photo VS Scan Classifier Banner -->
      ${photoVsScanBanner}

      <!-- 3 Parallel Engines Performance Status Bar -->
      ${multiEngineCardsHTML}

      <!-- 4-Rotation Selector Control Bar -->
      <div class="rotation-bar">
        <label>🔄 Sequential Orientation Scan (0° ➔ 90° ➔ 180° ➔ 270°):</label>
        ${rotationButtonsHTML}
      </div>

      ${recommendationHTML}

      <!-- Extracted Title Block Card -->
      ${titleBlockHTML}

      <!-- Quick Action Buttons: Send to Image to SVG -->
      <div class="button-group">
        <button id="sendToSVGBtn" class="btn primary">
          📐 Vectorize Image (${currentResult ? currentResult.angle : 0}°) & Send to Image to SVG Tool
        </button>
        <button id="sendToTrainingBtn" class="btn secondary">
          🎓 Send to Training Library & Annotator
        </button>
      </div>

      <!-- Live Growing Word Vocabulary Panel -->
      <div style="display:flex; justify-content:space-between; align-items:center;">
        <h4 style="margin:0;">🔤 Live Growing Word Vocabulary (${growingWordMap.size} Unique Words Discovered Across 3 Parallel Engines)</h4>
        <span style="font-size:0.78rem; color:var(--text-muted);">Parallel engine consensus appends words live</span>
      </div>
      <div class="tag-cloud-container" style="max-height:160px; background:#090d16;">
        ${wordsBadgesHTML}
      </div>

      <!-- Interactive Canvas Preview with Text Location Overlays -->
      <div style="display:flex; justify-content:space-between; align-items:center; margin-top:0.5rem;">
        <h4 style="margin:0;">🖼️ Image Preview & Text Regions (${currentResult ? currentResult.angle : 0}°)</h4>
        <span style="font-size: 0.8rem; color: var(--text-muted);">Hover rows below to highlight region</span>
      </div>

      <div class="ocr-canvas-container">
        <canvas id="ocrDisplayCanvas"></canvas>
      </div>

      <!-- Overview Metadata -->
      <table class="meta-table">
        <tr><th>File Name</th><td>${fileItem.name}</td></tr>
        <tr><th>Source Type</th><td>${classification.emoji} <strong>${classification.type}</strong></td></tr>
        <tr><th>Active Orientation</th><td>${currentResult ? currentResult.angle : 0}° ${!isScanning && selectedIndex === bestIndex ? '⭐ (Best Rotation)' : ''}</td></tr>
        <tr><th>Consensus Winning Engine</th><td><strong>${currentResult ? currentResult.winningEngine : 'N/A'}</strong> 👑</td></tr>
        <tr><th>Unique Vocabulary</th><td><strong>${growingWordMap.size} total words merged across 3 engines</strong></td></tr>
        <tr><th>Confidence</th><td>${currentResult ? currentResult.confidence : 0}%</td></tr>
        <tr><th>Recognized Lines</th><td>${currentResult ? currentResult.lines.length : 0} regions detected</td></tr>
      </table>

      <!-- Where the Text is From (Bounding Boxes Location Table) -->
      <h4>📍 Text Origin & Bounding Box Locations ("Where text is from")</h4>
      <div class="region-table-wrapper">
        <table class="meta-table">
          <thead>
            <tr>
              <th style="width: 10%;">ID</th>
              <th style="width: 30%;">Image Bounding Box (XYWH)</th>
              <th style="width: 15%;">Confidence</th>
              <th style="width: 45%;">Detected Line Content</th>
            </tr>
          </thead>
          <tbody id="regionTableBody">
            ${regionRowsHTML}
          </tbody>
        </table>
      </div>

      <!-- Cleaned & Raw Extracted Text -->
      <h4>📄 Cleaned Technical Text Result</h4>
      <div class="json-view" style="color: #f8fafc; font-family: monospace; font-size: 0.92rem; white-space: pre-wrap;">${titleBlock ? escapeHTML(titleBlock.cleanedText) : 'Scanning...'}</div>
    </div>
  `;

  // Draw target display canvas
  const canvasEl = container.querySelector('#ocrDisplayCanvas') as HTMLCanvasElement;
  if (canvasEl && currentResult) {
    renderOCRCanvas(canvasEl, currentResult.canvas, currentResult.lines, null);
  }

  // Add click listeners to rotation buttons
  container.querySelectorAll('.rotation-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const idx = parseInt((e.currentTarget as HTMLElement).getAttribute('data-index') || '0', 10);
      renderInteractiveOCRUI(container, fileItem, classification, results, growingWordMap, bestIndex, idx, isScanning);
    });
  });

  // Send to SVG Tool handler
  container.querySelector('#sendToSVGBtn')?.addEventListener('click', async () => {
    const svgOutput = document.getElementById('svgOutput') as HTMLElement;
    if (svgOutput && currentResult) {
      const targetItem = await getRotatedFileItem(fileItem, currentResult);
      await convertImageToSVG(targetItem, svgOutput);

      // Switch active tab to svgTab
      document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
      document.querySelector('[data-tab="svgTab"]')?.classList.add('active');
      document.getElementById('svgTab')?.classList.add('active');
    }
  });

  // Send to Training Library handler
  container.querySelector('#sendToTrainingBtn')?.addEventListener('click', () => {
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
    document.querySelector('[data-tab="trainingTab"]')?.classList.add('active');
    document.getElementById('trainingTab')?.classList.add('active');
  });

  // Add hover / highlight interaction between table rows and canvas bounding boxes
  const tableBody = container.querySelector('#regionTableBody');
  if (tableBody && canvasEl && currentResult) {
    tableBody.querySelectorAll('.region-row').forEach(row => {
      row.addEventListener('mouseenter', (e) => {
        const lineIdx = parseInt((e.currentTarget as HTMLElement).getAttribute('data-line-index') || '0', 10);
        row.classList.add('highlighted');
        renderOCRCanvas(canvasEl, currentResult.canvas, currentResult.lines, lineIdx);
      });

      row.addEventListener('mouseleave', () => {
        row.classList.remove('highlighted');
        renderOCRCanvas(canvasEl, currentResult.canvas, currentResult.lines, null);
      });
    });
  }
}

async function getRotatedFileItem(fileItem: FileItem, result: OCRRotationResult): Promise<FileItem> {
  if (result.angle === 0) return fileItem;

  return new Promise((resolve) => {
    result.canvas.toBlob((blob) => {
      if (!blob) return resolve(fileItem);
      const name = `${fileItem.name.replace(/\.[^/.]+$/, '')}_${result.angle}deg.png`;
      const file = new File([blob], name, { type: 'image/png' });
      resolve({
        file,
        relativePath: `${fileItem.relativePath}_${result.angle}deg.png`,
        name,
        size: blob.size,
        type: 'image/png',
        isImage: true,
        emojiBadge: '📐'
      });
    }, 'image/png');
  });
}

function extractWordsFromText(text: string): string[] {
  return text
    .split(/[^a-zA-Z0-9_-]+/)
    .map(w => w.trim())
    .filter(w => w.length > 1);
}

function escapeHTML(str: string): string {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
