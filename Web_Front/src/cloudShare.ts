// Part of the APK.audio project — http://APK.audio — made by Anthony Kuzub
// MIT Licence. Free, for everyone, for ever. Full text in LICENSE at the root.
/** Whether a scan contributes its analysis to the shared cloud database.
 *
 *  OFF unless the person turns it on. The README promises the analysis stays on
 *  the machine unless they opt in; before this switch the browser scan POSTed
 *  every record to `upload_peak.php` and the desktop scan always handed the
 *  engine `--db-url`, so the promise held for the audio but not its analysis.
 *
 *  Every upload path reads this one value: the browser scan's batch flush, the
 *  desktop `start_analysis` (`upload`) and the desktop `sync_to_db` on open.
 *  Stored per viewer; storage that throws or is empty reads as OFF.
 */

const KEY = 'scanalyzer_cloud_share';

export function getCloudShare(): boolean {
  try {
    return localStorage.getItem(KEY) === '1';
  } catch {
    return false;
  }
}

export function setCloudShare(on: boolean): void {
  try {
    localStorage.setItem(KEY, on ? '1' : '0');
  } catch {
    /* not remembered; the default (off) still holds */
  }
}
