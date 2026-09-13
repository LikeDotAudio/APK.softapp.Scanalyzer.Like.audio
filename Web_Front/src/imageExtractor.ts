import ExifReader from 'exifreader';
import { FileItem, ImageMetadata, BatchEXIFSummary } from './types';

export async function extractImageMetadata(fileItem: FileItem): Promise<ImageMetadata> {
  const file = fileItem.file;
  const metadata: ImageMetadata = {
    fileName: fileItem.name,
    fileSize: fileItem.size,
    mimeType: file.type || getMimeTypeFromExtension(fileItem.name),
    exifTags: {}
  };

  // 1. Get image dimensions
  if (fileItem.isImage) {
    try {
      const dimensions = await getImageDimensions(file);
      metadata.dimensions = dimensions;
    } catch (err) {
      console.warn('Could not read image dimensions:', err);
    }
  }

  // 2. Read EXIF / IPTC metadata
  try {
    const arrayBuffer = await file.arrayBuffer();
    const tags = ExifReader.load(arrayBuffer, { expanded: true });
    const formattedTags: Record<string, string | number | boolean> = {};

    if (tags.exif) {
      for (const [key, value] of Object.entries(tags.exif)) {
        if (value && typeof value === 'object' && 'description' in value) {
          formattedTags[key] = (value as any).description;
        }
      }
    }

    if (tags.file) {
      for (const [key, value] of Object.entries(tags.file)) {
        if (value && typeof value === 'object' && 'description' in value) {
          formattedTags[`File_${key}`] = (value as any).description;
        }
      }
    }

    if (tags.iptc) {
      for (const [key, value] of Object.entries(tags.iptc)) {
        if (value && typeof value === 'object' && 'description' in value) {
          formattedTags[`IPTC_${key}`] = (value as any).description;
        }
      }
    }

    metadata.exifTags = formattedTags;
    metadata.rawHeaders = tags;

    // Parse specific traits: Camera, Date, GPS
    const make = formattedTags['Make'] || formattedTags['File_Make'] || '';
    const model = formattedTags['Model'] || formattedTags['File_Model'] || '';
    if (make || model) {
      metadata.cameraModel = `${make} ${model}`.trim();
    }

    const dateTaken = formattedTags['DateTimeOriginal'] || formattedTags['CreateDate'] || formattedTags['DateTime'] || '';
    if (dateTaken) {
      metadata.dateTaken = String(dateTaken);
    }

    if (tags.gps && tags.gps.Latitude && tags.gps.Longitude) {
      metadata.gpsCoords = {
        lat: String(tags.gps.Latitude),
        lon: String(tags.gps.Longitude)
      };
    } else if (formattedTags['GPSLatitude'] && formattedTags['GPSLongitude']) {
      metadata.gpsCoords = {
        lat: String(formattedTags['GPSLatitude']),
        lon: String(formattedTags['GPSLongitude'])
      };
    }
  } catch (err) {
    // Non-image or file without EXIF headers
  }

  // Determine file Emoji Decoration Badge
  fileItem.metadata = metadata;
  fileItem.exifTagsCount = Object.keys(metadata.exifTags || {}).length;
  fileItem.emojiBadge = determineEmojiBadge(fileItem, metadata);

  return metadata;
}

/**
 * Assigns descriptive Emoji badges based on EXIF metadata and file attributes.
 */
function determineEmojiBadge(fileItem: FileItem, metadata: ImageMetadata): string {
  const ext = fileItem.name.split('.').pop()?.toLowerCase() || '';
  const nameLower = fileItem.relativePath.toLowerCase();
  const schematicKeywords = ['dwg', 'schematic', 'diagram', 'circuit', 'layout', 'blueprint', 'trace', 'drawing', 'outline', 'knit', 'dwgs', 'iss', 'prelim', 't1202a', 'm480c', 'st2442', 'l3242a'];

  if (schematicKeywords.some(k => nameLower.includes(k))) {
    return '📐'; // Technical Schematic / Blueprint / Line Art
  }
  if (metadata.gpsCoords) {
    return '📍📷'; // GPS Geotagged Camera Photo
  }
  if (metadata.cameraModel) {
    return '📷'; // Camera Photo
  }
  if (metadata.dateTaken) {
    return '📅📷'; // Timestamped Photo
  }
  if (metadata.dimensions && (metadata.dimensions.width >= 3000 || metadata.dimensions.height >= 3000)) {
    return '⚡🖼️'; // Ultra High-Res Image
  }
  if (ext === 'svg') return '📐';
  if (ext === 'pdf') return '📑';
  if (['mp3', 'wav', 'flac', 'aac'].includes(ext)) return '🎵';
  if (['mp4', 'mov', 'avi', 'mkv'].includes(ext)) return '📹';
  if (['xlsx', 'xls', 'csv', 'json', 'xml'].includes(ext)) return '📊';
  if (fileItem.isImage) return '🖼️';
  return '📄';
}

/**
 * Batch EXIF crunching pipeline across ALL files in dataset.
 */
export async function crunchAllEXIF(
  fileItems: FileItem[],
  onProgress?: (processed: number, total: number, currentItem: FileItem) => void
): Promise<BatchEXIFSummary> {
  const summary: BatchEXIFSummary = {
    totalFiles: fileItems.length,
    processedCount: 0,
    exifCount: 0,
    geotaggedCount: 0,
    cameras: {},
    dateRange: {},
    geotaggedFiles: []
  };

  const batchSize = 8;
  for (let i = 0; i < fileItems.length; i += batchSize) {
    const chunk = fileItems.slice(i, i + batchSize);
    await Promise.all(
      chunk.map(async (item) => {
        const meta = await extractImageMetadata(item);
        summary.processedCount++;

        const tagsCount = Object.keys(meta.exifTags || {}).length;
        if (tagsCount > 0) {
          summary.exifCount++;
        }

        if (meta.cameraModel) {
          summary.cameras[meta.cameraModel] = (summary.cameras[meta.cameraModel] || 0) + 1;
        }

        if (meta.gpsCoords) {
          summary.geotaggedCount++;
          summary.geotaggedFiles.push({
            name: item.name,
            path: item.relativePath,
            lat: meta.gpsCoords.lat,
            lon: meta.gpsCoords.lon,
            camera: meta.cameraModel
          });
        }

        if (meta.dateTaken) {
          const dateStr = meta.dateTaken;
          if (!summary.dateRange.earliest || dateStr < summary.dateRange.earliest) {
            summary.dateRange.earliest = dateStr;
          }
          if (!summary.dateRange.latest || dateStr > summary.dateRange.latest) {
            summary.dateRange.latest = dateStr;
          }
        }

        if (onProgress) {
          onProgress(summary.processedCount, fileItems.length, item);
        }
      })
    );
  }

  return summary;
}

function getImageDimensions(file: File): Promise<{ width: number; height: number; aspectRatio: string }> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);

    img.onload = () => {
      const width = img.naturalWidth;
      const height = img.naturalHeight;
      const gcd = (a: number, b: number): number => (b === 0 ? a : gcd(b, a % b));
      const divisor = gcd(width, height);
      const ratio = `${width / divisor}:${height / divisor}`;

      URL.revokeObjectURL(url);
      resolve({ width, height, aspectRatio: ratio });
    };

    img.onerror = (err) => {
      URL.revokeObjectURL(url);
      reject(err);
    };

    img.src = url;
  });
}

function getMimeTypeFromExtension(filename: string): string {
  const ext = filename.split('.').pop()?.toLowerCase();
  switch (ext) {
    case 'jpg':
    case 'jpeg':
      return 'image/jpeg';
    case 'png':
      return 'image/png';
    case 'gif':
      return 'image/gif';
    case 'webp':
      return 'image/webp';
    case 'svg':
      return 'image/svg+xml';
    case 'bmp':
      return 'image/bmp';
    case 'tif':
    case 'tiff':
      return 'image/tiff';
    default:
      return 'application/octet-stream';
  }
}
