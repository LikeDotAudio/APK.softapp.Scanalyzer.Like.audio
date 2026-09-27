import type { FileItem, TreeNode } from '../../types';
import { buildDirectoryTree, renderTreeUI, formatBytes } from '../../tree';
import { splitSidecars } from '../../sidecars';
import { shell } from '../state';
import { els } from '../dom';
import { inspectNode, renderVisualGallery } from '../browse/gallery';
import { inspectFileItem } from '../inspector';

function handleFileSelect(e: Event) {
  const target = e.target as HTMLInputElement;
  if (!target.files || target.files.length === 0) return;

  const files = target.files;
  const fileItems: FileItem[] = [];

  els.statusProgressBanner.style.display = 'flex';
  els.statusProgressText.textContent = `Reading ${files.length.toLocaleString()} files into workspace...`;
  els.statusProgressBar.style.width = '10%';

  setTimeout(() => {
    // The sidecars a scan left here are READ, not discarded. This used to
    // `continue` past every *.exif.json and *.meta.json, so the engine's work
    // reached the screen only if the browser redid it — and *.ocr.json was not
    // even in that list, so OCR sidecars arrived as junk rows in the tree.
    const entries: Array<{ file: File; relativePath: string }> = [];
    for (let position = 0; position < files.length; position++) {
      const file = files[position];
      entries.push({ file, relativePath: file.webkitRelativePath || file.name });
    }

    const split = splitSidecars(entries);
    fileItems.push(...split.sources);
    shell.loadedSidecars = split.sidecarsByPath;

    if (split.paired > 0 || split.orphans.length > 0) {
      const scanned = split.sidecarsByPath.size;
      const parts = [
        `${split.paired.toLocaleString()} sidecar(s) read for ${scanned.toLocaleString()} of ${split.sources.length.toLocaleString()} file(s)`,
      ];
      if (split.orphans.length > 0) {
        // A sidecar with no source describes a file deleted since the scan.
        parts.push(`${split.orphans.length.toLocaleString()} orphan(s) — the file they describe is gone`);
      }
      els.statusProgressText.textContent = parts.join(' · ');
    }

    processFiles(fileItems);
  }, 50);
}

function processFiles(files: FileItem[]) {
  shell.loadedFiles = files;
  els.statusProgressText.textContent = `Building directory tree for ${files.length.toLocaleString()} items...`;
  els.statusProgressBar.style.width = '50%';

  setTimeout(() => {
    shell.rootTreeNode = buildDirectoryTree(files);

    const totalFiles = files.length;
    const imageFiles = files.filter(f => f.isImage);
    const totalSize = files.reduce((acc, f) => acc + f.size, 0);

    let dirCount = 0;
    function countDirs(node: TreeNode) {
      if (node.isDir && node.path !== '') dirCount++;
      for (const child of node.children.values()) {
        if (child.isDir) countDirs(child);
      }
    }
    countDirs(shell.rootTreeNode);

    els.statFiles.textContent = totalFiles.toLocaleString();
    els.statDirs.textContent = dirCount.toLocaleString();
    els.statImages.textContent = imageFiles.length.toLocaleString();
    els.statSize.textContent = formatBytes(totalSize);

    els.statusProgressText.textContent = `Rendering File Explorer & Image Gallery...`;
    els.statusProgressBar.style.width = '85%';

    renderTreeUI(shell.rootTreeNode, els.treeContainer, inspectNode, els.searchInput.value);
    renderVisualGallery(imageFiles);

    els.statusProgressText.textContent = `✅ Successfully indexed ${totalFiles.toLocaleString()} files!`;
    els.statusProgressBar.style.width = '100%';

    setTimeout(() => {
      els.statusProgressBanner.style.display = 'none';
    }, 2500);

    if (imageFiles.length > 0) {
      inspectFileItem(imageFiles[0]);
    } else if (files.length > 0) {
      inspectFileItem(files[0]);
    }
  }, 50);
}

export function bindFileInputs() {
  els.folderInput?.addEventListener('change', (e) => handleFileSelect(e));
  els.fileInput?.addEventListener('change', (e) => handleFileSelect(e));
}
