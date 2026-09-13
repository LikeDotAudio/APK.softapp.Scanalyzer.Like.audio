import { SidecarSet } from './sidecars';

export interface FileItem {
  file: File;
  relativePath: string;
  name: string;
  size: number;
  type: string;
  isImage: boolean;
  ocrText?: string;
  isManual?: boolean;
  specialFlag?: string;
  emojiBadge?: string;
  exifTagsCount?: number;
  metadata?: ImageMetadata;
  /** What `main.py scan` wrote beside this file, if anything. Absent means the
   *  file has not been scanned — NOT that it has no metadata to find. */
  sidecars?: SidecarSet;
}

export interface TreeNode {
  name: string;
  path: string;
  isDir: boolean;
  fileItem?: FileItem;
  children: Map<string, TreeNode>;
  size: number;
  hasManuals?: boolean;
  /** Files beneath this directory, and how many of them carry a sidecar.
   *  Tallied on every ancestor, so a top-level folder speaks for its subtree. */
  fileCount?: number;
  scannedCount?: number;
}

export interface ImageMetadata {
  fileName: string;
  fileSize: number;
  mimeType: string;
  isManual?: boolean;
  specialFlag?: string;
  cameraModel?: string;
  dateTaken?: string;
  gpsCoords?: { lat: any; lon: any };
  dimensions?: { width: number; height: number; aspectRatio: string };
  exifTags?: Record<string, string | number | boolean>;
  rawHeaders?: Record<string, any>;
}

export interface BatchEXIFSummary {
  totalFiles: number;
  totalImages?: number;
  processedCount: number;
  exifCount: number;
  geotaggedCount: number;
  imagesWithEXIF?: number;
  cameras: Record<string, number>;
  locations?: Array<{ lat: any; lon: any; camera?: string; fileName?: string; name?: string; path?: string }>;
  geotaggedFiles: Array<{ lat: any; lon: any; camera?: string; fileName?: string; name?: string; path?: string }>;
  dateRange: { earliest?: string; latest?: string };
  dateRanges?: { earliest?: string; latest?: string };
}
