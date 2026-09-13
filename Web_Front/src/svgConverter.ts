import ImageTracer from 'imagetracerjs';
import { FileItem } from './types';
import { formatBytes } from './tree';
import { runOCR } from './ocr';
import { analyzeImage } from './imageAnalyzer';

export const KNOBS_HIGH_DETAIL_PRESET = {
  ltres: 0.1,
  qtres: 0.1,
  pathomit: 2,
  rightangleenhance: true,
  colorsampling: 2,
  numberofcolors: 48,
  mincolorratio: 0.001,
  colorquantcycles: 4,
  blurradius: 0,
  blurdelta: 10
};

export async function convertImageToSVG(fileItem: FileItem, container: HTMLElement, customPreset?: any) {
  container.innerHTML = `
    <div class="inspector-detail">
      <h3>📐 High-Detail Vectorizing Image & Knob Features to SVG...</h3>
      <div class="empty-state">Tracing fine control knobs, dials, sliders, text labels & vector paths...</div>
    </div>
  `;

  const url = URL.createObjectURL(fileItem.file);
  const preset = customPreset || KNOBS_HIGH_DETAIL_PRESET;

  ImageTracer.imageToSVG(
    url,
    (svgString: string) => {
      URL.revokeObjectURL(url);
      renderSVGDataUI(container, fileItem, svgString, '🎛️ High-Detail Hardware Knob & Vector Tracer Engine');
    },
    preset
  );
}

function parseSVGData(svgString: string, originalSize: number) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(svgString, 'image/svg+xml');
  const svgEl = doc.querySelector('svg');

  const width = svgEl?.getAttribute('width') || (svgEl?.viewBox?.baseVal?.width ? `${svgEl.viewBox.baseVal.width}px` : 'Auto');
  const height = svgEl?.getAttribute('height') || (svgEl?.viewBox?.baseVal?.height ? `${svgEl.viewBox.baseVal.height}px` : 'Auto');
  const viewBox = svgEl?.getAttribute('viewBox') || '0 0 width height';

  const paths = doc.querySelectorAll('path');
  const polygons = doc.querySelectorAll('polygon');
  const rects = doc.querySelectorAll('rect');
  const circles = doc.querySelectorAll('circle, ellipse');
  const groups = doc.querySelectorAll('g');
  const allElements = doc.querySelectorAll('*');

  // Extract color palette
  const colorMap = new Set<string>();
  allElements.forEach(el => {
    const fill = el.getAttribute('fill');
    const stroke = el.getAttribute('stroke');
    if (fill && fill !== 'none' && fill !== 'transparent' && !fill.startsWith('url')) {
      colorMap.add(fill);
    }
    if (stroke && stroke !== 'none' && stroke !== 'transparent' && !stroke.startsWith('url')) {
      colorMap.add(stroke);
    }
  });

  const svgSizeBytes = new Blob([svgString]).size;
  const sizeRatioPercent = originalSize > 0 ? ((svgSizeBytes / originalSize) * 100).toFixed(1) : '100';

  return {
    width,
    height,
    viewBox,
    pathCount: paths.length,
    polygonCount: polygons.length,
    rectCount: rects.length,
    circleCount: circles.length,
    groupCount: groups.length,
    totalVectorNodes: allElements.length,
    colors: Array.from(colorMap),
    svgSizeBytes,
    sizeRatioPercent
  };
}

function renderSVGDataUI(container: HTMLElement, fileItem: FileItem, svgXml: string, engineName: string) {
  const svgData = parseSVGData(svgXml, fileItem.size);
  const blob = new Blob([svgXml], { type: 'image/svg+xml' });
  const svgUrl = URL.createObjectURL(blob);

  const colorSwatchesHTML = svgData.colors.length > 0
    ? svgData.colors.slice(0, 16).map(c => `
        <div class="color-swatch" style="background:${c}; font-size:0.68rem;" title="${c}">
          ${c}
        </div>
      `).join('')
    : '<span style="color: var(--text-muted); font-size:0.85rem;">Monochrome / Single Fill</span>';

  container.innerHTML = `
    <div class="inspector-detail">
      <!-- Controlled Size SVG Preview Box -->
      <div class="preview-box">
        ${svgXml}
      </div>

      <h3>${engineName} Data</h3>

      <!-- Inter-Tool Cross-Sending Action Bar -->
      <div class="inter-tool-bar">
        <label>⚡ Cross-Tool Data Pipeline: Send "${fileItem.name}" to another tool:</label>
        <div class="button-group">
          <button id="sendToOCRFromSVG" class="btn primary" style="font-size:0.78rem; padding:0.35rem 0.7rem;">
            🔤 Send to OCR Tool
          </button>
          <button id="sendToAnalyzerFromSVG" class="btn secondary" style="font-size:0.78rem; padding:0.35rem 0.7rem;">
            🎨 Send to Image Analyzer
          </button>
          <button id="sendToTrainingFromSVG" class="btn secondary" style="font-size:0.78rem; padding:0.35rem 0.7rem;">
            🎓 Send to Training Library
          </button>
        </div>
      </div>

      <!-- Interactive Action Buttons -->
      <div class="button-group" style="margin-top: 0.5rem;">
        <a href="${svgUrl}" download="${fileItem.name.replace(/\.[^/.]+$/, '')}.svg" class="btn primary">
          ⬇️ Download SVG Vector
        </a>
        <button id="copySVGCodeBtn" class="btn secondary">
          📋 Copy SVG Code
        </button>
        <button id="copySVGJSONBtn" class="btn secondary">
          💾 Copy Vector Data (JSON)
        </button>
      </div>

      <!-- Structured SVG Data Metrics -->
      <h4>📊 Vector Architecture & Metrics</h4>
      <table class="meta-table">
        <tr><th>Original Image File</th><td>${fileItem.name} (${formatBytes(fileItem.size)})</td></tr>
        <tr><th>Vector Output Size</th><td>${formatBytes(svgData.svgSizeBytes)} (${svgData.sizeRatioPercent}% of original size)</td></tr>
        <tr><th>Canvas ViewBox & Bounds</th><td><code>${svgData.viewBox}</code> (${svgData.width} × ${svgData.height})</td></tr>
        <tr><th>Vector Path Count (<code>&lt;path&gt;</code>)</th><td><strong>${svgData.pathCount.toLocaleString()} paths</strong></td></tr>
        <tr><th>Vector Elements</th><td>${svgData.totalVectorNodes.toLocaleString()} total nodes (${svgData.groupCount} groups, ${svgData.polygonCount} polygons, ${svgData.rectCount} rects, ${svgData.circleCount} circles)</td></tr>
        <tr><th>Color Palette Depth</th><td>${svgData.colors.length} unique vector colors</td></tr>
      </table>

      <!-- SVG Color Palette Swatches -->
      <h4>🎨 SVG Vector Palette Swatches</h4>
      <div class="palette-grid">
        ${colorSwatchesHTML}
      </div>

      <!-- SVG Code & Data View -->
      <div style="display:flex; justify-content:space-between; align-items:center;">
        <h4 style="margin:0;">📄 SVG Raw XML Code View</h4>
        <span id="copyStatusText" style="font-size:0.8rem; color:#22c55e; display:none;">✅ Copied to clipboard!</span>
      </div>
      <div class="json-view">${escapeHTML(svgXml.slice(0, 1500))}${svgXml.length > 1500 ? '\n... [truncated]' : ''}</div>
    </div>
  `;

  // Inter-tool Pipeline Handlers
  container.querySelector('#sendToOCRFromSVG')?.addEventListener('click', async () => {
    const ocrOutput = document.getElementById('ocrOutput') as HTMLElement;
    if (ocrOutput) {
      switchTab('ocrTab');
      await runOCR(fileItem, ocrOutput);
    }
  });

  container.querySelector('#sendToAnalyzerFromSVG')?.addEventListener('click', async () => {
    const analyzerOutput = document.getElementById('analyzerOutput') as HTMLElement;
    if (analyzerOutput) {
      switchTab('analyzerTab');
      await analyzeImage(fileItem, analyzerOutput);
    }
  });

  container.querySelector('#sendToTrainingFromSVG')?.addEventListener('click', () => {
    switchTab('trainingTab');
  });

  // Copy SVG Code handler
  container.querySelector('#copySVGCodeBtn')?.addEventListener('click', () => {
    navigator.clipboard.writeText(svgXml);
    showCopyStatus(container);
  });

  // Copy Vector Data JSON handler
  container.querySelector('#copySVGJSONBtn')?.addEventListener('click', () => {
    const jsonString = JSON.stringify(svgData, null, 2);
    navigator.clipboard.writeText(jsonString);
    showCopyStatus(container);
  });
}

function showCopyStatus(container: HTMLElement) {
  const statusEl = container.querySelector('#copyStatusText') as HTMLElement;
  if (statusEl) {
    statusEl.style.display = 'inline';
    setTimeout(() => {
      statusEl.style.display = 'none';
    }, 2000);
  }
}

function switchTab(tabId: string) {
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
  document.querySelector(`[data-tab="${tabId}"]`)?.classList.add('active');
  document.getElementById(tabId)?.classList.add('active');
}

function escapeHTML(str: string): string {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
