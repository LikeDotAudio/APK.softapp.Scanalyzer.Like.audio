// Part of the APK.audio project — http://APK.audio — made by Anthony Kuzub
// MIT Licence. Free, for everyone, for ever. Full text in LICENSE at the root.

export interface LyricLine {
  time?: number; // seconds, if synchronized
  text: string;
}

export interface ExtractedLyrics {
  source: 'id3-uslt' | 'id3-sylt' | 'mp4-atom' | 'vorbis-comment' | 'speech-recognition' | 'user-loaded';
  title?: string;
  language?: string;
  isSynchronized: boolean;
  lines: LyricLine[];
  rawText: string;
}

/**
 * Decode a synchsafe integer (used in ID3v2 frame sizes)
 */
function readSynchSafeInt(bytes: Uint8Array, offset: number): number {
  return (
    ((bytes[offset] & 0x7f) << 21) |
    ((bytes[offset + 1] & 0x7f) << 14) |
    ((bytes[offset + 2] & 0x7f) << 7) |
    (bytes[offset + 3] & 0x7f)
  );
}

function readInt32BE(bytes: Uint8Array, offset: number): number {
  return (
    (bytes[offset] << 24) |
    (bytes[offset + 1] << 16) |
    (bytes[offset + 2] << 8) |
    bytes[offset + 3]
  ) >>> 0;
}

function decodeText(bytes: Uint8Array, encoding: number): string {
  try {
    if (encoding === 1 || encoding === 2) {
      // UTF-16 (with or without BOM)
      const dec = new TextDecoder(encoding === 2 ? 'utf-16be' : 'utf-16le');
      return dec.decode(bytes);
    } else if (encoding === 3) {
      return new TextDecoder('utf-8').decode(bytes);
    } else {
      // ISO-8859-1
      return new TextDecoder('iso-8859-1').decode(bytes);
    }
  } catch {
    return new TextDecoder('utf-8', { fatal: false }).decode(bytes);
  }
}

/**
 * Parse ID3v2 tags from an ArrayBuffer for USLT or SYLT frames
 */
export function extractID3Lyrics(buffer: ArrayBuffer): ExtractedLyrics | null {
  const bytes = new Uint8Array(buffer);
  if (bytes.length < 10) return null;

  // Check 'ID3' header
  if (bytes[0] !== 0x49 || bytes[1] !== 0x44 || bytes[2] !== 0x33) {
    return null;
  }

  const version = bytes[3]; // e.g. 3 for ID3v2.3, 4 for ID3v2.4
  const tagSize = readSynchSafeInt(bytes, 6);
  const end = Math.min(bytes.length, 10 + tagSize);
  let pos = 10;

  while (pos + 10 < end) {
    let frameId = '';
    for (let i = 0; i < 4; i++) {
      frameId += String.fromCharCode(bytes[pos + i]);
    }

    if (!/^[A-Z0-9]{4}$/.test(frameId)) {
      break; // Reached padding
    }

    let frameSize = (version === 4)
      ? readSynchSafeInt(bytes, pos + 4)
      : readInt32BE(bytes, pos + 4);

    pos += 10;
    if (frameSize <= 0 || pos + frameSize > end) break;

    const frameBytes = bytes.subarray(pos, pos + frameSize);

    // USLT: Unsynchronized lyrics/text transcription
    if (frameId === 'USLT') {
      const encoding = frameBytes[0];
      let lang = '';
      for (let i = 1; i < 4; i++) {
        if (frameBytes[i]) lang += String.fromCharCode(frameBytes[i]);
      }

      // Descriptor is null-terminated string, followed by the lyrics body
      let delim = 4;
      if (encoding === 1 || encoding === 2) {
        // UTF-16 double null
        while (delim + 1 < frameBytes.length) {
          if (frameBytes[delim] === 0 && frameBytes[delim + 1] === 0) {
            delim += 2;
            break;
          }
          delim += 2;
        }
      } else {
        while (delim < frameBytes.length && frameBytes[delim] !== 0) {
          delim++;
        }
        delim++;
      }

      const lyricsBody = decodeText(frameBytes.subarray(delim), encoding).trim();
      if (lyricsBody.length > 0) {
        const lines = lyricsBody
          .split(/\r?\n/)
          .map((l) => ({ text: l.trim() }))
          .filter((l) => l.text.length > 0);

        return {
          source: 'id3-uslt',
          language: lang,
          isSynchronized: false,
          lines,
          rawText: lyricsBody,
        };
      }
    }

    // SYLT: Synchronized lyrics
    if (frameId === 'SYLT') {
      const encoding = frameBytes[0];
      let lang = '';
      for (let i = 1; i < 4; i++) {
        if (frameBytes[i]) lang += String.fromCharCode(frameBytes[i]);
      }
      const timeFormat = frameBytes[4]; // 1 = ms, 2 = MPEG frames
      // content type is frameBytes[5]

      let delim = 6;
      while (delim < frameBytes.length && frameBytes[delim] !== 0) delim++;
      delim++;

      const lines: LyricLine[] = [];
      let cur = delim;
      while (cur < frameBytes.length) {
        let textEnd = cur;
        while (textEnd < frameBytes.length && frameBytes[textEnd] !== 0) textEnd++;
        const lineText = decodeText(frameBytes.subarray(cur, textEnd), encoding).trim();
        cur = textEnd + 1;
        if (cur + 4 <= frameBytes.length) {
          const rawTime = readInt32BE(frameBytes, cur);
          cur += 4;
          const timeSec = timeFormat === 1 ? rawTime / 1000 : rawTime / 1000;
          if (lineText) lines.push({ time: timeSec, text: lineText });
        }
      }

      if (lines.length > 0) {
        return {
          source: 'id3-sylt',
          language: lang,
          isSynchronized: true,
          lines,
          rawText: lines.map((l) => l.text).join('\n'),
        };
      }
    }

    pos += frameSize;
  }

  return null;
}

/**
 * Parse MP4 / M4A metadata atoms for lyrics ('©lyr')
 */
export function extractMP4Lyrics(buffer: ArrayBuffer): ExtractedLyrics | null {
  const bytes = new Uint8Array(buffer);
  if (bytes.length < 32) return null;

  // Search for '©lyr' atom (0xA9, 0x6C, 0x79, 0x72)
  for (let i = 0; i < bytes.length - 8; i++) {
    if (
      bytes[i] === 0xa9 &&
      bytes[i + 1] === 0x6c &&
      bytes[i + 2] === 0x79 &&
      bytes[i + 3] === 0x72
    ) {
      // Inside '©lyr', look for child 'data' atom (0x64, 0x61, 0x74, 0x61)
      const limit = Math.min(bytes.length, i + 512);
      for (let j = i + 4; j < limit - 16; j++) {
        if (
          bytes[j] === 0x64 &&
          bytes[j + 1] === 0x61 &&
          bytes[j + 2] === 0x74 &&
          bytes[j + 3] === 0x61
        ) {
          const dataSize = readInt32BE(bytes, j - 4);
          if (dataSize > 16 && j + dataSize - 4 <= bytes.length) {
            // Text data starts 8 bytes after atom header
            const textBytes = bytes.subarray(j + 8, j - 4 + dataSize);
            const text = new TextDecoder('utf-8').decode(textBytes).trim();
            if (text.length > 0) {
              const lines = text
                .split(/\r?\n/)
                .map((l) => ({ text: l.trim() }))
                .filter((l) => l.text.length > 0);
              return {
                source: 'mp4-atom',
                isSynchronized: false,
                lines,
                rawText: text,
              };
            }
          }
        }
      }
    }
  }
  return null;
}

/**
 * Parse Vorbis Comment tags (FLAC / OGG) for LYRICS or UNSYNCEDLYRICS
 */
export function extractVorbisLyrics(buffer: ArrayBuffer): ExtractedLyrics | null {
  const bytes = new Uint8Array(buffer);
  if (bytes.length < 64) return null;

  // Scan ASCII string representations for LYRICS= or UNSYNCEDLYRICS=
  const headerCheck = new TextDecoder('iso-8859-1').decode(bytes.subarray(0, Math.min(bytes.length, 65536)));
  const match = headerCheck.match(/(?:UNSYNCEDLYRICS|LYRICS)=([^=\x00-\x1f]{10,})/i);
  if (match && match[1]) {
    const raw = match[1].trim();
    const lines = raw
      .split(/\r?\n/)
      .map((l) => ({ text: l.trim() }))
      .filter((l) => l.text.length > 0);
    return {
      source: 'vorbis-comment',
      isSynchronized: false,
      lines,
      rawText: raw,
    };
  }
  return null;
}

/**
 * Universal lyrics extractor from an audio file ArrayBuffer
 */
export function extractLyricsFromAudioBuffer(buffer: ArrayBuffer): ExtractedLyrics | null {
  const id3 = extractID3Lyrics(buffer);
  if (id3) return id3;

  const mp4 = extractMP4Lyrics(buffer);
  if (mp4) return mp4;

  const vorbis = extractVorbisLyrics(buffer);
  if (vorbis) return vorbis;

  return null;
}

/**
 * Parse an LRC (standard synchronized lyrics) string
 * Format: [mm:ss.xx] Lyric text
 */
export function parseLRC(lrcText: string): ExtractedLyrics {
  const lines: LyricLine[] = [];
  const rawLines = lrcText.split(/\r?\n/);
  const timeRegex = /\[(\d{1,2}):(\d{2})(?:\.(\d{2,3}))?\]/g;

  for (const raw of rawLines) {
    let match;
    const times: number[] = [];
    while ((match = timeRegex.exec(raw)) !== null) {
      const min = parseInt(match[1], 10);
      const sec = parseInt(match[2], 10);
      const frac = match[3] ? parseFloat('0.' + match[3]) : 0;
      times.push(min * 60 + sec + frac);
    }
    const cleanText = raw.replace(timeRegex, '').trim();
    if (cleanText) {
      if (times.length > 0) {
        for (const t of times) {
          lines.push({ time: t, text: cleanText });
        }
      } else {
        lines.push({ text: cleanText });
      }
    }
  }

  lines.sort((a, b) => (a.time ?? 0) - (b.time ?? 0));

  return {
    source: 'user-loaded',
    isSynchronized: lines.some((l) => l.time !== undefined),
    lines,
    rawText: lrcText,
  };
}
