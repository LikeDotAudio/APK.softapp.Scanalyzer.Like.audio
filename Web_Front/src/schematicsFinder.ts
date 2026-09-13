import { FileItem } from './types';
import { classifyImage, ImageClassification } from './imageClassifier';
import { formatBytes } from './tree';
import { runOCR } from './ocr';
import { convertImageToSVG } from './svgConverter';

export async function renderSchematicsTab(
  containerList: HTMLElement,
  containerOutput: HTMLElement,
  files: FileItem[]
) {
  containerList.innerHTML = `<div class="empty-state">🔍 Scanning and isolating schematic diagrams & blueprints...</div>`;

  const imageFiles = files.filter(f => f.isImage);
  const schematicItems: Array<{ item: FileItem; classification: ImageClassification }> = [];

  for (const item of imageFiles) {
    const classification = await classifyImage(item);
    if (
      classification.type === 'SCHEMATIC_DIAGRAM' ||
      item.emojiBadge === '📐' ||
      isSchematicFilename(item.relativePath)
    ) {
      schematicItems.push({ item, classification });
    }
  }

  if (schematicItems.length === 0) {
    containerList.innerHTML = `
      <div class="empty-state">
        📐 No technical schematics or blueprints detected in loaded files.
      </div>
    `;
    containerOutput.innerHTML = `
      <div class="empty-state">
        Select or load a folder containing technical drawings, blueprints, or circuit schematics.
      </div>
    `;
    return;
  }

  // Render Left List of Isolated Schematics
  containerList.innerHTML = '';
  const headerSummary = document.createElement('div');
  headerSummary.className = 'recommendation-banner';
  headerSummary.style.margin = '0 0 0.75rem 0';
  headerSummary.style.fontSize = '0.82rem';
  headerSummary.innerHTML = `📐 Isolated <strong>${schematicItems.length} Schematics</strong> out of ${files.length} loaded files.`;
  containerList.appendChild(headerSummary);

  const ul = document.createElement('ul');
  ul.className = 'tree-root';

  schematicItems.forEach(({ item, classification }, idx) => {
    const li = document.createElement('li');
    li.className = 'tree-node';

    const div = document.createElement('div');
    div.className = 'tree-item';
    if (idx === 0) div.classList.add('selected');

    div.innerHTML = `
      <span class="tree-icon">📐</span>
      <span class="tree-name">${item.name}</span>
      <span class="tag-badge" style="font-size:0.7rem; padding:0.1rem 0.35rem;">
        ${(classification.confidence * 100).toFixed(0)}% Schematic
      </span>
      <span class="tree-size">${formatBytes(item.size)}</span>
    `;

    div.addEventListener('click', () => {
      containerList.querySelectorAll('.tree-item.selected').forEach(el => el.classList.remove('selected'));
      div.classList.add('selected');
      inspectSchematic(item, classification, containerOutput);
    });

    li.appendChild(div);
    ul.appendChild(li);
  });

  containerList.appendChild(ul);

  // Default inspect first schematic
  if (schematicItems.length > 0) {
    inspectSchematic(schematicItems[0].item, schematicItems[0].classification, containerOutput);
  }
}

function inspectSchematic(
  fileItem: FileItem,
  classification: ImageClassification,
  containerOutput: HTMLElement
) {
  const url = URL.createObjectURL(fileItem.file);

  const traitsHTML = classification.traits
    .map(t => `<li style="margin-left: 1.2rem;">${t}</li>`)
    .join('');

  containerOutput.innerHTML = `
    <div class="inspector-detail">
      <div class="preview-box">
        <img src="${url}" alt="${fileItem.name}" />
      </div>

      <h3>📐 Technical Schematic Diagram: ${fileItem.name}</h3>

      <!-- Interactive Quick Action Buttons -->
      <div class="button-group">
        <button id="runSchematicOCRBtn" class="btn primary">
          🔤 Scan Schematic Text (OCR)
        </button>
        <button id="vectorizeSchematicBtn" class="btn secondary">
          📐 Vectorize to SVG Paths
        </button>
      </div>

      <h4>🔍 Schematic Classification Verdict</h4>
      <div class="recommendation-banner">
        Classification: <strong>${classification.label}</strong>
        (${(classification.confidence * 100).toFixed(0)}% Confidence)
      </div>
      <ul style="color: var(--text-main); font-size:0.88rem; display:flex; flex-direction:column; gap:0.3rem;">
        ${traitsHTML}
      </ul>

      <h4>📊 Drawing Metrics & Contour Properties</h4>
      <table class="meta-table">
        <tr><th>Schematic File</th><td>${fileItem.name}</td></tr>
        <tr><th>Relative Path</th><td>${fileItem.relativePath}</td></tr>
        <tr><th>File Size</th><td>${formatBytes(fileItem.size)}</td></tr>
        <tr><th>Background Dominance</th><td>${classification.metrics.dominantColorPercent}% single background</td></tr>
        <tr><th>Line Edge Density</th><td>${classification.metrics.edgeDensityPercent}% high-contrast contour edges</td></tr>
        <tr><th>Monochrome Ratio</th><td>${classification.metrics.grayscalePercent}% grayscale</td></tr>
        <tr><th>Color Palette Depth</th><td>${classification.metrics.uniqueColorBins} color bins</td></tr>
      </table>

      <div id="schematicActionOutput" style="margin-top: 1rem;"></div>
    </div>
  `;

  // Attach Action Button Handlers
  const actionContainer = containerOutput.querySelector('#schematicActionOutput') as HTMLElement;

  containerOutput.querySelector('#runSchematicOCRBtn')?.addEventListener('click', async () => {
    if (actionContainer) {
      await runOCR(fileItem, actionContainer);
    }
  });

  containerOutput.querySelector('#vectorizeSchematicBtn')?.addEventListener('click', async () => {
    if (actionContainer) {
      await convertImageToSVG(fileItem, actionContainer);
    }
  });
}

function isSchematicFilename(path: string): boolean {
  const lower = path.toLowerCase();
  const keywords = ['dwg', 'schematic', 'diagram', 'circuit', 'layout', 'blueprint', 'trace', 'drawing', 'outline', 'knit', 'dwgs', 'iss', 'prelim', 't1202a', 'm480c', 'st2442', 'l3242a'];
  return keywords.some(k => lower.includes(k));
}
