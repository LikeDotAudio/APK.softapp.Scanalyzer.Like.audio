import { renderVisualDocumentOverlays } from '../overlays/render';

// Interactive Resizable Sash Divider Event Logic
export function setupSashDividers() {
  const sash1 = document.getElementById('sashDivider1');
  const sash2 = document.getElementById('sashDivider2');
  const sashGallery = document.getElementById('sashDividerGallery');
  const colTree = document.getElementById('colTreePane');
  const colPreview = document.getElementById('colPreviewPane');
  const galleryContainer = document.getElementById('galleryContainer');
  const masterGrid = document.querySelector('.master-grid') as HTMLElement;

  if (!sash1 || !sash2 || !colTree || !colPreview || !masterGrid) return;

  let activeSash: HTMLElement | null = null;
  let startX = 0;
  let startTreeWidth = 0;
  let startPreviewWidth = 0;
  let startGalleryWidth = 0;

  sash1.addEventListener('mousedown', (e) => {
    activeSash = sash1;
    startX = e.clientX;
    startTreeWidth = colTree.getBoundingClientRect().width;
    sash1.classList.add('dragging');
    document.body.style.cursor = 'col-resize';
  });

  sash2.addEventListener('mousedown', (e) => {
    activeSash = sash2;
    startX = e.clientX;
    startPreviewWidth = colPreview.getBoundingClientRect().width;
    sash2.classList.add('dragging');
    document.body.style.cursor = 'col-resize';
  });

  sashGallery?.addEventListener('mousedown', (e) => {
    activeSash = sashGallery;
    startX = e.clientX;
    if (galleryContainer) {
      startGalleryWidth = galleryContainer.getBoundingClientRect().width;
    }
    sashGallery.classList.add('dragging');
    document.body.style.cursor = 'col-resize';
  });

  window.addEventListener('mousemove', (e) => {
    if (!activeSash) return;
    const dx = e.clientX - startX;

    if (activeSash === sash1) {
      const newWidth = Math.max(180, startTreeWidth + dx);
      colTree.style.width = `${newWidth}px`;
      renderVisualDocumentOverlays();
    } else if (activeSash === sash2) {
      const newWidth = Math.max(240, startPreviewWidth + dx);
      colPreview.style.width = `${newWidth}px`;
      renderVisualDocumentOverlays();
    } else if (activeSash === sashGallery && galleryContainer) {
      const newWidth = Math.max(60, Math.min(320, startGalleryWidth - dx));
      galleryContainer.style.width = `${newWidth}px`;
    }
  });

  window.addEventListener('mouseup', () => {
    if (activeSash) {
      activeSash.classList.remove('dragging');
      activeSash = null;
      document.body.style.cursor = 'default';
      renderVisualDocumentOverlays();
    }
  });
}
