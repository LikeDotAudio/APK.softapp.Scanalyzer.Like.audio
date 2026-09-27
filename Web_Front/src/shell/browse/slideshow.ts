import type { FileItem } from '../../types';
import { shell } from '../state';
import { els } from '../dom';

/** Push a file onto the five-item recent footer and redraw it. `onPick` is what
 *  clicking a footer card does (the inspector passes itself). */
export function pushRecentSlideshow(fileItem: FileItem, onPick: (item: FileItem) => void) {
  if (shell.recentVisitedFiles.some(f => f.relativePath === fileItem.relativePath)) {
    shell.recentVisitedFiles = shell.recentVisitedFiles.filter(f => f.relativePath !== fileItem.relativePath);
  }
  shell.recentVisitedFiles.unshift(fileItem);
  if (shell.recentVisitedFiles.length > 5) {
    shell.recentVisitedFiles = shell.recentVisitedFiles.slice(0, 5);
  }

  els.footerSlideshowTrack.innerHTML = '';
  for (const item of shell.recentVisitedFiles) {
    const card = document.createElement('div');
    card.className = 'slideshow-item';
    const thumbUrl = item.isImage ? URL.createObjectURL(item.file) : '';
    const thumbHTML = item.isImage ? `<img src="${thumbUrl}" class="slideshow-thumb" />` : `<span style="font-size:1.2rem;">📄</span>`;

    card.innerHTML = `
      ${thumbHTML}
      <div class="slideshow-meta">
        <div class="slideshow-name">${item.name}</div>
      </div>
    `;

    card.addEventListener('click', () => onPick(item));
    els.footerSlideshowTrack.appendChild(card);
  }
}
