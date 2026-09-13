import { FileItem, TreeNode } from './types';
import { sidecarBadge, sidecarTitle } from './sidecars';

export function buildDirectoryTree(files: FileItem[]): TreeNode {
  const root: TreeNode = {
    name: 'Root',
    path: '',
    isDir: true,
    children: new Map(),
    size: 0
  };

  for (const item of files) {
    const parts = item.relativePath.split('/').filter(Boolean);
    let current = root;
    current.size += item.size;
    current.fileCount = (current.fileCount ?? 0) + 1;
    if (item.sidecars) current.scannedCount = (current.scannedCount ?? 0) + 1;

    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      const isLast = i === parts.length - 1;

      if (isLast) {
        current.children.set(part, {
          name: part,
          path: item.relativePath,
          isDir: false,
          fileItem: item,
          children: new Map(),
          size: item.size
        });
      } else {
        if (!current.children.has(part)) {
          current.children.set(part, {
            name: part,
            path: parts.slice(0, i + 1).join('/'),
            isDir: true,
            children: new Map(),
            size: 0
          });
        }
        current = current.children.get(part)!;
        current.size += item.size;
        // Tallied on the way down so every ANCESTOR counts the file, not just
        // its immediate parent — the badge on a top folder has to speak for the
        // whole subtree or it is worse than absent.
        current.fileCount = (current.fileCount ?? 0) + 1;
        if (item.sidecars) current.scannedCount = (current.scannedCount ?? 0) + 1;
      }
    }
  }

  return root;
}

export function renderTreeUI(
  node: TreeNode,
  container: HTMLElement,
  onSelectNode: (node: TreeNode) => void,
  searchFilter: string = ''
): void {
  container.innerHTML = '';
  const ul = document.createElement('ul');
  ul.className = 'tree-root';

  for (const child of node.children.values()) {
    renderNodeRecursive(child, ul, onSelectNode, searchFilter.toLowerCase());
  }

  if (!ul.hasChildNodes()) {
    container.innerHTML = '<div class="empty-state">No matching files found.</div>';
  } else {
    container.appendChild(ul);
  }
}

function renderNodeRecursive(
  node: TreeNode,
  parentEl: HTMLElement,
  onSelectNode: (node: TreeNode) => void,
  searchFilter: string
): boolean {
  if (searchFilter && !nodeMatches(node, searchFilter) && !matchesChild(node, searchFilter)) {
    return false;
  }

  const li = document.createElement('li');
  li.className = 'tree-node';

  const div = document.createElement('div');
  div.className = 'tree-item';
  
  const icon = document.createElement('span');
  icon.className = 'tree-icon';
  if (node.isDir) {
    icon.textContent = '📁';
  } else {
    icon.textContent = getFileEmojiIcon(node.name);
  }

  const nameSpan = document.createElement('span');
  nameSpan.className = 'tree-name';
  nameSpan.textContent = node.name;

  div.appendChild(icon);
  div.appendChild(nameSpan);

  // WHAT THE SCAN LEFT BESIDE THIS FILE, on the row itself. Without it the only
  // way to tell a scanned file from an unscanned one is to click it, which over
  // a corpus of any size is not a way to tell at all. Directories carry the
  // count of scanned files beneath them for the same reason.
  if (!node.isDir && node.fileItem) {
    const marks = sidecarBadge(node.fileItem.sidecars);
    if (marks) {
      const badge = document.createElement('span');
      badge.className = 'tree-sidecar-badge';
      badge.textContent = marks;
      badge.title = sidecarTitle(node.fileItem.sidecars);
      div.appendChild(badge);
    }
  } else if (node.isDir && node.scannedCount) {
    const badge = document.createElement('span');
    badge.className = 'tree-sidecar-badge tree-sidecar-count';
    badge.textContent = `${node.scannedCount}/${node.fileCount ?? 0}`;
    badge.title = `${node.scannedCount} of ${node.fileCount ?? 0} file(s) beneath this folder carry a sidecar`;
    div.appendChild(badge);
  }

  const sizeSpan = document.createElement('span');
  sizeSpan.className = 'tree-size';
  sizeSpan.textContent = formatBytes(node.size);
  div.appendChild(sizeSpan);

  li.appendChild(div);

  if (node.isDir && node.children.size > 0) {
    const childrenUl = document.createElement('ul');
    childrenUl.className = 'tree-children';
    childrenUl.style.display = searchFilter ? 'block' : 'none';

    for (const child of node.children.values()) {
      renderNodeRecursive(child, childrenUl, onSelectNode, searchFilter);
    }

    li.appendChild(childrenUl);

    div.addEventListener('click', (e) => {
      e.stopPropagation();
      const isExpanded = childrenUl.style.display === 'block';
      childrenUl.style.display = isExpanded ? 'none' : 'block';
      icon.textContent = isExpanded ? '📁' : '📂';
      onSelectNode(node);
    });
  } else {
    div.addEventListener('click', (e) => {
      e.stopPropagation();
      document.querySelectorAll('.tree-item.selected').forEach(el => el.classList.remove('selected'));
      div.classList.add('selected');
      onSelectNode(node);
    });
  }

  parentEl.appendChild(li);
  return true;
}

export function getFileEmojiIcon(filename: string): string {
  const ext = filename.split('.').pop()?.toLowerCase() || '';
  switch (ext) {
    case 'cdr':
    case 'psd':
    case 'dwg':
    case 'dxf':
    case 'ai':
    case 'eps':
      return '📐';
    case 'png':
    case 'jpg':
    case 'jpeg':
    case 'gif':
    case 'webp':
    case 'bmp':
    case 'svg':
      return '🖼️';
    case 'mp3':
    case 'wav':
    case 'flac':
    case 'aac':
      return '🎵';
    case 'mp4':
    case 'mkv':
    case 'avi':
    case 'mov':
      return '🎥';
    case 'xls':
    case 'xlsx':
    case 'csv':
      return '📊';
    case 'zip':
    case '7z':
    case 'tar':
    case 'gz':
    case 'rar':
      return '📦';
    case 'pdf':
    case 'docx':
    case 'doc':
    case 'txt':
    case 'html':
      return '📄';
    default:
      return '📄';
  }
}

export function nodeMatches(node: TreeNode, filter: string): boolean {
  if (!filter) return true;
  const f = filter.toLowerCase().trim();

  // 1. File Name or Folder Name match
  if (node.name.toLowerCase().includes(f)) return true;

  // 2. Full Relative Path & Parent Folder Names match (e.g. Consoles, 31106, Manuals)
  if (node.path && node.path.toLowerCase().includes(f)) return true;

  // 3. Extracted OCR Text match
  if (node.fileItem?.ocrText && node.fileItem.ocrText.toLowerCase().includes(f)) return true;

  return false;
}

function matchesChild(node: TreeNode, filter: string): boolean {
  for (const child of node.children.values()) {
    if (nodeMatches(child, filter) || matchesChild(child, filter)) {
      return true;
    }
  }
  return false;
}

export function formatBytes(bytes: number, decimals: number = 2): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}
