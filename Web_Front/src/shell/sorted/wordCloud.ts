import type { FileItem } from '../../types';
import { escapeHTML } from '../../lib/html';
import { els } from '../dom';
import { renderWordFocus } from './focusDetails';

type CloudItem = { name: string; path: string; project: string; status: string; location: string; fileItem?: FileItem };

/** The 120 most frequent words across the items' names, paths, fields and OCR
 *  text, most frequent first. Pure. */
export function countWords(items: CloudItem[]): Array<[string, number]> {
  const wordCounts: Record<string, number> = {};
  const stopWords = new Set(['and', 'the', 'for', 'with', 'this', 'that', 'from', 'file', 'png', 'jpg', 'jpeg', 'json', 'pdf', 'docx', 'txt', 'svg']);

  items.forEach(item => {
    const textSources = [item.name, item.path, item.project, item.status, item.location];
    if (item.fileItem && item.fileItem.ocrText) {
      textSources.push(item.fileItem.ocrText);
    }
    const combined = textSources.join(' ');
    const tokens = combined.toLowerCase().match(/\b[a-z0-9_\-]{3,}\b/g) || [];

    tokens.forEach(tok => {
      if (!stopWords.has(tok)) {
        wordCounts[tok] = (wordCounts[tok] || 0) + 1;
      }
    });
  });

  const sortedWords = Object.entries(wordCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 120);

  return sortedWords;
}

export function renderWordCloud(items: CloudItem[]) {
  if (!els.sortedWordCloudContainer) return;

  const sortedWords = countWords(items);

  if (sortedWords.length === 0) {
    els.sortedWordCloudContainer.innerHTML = '<div class="empty-state">No words extracted for word cloud yet.</div>';
    return;
  }

  const maxFreq = sortedWords[0][1];
  const minFreq = sortedWords[sortedWords.length - 1][1];

  const colors = ['#38bdf8', '#a855f7', '#ec4899', '#f59e0b', '#10b981', '#6366f1', '#f43f5e', '#14b8a6'];

  const cloudHtml = sortedWords.map(([word, freq], idx) => {
    const norm = maxFreq === minFreq ? 1 : (freq - minFreq) / (maxFreq - minFreq);
    const fontSizeRem = (0.7 + norm * 1.6).toFixed(2);
    const color = colors[idx % colors.length];
    const opacity = (0.6 + norm * 0.4).toFixed(2);

    return `
      <span class="word-cloud-tag" data-word="${escapeHTML(word)}" data-freq="${freq}" 
            style="font-size:${fontSizeRem}rem; color:${color}; opacity:${opacity}; cursor:pointer; font-weight:${norm > 0.4 ? '700' : '500'}; padding:2px 5px; border-radius:3px; background:rgba(255,255,255,0.03); transition:transform 0.15s, background 0.15s;"
            title="Frequency: ${freq} occurrences">
        ${escapeHTML(word)} <sub style="font-size:0.6rem; opacity:0.7;">(${freq})</sub>
      </span>
    `;
  }).join('');

  els.sortedWordCloudContainer.innerHTML = cloudHtml;

  els.sortedWordCloudContainer.querySelectorAll('.word-cloud-tag').forEach(tag => {
    tag.addEventListener('mouseenter', () => {
      (tag as HTMLElement).style.transform = 'scale(1.15)';
      (tag as HTMLElement).style.background = 'rgba(168, 85, 247, 0.2)';
    });
    tag.addEventListener('mouseleave', () => {
      (tag as HTMLElement).style.transform = 'scale(1.0)';
      (tag as HTMLElement).style.background = 'rgba(255,255,255,0.03)';
    });
    tag.addEventListener('click', () => {
      const word = tag.getAttribute('data-word');
      const freq = tag.getAttribute('data-freq');
      if (word && els.sortedFocusDetailsContainer) {
        renderWordFocus(word, freq, items);
      }
    });
  });
}
