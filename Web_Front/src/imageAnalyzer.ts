import { FileItem } from './types';
import { formatBytes } from './tree';
import { runOCR } from './ocr';
import { convertImageToSVG } from './svgConverter';
import { apiUrl } from './apiBase';

export async function analyzeImage(fileItem: FileItem, container: HTMLElement) {
  container.innerHTML = `<div class="empty-state">Analyzing image attributes & color histogram...</div>`;

  const url = URL.createObjectURL(fileItem.file);

  const interToolHTML = `
    <div class="inter-tool-bar">
      <label>⚡ Cross-Tool Data Pipeline: Send "${fileItem.name}" to another tool:</label>
      <div class="button-group">
        <button id="sendToOCRFromAnalyzer" class="btn primary" style="font-size:0.78rem; padding:0.35rem 0.7rem;">
          🔤 Send to OCR Tool
        </button>
        <button id="sendToSVGFromAnalyzer" class="btn secondary" style="font-size:0.78rem; padding:0.35rem 0.7rem;">
          📐 Send to Image to SVG
        </button>
        <button id="sendToTrainingFromAnalyzer" class="btn secondary" style="font-size:0.78rem; padding:0.35rem 0.7rem;">
          🎓 Send to Training Library
        </button>
      </div>
    </div>
  `;

  // Call Rust Micro-API Backend
  try {
    const arrayBuf = await fileItem.file.arrayBuffer();
    const resp = await fetch(apiUrl('/api/analyze-image'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/octet-stream' },
      body: arrayBuf
    });

    if (resp.ok) {
      const rustRes = await resp.json();
      container.innerHTML = `
        <div class="inspector-detail">
          <div class="preview-box">
            <img src="${url}" alt="${fileItem.name}" />
          </div>
          ${interToolHTML}
          <h3>🦀 Rust Image Analysis Results</h3>
          <table class="meta-table">
            <tr><th>Resolution</th><td>${rustRes.width} x ${rustRes.height} px</td></tr>
            <tr><th>Aspect Ratio</th><td>${rustRes.aspect_ratio.toFixed(2)}:1</td></tr>
            <tr><th>Total Pixels</th><td>${rustRes.total_pixels.toLocaleString()}</td></tr>
            <tr><th>Mean RGB</th><td>R:${rustRes.mean_red.toFixed(1)}, G:${rustRes.mean_green.toFixed(1)}, B:${rustRes.mean_blue.toFixed(1)}</td></tr>
            <tr><th>Luminance</th><td>${rustRes.luminance.toFixed(1)} / 255</td></tr>
            <tr><th>Contrast (StdDev)</th><td>${rustRes.contrast.toFixed(2)}</td></tr>
            <tr><th>Perceptual dHash</th><td><code>${rustRes.dhash_hex}</code></td></tr>
          </table>
        </div>
      `;
      attachAnalyzerPipelineHandlers(container, fileItem);
      return;
    }
  } catch (err) {
    console.warn("Rust API offline, using fallback", err);
  }

  // Client-side fallback
  const img = new Image();
  img.onload = () => {
    container.innerHTML = `
      <div class="inspector-detail">
        <div class="preview-box">
          <img src="${url}" alt="${fileItem.name}" />
        </div>
        ${interToolHTML}
        <h3>🎨 Client Image Analysis Results</h3>
        <table class="meta-table">
          <tr><th>Resolution</th><td>${img.naturalWidth} x ${img.naturalHeight} px</td></tr>
          <tr><th>Aspect Ratio</th><td>${(img.naturalWidth / img.naturalHeight).toFixed(2)}:1</td></tr>
          <tr><th>File Size</th><td>${formatBytes(fileItem.size)}</td></tr>
        </table>
      </div>
    `;
    attachAnalyzerPipelineHandlers(container, fileItem);
  };
  img.src = url;
}

function attachAnalyzerPipelineHandlers(container: HTMLElement, fileItem: FileItem) {
  container.querySelector('#sendToOCRFromAnalyzer')?.addEventListener('click', async () => {
    const ocrOutput = document.getElementById('ocrOutput') as HTMLElement;
    if (ocrOutput) {
      switchTab('ocrTab');
      await runOCR(fileItem, ocrOutput);
    }
  });

  container.querySelector('#sendToSVGFromAnalyzer')?.addEventListener('click', async () => {
    const svgOutput = document.getElementById('svgOutput') as HTMLElement;
    if (svgOutput) {
      switchTab('svgTab');
      await convertImageToSVG(fileItem, svgOutput);
    }
  });

  container.querySelector('#sendToTrainingFromAnalyzer')?.addEventListener('click', () => {
    switchTab('trainingTab');
  });
}

function switchTab(tabId: string) {
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
  document.querySelector(`[data-tab="${tabId}"]`)?.classList.add('active');
  document.getElementById(tabId)?.classList.add('active');
}
