import type { FileItem, TreeNode } from '../types';
import type { SidecarSet } from '../sidecars';
import type { InventoryRecord } from './inventory/store';

export type SortCriterion = 'name' | 'size' | 'ext' | 'category' | 'status';
export type LibraryTab = 'schematics' | 'tags' | 'training';
export type KeylistGroupMode = 'prefix' | 'location' | 'status' | 'all';

/** The shell's mutable state, as one object: an ES module cannot reassign a
 *  binding it imported, and most of these are written by one job and read by
 *  another. */
export const shell = {
  loadedFiles: [] as FileItem[],
  /** Sidecars found in the opened folder, keyed by the path of the file they
   *  describe. Empty for a folder that has never been scanned — which the
   *  inspector reports rather than hides, because "not scanned" and "nothing
   *  found" are different answers. */
  loadedSidecars: new Map() as Map<string, SidecarSet>,
  rootTreeNode: null as TreeNode | null,
  recentVisitedFiles: [] as FileItem[],
  manualInventory: [] as InventoryRecord[],

  currentSortCriterion: 'name' as SortCriterion,
  currentLibraryTab: 'schematics' as LibraryTab,
  currentKeylistGroupMode: 'prefix' as KeylistGroupMode,

  // Overlay State Flags
  showOcrBoxes: true,
  showTextOverlay: true,
  showTitleBlock: false,
  showFaceOverlay: false,
  showSchematicLines: false,
  showSvgVector: false,
  currentInspectedFileItem: null as FileItem | null,
  currentInspectedOcrData: null as any,
  currentInspectedPhotoData: null as any,
  currentInspectedAnalyzerData: null as any,
  currentInspectedSvgData: null as any,
  currentInspectedImgUrl: '' as string,
};

export type OverlayFlag =
  | 'showOcrBoxes' | 'showTextOverlay' | 'showTitleBlock'
  | 'showFaceOverlay' | 'showSchematicLines' | 'showSvgVector';
