import { FileItem } from './types';
import { apiUrl } from './apiBase';

export async function identifyPhotoAndWords(fileItem: FileItem, container: HTMLElement) {
  container.innerHTML = `<div class="empty-state">Extracting model codes, project tags & photo traits with Rust Engine...</div>`;

  let rustPhotoRes: any = null;
  let rustWordRes: any = null;

  if (fileItem.isImage) {
    try {
      const arrayBuf = await fileItem.file.arrayBuffer();
      const resp = await fetch(apiUrl('/api/photo-id'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/octet-stream' },
        body: arrayBuf
      });
      if (resp.ok) {
        rustPhotoRes = await resp.json();
      }
    } catch (err) {
      console.warn("Rust Photo ID API offline", err);
    }
  }

  try {
    const textContent = `${fileItem.name} ${fileItem.relativePath}`;
    const resp = await fetch(apiUrl('/api/word-analyze'), {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain' },
      body: textContent
    });
    if (resp.ok) {
      rustWordRes = await resp.json();
    }
  } catch (err) {
    console.warn("Rust Word Analyze API offline", err);
  }

  const fileTokens = extractFilenameTokens(fileItem.name);
  const photoID = generatePhotoID(fileItem);

  const fileTokenBadges = fileTokens.map(w => `<span class="tag-badge" style="background:#0284c7; color:#fff;">📁 #${w}</span>`).join(' ');

  let photoTraitHTML = '';
  if (rustPhotoRes) {
    photoTraitHTML = `
      <div class="data-card">
        <h4>🖼️ Photo Classification & Traits</h4>
        <table class="meta-table">
          <tr><th>Category</th><td><strong>${rustPhotoRes.primary_category}</strong> (${(rustPhotoRes.confidence * 100).toFixed(0)}% Confidence)</td></tr>
          <tr><th>Color Palette</th><td>${rustPhotoRes.color_palette_type}</td></tr>
          <tr><th>Visual Traits</th><td>${rustPhotoRes.detected_traits.join(', ')}</td></tr>
          <tr><th>Perceptual Fingerprint</th><td><code>${rustPhotoRes.fingerprint_hash}</code></td></tr>
        </table>
      </div>
    `;
  }

  let modelCodeHTML = '';
  if (rustWordRes && rustWordRes.extracted_model_codes && rustWordRes.extracted_model_codes.length > 0) {
    modelCodeHTML = `
      <div class="data-card">
        <h4>🔢 Extracted Part & Model Codes</h4>
        <div class="tag-cloud">
          ${rustWordRes.extracted_model_codes.map((m: string) => `<span class="tag-badge" style="background:#d97706; color:#fff;">🔢 #${m}</span>`).join(' ')}
        </div>
      </div>
    `;
  }

  let projectKeywordHTML = '';
  if (rustWordRes && rustWordRes.extracted_project_names && rustWordRes.extracted_project_names.length > 0) {
    projectKeywordHTML = `
      <div class="data-card">
        <h4>🏷️ Extracted Project & Technical Keywords</h4>
        <div class="tag-cloud">
          ${rustWordRes.extracted_project_names.map((k: string) => `<span class="tag-badge" style="background:#059669; color:#fff;">🏷️ #${k}</span>`).join(' ')}
        </div>
      </div>
    `;
  }

  container.innerHTML = `
    <div class="data-card">
      <h4>🆔 File Unique ID & Filename Tags</h4>
      <table class="meta-table">
        <tr><th>Original File Name</th><td>${fileItem.name}</td></tr>
        <tr><th>Unique Identifier Tag</th><td><code>${photoID}</code></td></tr>
        <tr><th>Relative Path</th><td>${fileItem.relativePath}</td></tr>
      </table>

      <h4 style="margin-top:0.5rem;">📁 Extracted Filename Tags</h4>
      <div class="tag-cloud">${fileTokenBadges || '<span class="empty-state">No filename tags</span>'}</div>
    </div>

    ${modelCodeHTML}
    ${projectKeywordHTML}
    ${photoTraitHTML}
  `;
}

function extractFilenameTokens(filename: string): string[] {
  return filename
    .replace(/\.[^/.]+$/, '')
    .split(/[^a-zA-Z0-9]+/)
    .filter(w => w.length >= 2)
    .map(w => w.toLowerCase());
}

function generatePhotoID(fileItem: FileItem): string {
  const str = `${fileItem.name}-${fileItem.size}`;
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (hash << 5) - hash + str.charCodeAt(i);
    hash |= 0;
  }
  return `WBS-IMG-${Math.abs(hash).toString(16).toUpperCase()}`;
}
