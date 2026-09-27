import type { FileItem, TreeNode } from '../../types';
import { shell } from '../state';
import { els } from '../dom';
import { inspectFileItem } from '../inspector';

export function renderVisualGallery(imageFiles: FileItem[], selectedItem?: FileItem | null) {
  els.galleryContainer.innerHTML = '';
  if (imageFiles.length === 0) {
    els.galleryContainer.innerHTML = '<div class="empty-state" style="font-size:0.7rem;">No media or CAD files found in selection.</div>';
    return;
  }

  const displayLimit = Math.min(imageFiles.length, 300);
  for (let i = 0; i < displayLimit; i++) {
    const item = imageFiles[i];
    const card = document.createElement('div');
    const isSelected = selectedItem && (item.relativePath === selectedItem.relativePath);
    card.className = 'gallery-card' + (isSelected ? ' selected' : '');

    const isDxf = item.name.toLowerCase().endsWith('.dxf');
    const icon = isDxf ? '📐' : '🖼️';
    const url = URL.createObjectURL(item.file);
    
    card.innerHTML = `
      <img src="${url}" alt="${item.name}" class="gallery-thumb" loading="lazy" />
      <div class="gallery-title" title="${item.name}">${icon} ${item.name}</div>
    `;

    card.addEventListener('click', () => {
      els.galleryContainer.querySelectorAll('.gallery-card.selected').forEach(el => el.classList.remove('selected'));
      card.classList.add('selected');
      inspectFileItem(item);
    });

    els.galleryContainer.appendChild(card);
    if (isSelected) {
      setTimeout(() => {
        card.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      }, 50);
    }
  }
}

function isPreviewableFile(f: FileItem): boolean {
  if (f.isImage) return true;
  const lower = f.name.toLowerCase();
  return lower.endsWith('.dxf') || lower.endsWith('.dwg') || lower.endsWith('.pdf');
}

export async function inspectNode(node: TreeNode) {
  if (node.fileItem) {
    const parentPath = node.fileItem.relativePath.includes('/')
      ? node.fileItem.relativePath.substring(0, node.fileItem.relativePath.lastIndexOf('/'))
      : '';

    const folderFiles = shell.loadedFiles.filter(f => isPreviewableFile(f) && (
      parentPath === ''
        ? !f.relativePath.includes('/')
        : f.relativePath.startsWith(parentPath + '/')
    ));

    const filesToRender = folderFiles.length > 0 ? folderFiles : shell.loadedFiles.filter(f => isPreviewableFile(f));
    renderVisualGallery(filesToRender, node.fileItem);
    await inspectFileItem(node.fileItem);
  } else if (node.isDir) {
    const folderFiles: FileItem[] = [];
    function collectFolderFiles(n: TreeNode) {
      if (n.fileItem && isPreviewableFile(n.fileItem)) {
        folderFiles.push(n.fileItem);
      }
      for (const child of n.children.values()) {
        collectFolderFiles(child);
      }
    }
    collectFolderFiles(node);
    const selectedItem = folderFiles.length > 0 ? folderFiles[0] : null;
    renderVisualGallery(folderFiles, selectedItem);
    if (folderFiles.length > 0) {
      await inspectFileItem(folderFiles[0]);
    }
  }
}
