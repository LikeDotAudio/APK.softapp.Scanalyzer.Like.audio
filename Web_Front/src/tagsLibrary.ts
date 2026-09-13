import { FileItem } from './types';
import { formatBytes } from './tree';

interface TagEntry {
  tag: string;
  category: 'SCHEMATIC' | 'TRAINING' | 'CAMERA' | 'GPS' | 'TOKEN';
  count: number;
  matchingFiles: FileItem[];
}

export function renderTagsTab(
  containerList: HTMLElement,
  containerOutput: HTMLElement,
  files: FileItem[]
) {
  if (files.length === 0) {
    containerList.innerHTML = `<div class="empty-state">Upload files or folders to populate the Tags Library.</div>`;
    containerOutput.innerHTML = `<div class="empty-state">Select a tag from the index to view matching files.</div>`;
    return;
  }

  // Aggregate and Index all tags across dataset
  const tagMap = populateTagLibrary(files);
  const tagEntries = Array.from(tagMap.values()).sort((a, b) => b.count - a.count);

  if (tagEntries.length === 0) {
    containerList.innerHTML = `<div class="empty-state">No tags extracted yet. Upload files to populate tags.</div>`;
    return;
  }

  // Render Left Panel Tag Index
  containerList.innerHTML = `
    <div class="inspector-detail" style="gap: 0.75rem;">
      <div class="recommendation-banner" style="margin: 0;">
        🏷️ Populated <strong>${tagEntries.length} Unique Tags</strong> across ${files.length} files.
      </div>
      <input type="text" id="tagSearchInput" placeholder="Filter populated tags..." class="search-input" />
      <div id="tagCloudBox" class="tag-cloud-container" style="max-height: 440px;"></div>
    </div>
  `;

  const tagCloudBox = containerList.querySelector('#tagCloudBox') as HTMLElement;
  const tagSearchInput = containerList.querySelector('#tagSearchInput') as HTMLInputElement;

  function drawTags(filterText: string = '') {
    if (!tagCloudBox) return;
    tagCloudBox.innerHTML = '';

    const filtered = tagEntries.filter(t => t.tag.toLowerCase().includes(filterText.toLowerCase()));

    if (filtered.length === 0) {
      tagCloudBox.innerHTML = `<div class="empty-state">No matching tags found for "${escapeHTML(filterText)}".</div>`;
      return;
    }

    filtered.forEach((entry, idx) => {
      const pill = document.createElement('button');
      pill.className = 'tag-pill';
      if (idx === 0 && !filterText) pill.classList.add('active');

      const emoji = getCategoryEmoji(entry.category);
      pill.innerHTML = `
        <span>${emoji} #${entry.tag}</span>
        <span class="tag-count">${entry.count}</span>
      `;

      pill.addEventListener('click', () => {
        tagCloudBox.querySelectorAll('.tag-pill.active').forEach(p => p.classList.remove('active'));
        pill.classList.add('active');
        inspectTagEntry(entry, containerOutput);
      });

      tagCloudBox.appendChild(pill);
    });
  }

  drawTags();

  tagSearchInput?.addEventListener('input', () => {
    drawTags(tagSearchInput.value);
  });

  // Default inspect first tag
  if (tagEntries.length > 0) {
    inspectTagEntry(tagEntries[0], containerOutput);
  }
}

function populateTagLibrary(files: FileItem[]): Map<string, TagEntry> {
  const map = new Map<string, TagEntry>();

  function addTag(tag: string, category: TagEntry['category'], item: FileItem) {
    const clean = tag.toLowerCase().replace(/^#+/, '').trim();
    if (!clean || clean.length < 2) return;

    if (!map.has(clean)) {
      map.set(clean, {
        tag: clean,
        category,
        count: 0,
        matchingFiles: []
      });
    }

    const entry = map.get(clean)!;
    if (!entry.matchingFiles.some(f => f.relativePath === item.relativePath)) {
      entry.count++;
      entry.matchingFiles.push(item);
    }
  }

  // Load human training annotations from localStorage
  let savedAnnotations: any[] = [];
  try {
    const raw = localStorage.getItem('wbs_training_library_v1');
    if (raw) savedAnnotations = JSON.parse(raw);
  } catch {}

  const schematicKeywords = ['dwg', 'schematic', 'diagram', 'circuit', 'layout', 'blueprint', 'trace', 'drawing', 'outline', 'knit', 'dwgs', 'iss', 'prelim', 't1202a', 'm480c', 'st2442', 'l3242a'];

  for (const item of files) {
    const nameLower = item.relativePath.toLowerCase();

    // 1. Schematic Tags
    if (schematicKeywords.some(k => nameLower.includes(k))) {
      addTag('schematic', 'SCHEMATIC', item);
      addTag('blueprint', 'SCHEMATIC', item);
      addTag('circuit_diagram', 'SCHEMATIC', item);
    }

    // 2. Camera Tags
    if (item.metadata?.cameraModel) {
      const camTag = item.metadata.cameraModel.toLowerCase().replace(/[^a-z0-9]+/g, '_');
      addTag(camTag, 'CAMERA', item);
      addTag('camera_photo', 'CAMERA', item);
    }

    // 3. Geolocation Tags
    if (item.metadata?.gpsCoords) {
      addTag('geotagged_gps', 'GPS', item);
      addTag('gps_location', 'GPS', item);
    }

    // 4. Filename Word Token Tags
    const tokens = extractWordTokens(item.name);
    tokens.forEach(tok => {
      addTag(tok, 'TOKEN', item);
    });

    // 5. Training Library Annotations
    const matchingAnns = savedAnnotations.filter(a => a.relativePath === item.relativePath || a.fileName === item.name);
    matchingAnns.forEach(ann => {
      if (ann.label) {
        const annTag = ann.label.toLowerCase().replace(/[^a-z0-9]+/g, '_');
        addTag(annTag, 'TRAINING', item);
      }
    });
  }

  return map;
}

function inspectTagEntry(entry: TagEntry, containerOutput: HTMLElement) {
  const emoji = getCategoryEmoji(entry.category);

  const fileRowsHTML = entry.matchingFiles.map(file => {
    const imgPreview = file.isImage
      ? `<img src="${URL.createObjectURL(file.file)}" style="width:36px; height:36px; object-fit:cover; border-radius:4px;" />`
      : `<span style="font-size:1.5rem;">📄</span>`;

    return `
      <tr>
        <td style="width:50px;">${imgPreview}</td>
        <td><strong>${file.name}</strong></td>
        <td><code>${file.relativePath}</code></td>
        <td><span class="tag-badge">${file.emojiBadge || (file.isImage ? '🖼️' : '📄')}</span></td>
        <td>${formatBytes(file.size)}</td>
      </tr>
    `;
  }).join('');

  containerOutput.innerHTML = `
    <div class="inspector-detail">
      <div class="recommendation-banner" style="background: rgba(56, 189, 248, 0.12); border-color: rgba(56, 189, 248, 0.4); color: #38bdf8;">
        <span>${emoji} Tag Index: <strong>#${entry.tag}</strong></span>
        <span style="margin-left:auto;">${entry.count} Matching Items</span>
      </div>

      <h3>🏷️ Tag Items Catalog: #${entry.tag}</h3>
      <p style="color: var(--text-muted); font-size: 0.88rem;">
        Listing all files, schematics, and annotated items tagged with <strong>#${entry.tag}</strong>.
      </p>

      <h4>📁 Matching Files (${entry.matchingFiles.length} items)</h4>
      <div style="max-height: 380px; overflow-y: auto; border: 1px solid var(--border-color); border-radius: 8px;">
        <table class="meta-table">
          <thead>
            <tr>
              <th>Preview</th>
              <th>File Name</th>
              <th>Relative Path</th>
              <th>Badge</th>
              <th>Size</th>
            </tr>
          </thead>
          <tbody>
            ${fileRowsHTML}
          </tbody>
        </table>
      </div>
    </div>
  `;
}

function extractWordTokens(filename: string): string[] {
  return filename
    .replace(/\.[^/.]+$/, '')
    .split(/[^a-zA-Z0-9]+/)
    .filter(w => w.length > 2)
    .map(w => w.toLowerCase());
}

function getCategoryEmoji(cat: TagEntry['category']): string {
  switch (cat) {
    case 'SCHEMATIC': return '📐';
    case 'TRAINING': return '🎓';
    case 'CAMERA': return '📷';
    case 'GPS': return '📍';
    case 'TOKEN': return '🏷️';
  }
}

function escapeHTML(str: string): string {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
