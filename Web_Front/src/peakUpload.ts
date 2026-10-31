/** Trimming a .PEAK record down to what the cloud database actually stores.
 *
 *  A full record is ~11 KB, and the overwhelming majority of it has no column
 *  to land in: the base64 waveform preview alone is 5.5 KB, and regions carry a
 *  complete nested analysis each. A 500-record POST of raw records is ~5.7 MB,
 *  which is over `post_max_size` on most shared hosts — and PHP discards an
 *  oversized body silently, handing the script an empty payload with no error.
 *  So the fix for "nothing is being added" is partly just: send less.
 *
 *  This is an explicit ALLOW-list, keyed to the columns in `init_db.php`, not a
 *  "strip anything that looks big" rule. The previous approach deleted every
 *  array in the record, which happened to delete `acoustic_types`,
 *  `instrument_family`, `classification.reason` and all of `ucs.alternatives` —
 *  six columns that have been NULL for every one of the 33,000 rows uploaded
 *  from the browser. An allow-list cannot drop a column by accident, and a new
 *  field added to the analyzer (`bioacoustic_syntax`, say) cannot silently
 *  inflate every upload.
 *
 *  THE LIST IS ONE FILE: `public/api/upload_columns.json`. `upload_peak.php`
 *  serves it (`GET upload_peak.php?columns`) and maps each field to its column,
 *  this module trims to it, and the analyzer's `db.rs` (PROCESSOR.SampleAnalyzer)
 *  asks the endpoint for it before uploading. It used to be three hand-kept
 *  lists "kept in sync" by a comment; `test/upload-columns.test.mjs` now fails
 *  when the PHP stops storing a listed field.
 */
import uploadColumns from '../public/api/upload_columns.json' with { type: 'json' };

interface ListRule { limit: number; fields: readonly string[] }
interface SectionRule { fields?: readonly string[]; lists?: Record<string, ListRule> }
export interface UploadColumns { sections: Record<string, SectionRule> }

/** The endpoint's allow-list, as bundled with this build. */
export const UPLOAD_COLUMNS: UploadColumns = uploadColumns as UploadColumns;

function pick(source: any, fields: readonly string[] = []): Record<string, any> {
  const out: Record<string, any> = {};
  if (!source || typeof source !== 'object') return out;
  for (const field of fields) {
    if (source[field] !== undefined) out[field] = source[field];
  }
  return out;
}

/** One record, reduced to the stored columns. Roughly 1/20th the bytes. Same rule
 *  as `slim` in the analyzer's `Encoders/db.rs`: every listed section is sent (empty
 *  when the record has none), lists keep their first `limit` elements. */
export function slimWith(record: any, columns: UploadColumns): any {
  const out: Record<string, any> = {};
  for (const [name, rule] of Object.entries(columns.sections)) {
    const source = record?.[name];
    const kept = pick(source, rule.fields);
    for (const [list, spec] of Object.entries(rule.lists ?? {})) {
      const items = Array.isArray(source?.[list]) ? source[list] : [];
      kept[list] = items.slice(0, spec.limit).map((item: any) => pick(item, spec.fields));
    }
    out[name] = kept;
  }
  return out;
}

/** `slimWith` over the bundled list — one argument, so `records.map(slimForUpload)` is safe. */
export function slimForUpload(record: any): any {
  return slimWith(record, UPLOAD_COLUMNS);
}

/** Request headers for an upload. When the server requires an upload token
 *  (`SCAN_UPLOAD_TOKEN`, see `public/api/db.php`), the operator stores it in this
 *  browser as localStorage `scan_upload_token`; it is sent as `X-Upload-Token`. */
export function uploadHeaders(): Record<string, string> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  try {
    const token = globalThis.localStorage?.getItem('scan_upload_token');
    if (token) headers['X-Upload-Token'] = token;
  } catch { /* no storage (private window, node): no token */ }
  return headers;
}

/** How many records to send per POST.
 *
 *  500 slimmed records is ~250 KB, comfortably inside any `post_max_size`. It is
 *  also small enough that the counter moves several times during a scan instead
 *  of once at the very end — the old threshold meant a scan of fewer than 500
 *  files uploaded nothing at all until it finished. */
export const UPLOAD_CHUNK_SIZE = 250;
