// Part of the APK.audio project — http://APK.audio — made by Anthony Kuzub
// MIT Licence. Free, for everyone, for ever. Full text in LICENSE at the root.

/*
 * Scanalyzer — filling the library: reopening the remembered folder, the demo
 * pack, dropped .PEAK files and folders, unloading, and the notice that says
 * what a schema migration cost.
 *
 * Split out of src/App.tsx (ROAD-3769), where these were closures of App(). App
 * calls this once per render, where they used to be declared, handing over the
 * state and setters they read (`c`); the bodies are unchanged. No hooks here:
 * every hook stays in App, in its order.
 */
import type { Dispatch, SetStateAction } from 'react'
import { scanDirectoryHandle, getDirHandle, clearDirHandle, setAudioRoot, getAudioRoot, filterAudioFiles, isTauri, clearLastFolderName, readRootFile } from './audioLinking'
import { MANIFEST_FILE, manifestIsCurrent } from './manifest'
import { normalizePeakRecords, LEGACY_MIGRATION_GAPS } from './peakSchema'
import { slimForUpload, uploadHeaders, UPLOAD_CHUNK_SIZE } from './peakUpload'
import { problem } from './apkSoftapp'

/** What App hands over: the library, the selection and the setters these fill. */
export type LibraryActionsContext = {
  libraryResult: any[]
  revealTab: (id: string) => void
  selectSound: (name: string) => void
  setAnalysisResult: Dispatch<SetStateAction<any[]>>
  setAudioFiles: Dispatch<SetStateAction<File[]>>
  setAudioRootLinked: Dispatch<SetStateAction<string>>
  setCurrentSound: Dispatch<SetStateAction<string>>
  setDemoLoading: Dispatch<SetStateAction<boolean>>
  setIsDragging: Dispatch<SetStateAction<boolean>>
  setReopenName: Dispatch<SetStateAction<string | null>>
  setReopening: Dispatch<SetStateAction<boolean>>
  setSchemaNotice: Dispatch<SetStateAction<string>>
}

export function makeLibraryActions(c: LibraryActionsContext) {
  const {
    libraryResult, revealTab, selectSound, setAnalysisResult, setAudioFiles, setAudioRootLinked,
    setCurrentSound, setDemoLoading, setIsDragging, setReopenName, setReopening, setSchemaNotice,
  } = c;

  // Reopen the remembered folder: re-request read permission (the button click is the
  // required user gesture), re-walk it including .PEAK sidecars, and load the cached
  // records back in — no re-analysis.
  const reopenFolder = async () => {
    setReopening(true);
    try {
      if (isTauri()) {
        // Desktop: the native scan wrote an aggregate .PEAK in the folder. Read it back
        // directly (paged) — the same path the scan itself uses — so reopening loads the
        // cached analysis with no re-scan. Fall back to the Scanalyze tab if there's no
        // cached .PEAK to read.
        const dir = getAudioRoot();
        if (!dir) { revealTab('scanalyze'); return; }
        try {
          const { invoke } = await import('@tauri-apps/api/core');
          // Prefer the slim manifest (fast — a fraction of the bytes); fall back to the
          // full aggregate .PEAK if the manifest is absent or written by another engine.
          let count: number;
          try {
            count = await invoke<number>('open_manifest', { directory: dir });
          } catch {
            count = await invoke<number>('open_peak_file', { directory: dir });
          }
          const PAGE = 2000;
          const all: any[] = [];
          for (let offset = 0; offset < count; offset += PAGE) {
            const page = await invoke<string>('read_peak_page', { offset, limit: PAGE });
            all.push(...normalizePeakRecords(JSON.parse(page)).records);
          }
          await invoke('close_peak_file');
          if (all.length) { setAnalysisResult(all); revealTab('cloud'); }
          else revealTab('scanalyze');
        } catch (err) {
          console.warn('Reopen: no cached .PEAK for', dir, '— falling back to Scanalyze.', err);
          revealTab('scanalyze');
        }
        return;
      }
      const handle = await getDirHandle();
      if (!handle) { clearLastFolderName(); return; }
      const perm = await handle.requestPermission({ mode: 'read' } as any);
      if (perm !== 'granted') return;
      const all = await scanDirectoryHandle(handle, true); // audio + .PEAK sidecars
      setAudioFiles(filterAudioFiles(all));
      const peaks = all.filter(f => /\.peak$/i.test(f.name));

      // Fast path: a slim manifest cached at the root lets us skip reading every
      // per-file sidecar. Trust it only when a one-sidecar version probe agrees it was
      // written by the same engine as the sidecars now on disk.
      const manifestText = await readRootFile(handle, MANIFEST_FILE);
      if (manifestText) {
        try {
          const m = JSON.parse(manifestText);
          let engine = m?.analyzer_version;
          if (peaks.length) {
            const probe = await peaks[0].text().catch(() => null);
            const pv = probe ? JSON.parse(probe)?.metadata?.analyzer_version : undefined;
            if (pv && pv !== engine) engine = '__stale__';
          }
          if (manifestIsCurrent(m, engine) && Array.isArray(m.records)) {
            const report = normalizePeakRecords(m.records);
            setAnalysisResult(report.records);
            setSchemaNotice(noticeFor(report.migrated, report.skipped));
            if (report.records.length) revealTab('cloud');
            return;
          }
        } catch { /* unreadable manifest — fall through to reading the sidecars */ }
      }

      // Read the per-file sidecars back, chunked so a 40k-file library keeps the UI alive.
      const records: any[] = [];
      const CHUNK = 300;
      for (let i = 0; i < peaks.length; i += CHUNK) {
        const texts = await Promise.all(peaks.slice(i, i + CHUNK).map(f => f.text().catch(() => null)));
        for (const t of texts) {
          if (!t) continue;
          try { const j = JSON.parse(t); records.push(...(Array.isArray(j) ? j : [j])); } catch { /* skip a bad sidecar */ }
        }
        await new Promise(r => setTimeout(r, 0));
      }
      const report = normalizePeakRecords(records);
      setAnalysisResult(report.records);
      setSchemaNotice(noticeFor(report.migrated, report.skipped));
      if (report.records.length) revealTab('cloud');
    } catch (err) {
      console.warn('Reopen failed; forgetting the remembered folder.', err);
      await clearDirHandle();
      clearLastFolderName();
    } finally {
      setReopening(false);
      setReopenName(null);
    }
  };

  // Load the bundled demo pack — 60 curated samples (music + SFX) with pre-computed
  // analysis, served from public/SampleSamplesForSampling — so a first-time visitor can
  // explore without picking a folder. Fetches the aggregate .PEAK for the analysis and
  // each audio file as a File (so playback resolves it by name, on web and desktop).
  const loadDemoPack = async () => {
    setDemoLoading(true);
    try {
      const base = `${import.meta.env.BASE_URL || '/'}SampleSamplesForSampling`;
      const peak = await (await fetch(`${base}/samples.PEAK`)).json();
      const report = normalizePeakRecords(Array.isArray(peak) ? peak : []);
      const manifest: { name: string }[] = await (await fetch(`${base}/manifest.json`)).json();
      const files: File[] = [];
      let skippedAudio = 0;
      for (const m of manifest) {
        try {
          // Encode the filename as a path segment, but keep commas literal. Vite's dev
          // static server (sirv) does NOT decode %2C back to a comma — it 404s and falls
          // through to the SPA index.html — so a comma-named sample (e.g. "AUTO, SHIFTER")
          // would be silently skipped here and later report "File not found" on playback.
          // A literal comma is valid in a path segment and every host we serve from accepts it.
          const res = await fetch(`${base}/${encodeURIComponent(m.name).replace(/%2C/g, ',')}`);
          const ctype = res.headers.get('content-type') || '';
          // A missing public file falls back to the SPA index.html (HTTP 200, text/html).
          // Blobbing that would hand GStreamer an HTML page to "decode" — skip it instead.
          if (!res.ok || ctype.includes('text/html')) { skippedAudio++; continue; }
          const blob = await res.blob();
          const f = new File([blob], m.name, { type: blob.type });
          (f as any).relPath = m.name;
          files.push(f);
        } catch { skippedAudio++; }
      }
      if (skippedAudio) console.warn(`Demo pack: ${skippedAudio} sample(s) unavailable and skipped.`);
      setAudioFiles(files);
      setAnalysisResult(report.records);
      setSchemaNotice(noticeFor(report.migrated, report.skipped));
      setReopenName(null);
      revealTab('cloud');
    } catch (err) {
      console.warn('Could not load the demo sample pack.', err);
    } finally {
      setDemoLoading(false);
    }
  };

  // Describe what a migration cost, so blank UCS/loudness columns aren't a mystery.
  const noticeFor = (migrated: number, skipped: number) => {
    const parts: string[] = [];
    if (migrated) {
      parts.push(
        `Migrated ${migrated} record(s) from an older analyzer. ` +
        `Re-scan the folder to fill in: ${LEGACY_MIGRATION_GAPS.join(', ')}.`
      );
    }
    if (skipped) parts.push(`Skipped ${skipped} unreadable record(s).`);
    return parts.join(' ');
  };

  const loadPeakFiles = (fileList: File[]) => {
    const files = fileList.filter(f => /\.peak$|\.json$/i.test(f.name) || f.type === 'application/json');
    if (files.length === 0) return;

    let allResults: any[] = [];
    let filesProcessed = 0;
    let migrated = 0;
    let skipped = 0;
    const unreadable: string[] = [];

    files.forEach(file => {
      const reader = new FileReader();
      reader.onload = (event) => {
        try {
          const json = JSON.parse(event.target?.result as string);
          if (Array.isArray(json)) {
            // A .PEAK may come from any analyzer version; re-group the old flat
            // schema so the UI's `item.metadata.*` reads don't hit undefined.
            const report = normalizePeakRecords(json);
            allResults = [...allResults, ...report.records];
            migrated += report.migrated;
            skipped += report.skipped;
          } else {
            console.error("Invalid .peak file format in", file.name);
            unreadable.push(file.name);
          }
        } catch (err) {
          console.error("Failed to parse .peak file", file.name, err);
          unreadable.push(file.name);
        }

        filesProcessed++;
        if (filesProcessed === files.length) {
           setAnalysisResult(allResults);
           setSchemaNotice(noticeFor(migrated, skipped));
           if (unreadable.length) {
             problem('bad_json', { subject: unreadable.length === 1 ? unreadable[0] : `${unreadable.length} .PEAK files`,
               detail: `Not a .PEAK record list: ${unreadable.slice(0, 5).join(', ')}${unreadable.length > 5 ? ' …' : ''}`,
               fix: ['Drop the .PEAK sidecars Scanalyzer wrote (a JSON array of records), or re-analyze the folder to write fresh ones.'] });
           }
           setAudioFiles([]);
           setCurrentSound('');
           
           if (allResults.length > 0 && window.confirm(`Would you like to contribute these ${allResults.length} analyzed peak(s) to the shared cloud database?`)) {
             (async () => {
               const baseUrl = isTauri() ? 'https://scanalyzer.like.audio' : '.';
               let uploaded = 0;
               let failed = 0;
               let lastError = '';
               for (let i = 0; i < allResults.length; i += UPLOAD_CHUNK_SIZE) {
                 const chunk = allResults.slice(i, i + UPLOAD_CHUNK_SIZE);
                 try {
                   const res = await fetch(`${baseUrl}/api/upload_peak.php`, {
                     method: 'POST',
                     headers: uploadHeaders(),
                     // Slimmed to the stored columns. Sending raw records made a
                     // 500-record POST ~5.7 MB, over post_max_size on most hosts,
                     // which PHP discards silently.
                     body: JSON.stringify(chunk.map(slimForUpload))
                   });
                   // Count what the SERVER says it stored, not the chunk length:
                   // res.ok only meant the request arrived, and a record the
                   // endpoint skipped was still being reported as contributed.
                   if (res.ok) {
                     const body = await res.json().catch(() => null);
                     uploaded += Number(body?.stored ?? body?.inserted ?? 0);
                   } else {
                     failed += chunk.length;
                     lastError = `HTTP ${res.status}`;
                   }
                 } catch (err: any) {
                   failed += chunk.length;
                   lastError = String(err?.message || err);
                   console.error('Failed to upload chunk', err);
                 }
               }
               if (failed > 0) {
                 problem('save_failed', { subject: 'Cloud contribution',
                   detail: `Contributed ${uploaded} peak(s); ${failed} could not be uploaded (${lastError}).`,
                   fix: ['Drop the same .PEAK files again to retry — records already stored are overwritten, not duplicated.'] });
               } else if (uploaded > 0) {
                 alert(`Successfully contributed ${uploaded} peak(s) to the cloud!`);
               } else {
                 problem('save_failed', { subject: 'Cloud contribution', detail: 'No peaks were stored — the server accepted the upload but recorded nothing.',
                   fix: ['Check the upload token stored in this browser matches SCAN_UPLOAD_TOKEN on the server.'] });
               }
             })();
           }
        }
      };
      reader.readAsText(file);
    });
  }

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const files = Array.from(e.dataTransfer.files || []);
    if (!files.length) return;

    const peakFiles = files.filter(f => /\.peak$|\.json$/i.test(f.name) || f.type === 'application/json');
    const audioFilesDropped = files.filter(f => f.type.startsWith('audio/') || /\.(wav|mp3|m4a|aac|flac|aif|aiff|ogg)$/i.test(f.name));

    if (peakFiles.length > 0) {
      loadPeakFiles(peakFiles);
    }

    if (audioFilesDropped.length > 0) {
      const audioFile = audioFilesDropped[0];
      setAudioFiles(prev => [...prev, audioFile]);

      // Construct analysis record if no peak data exists for it yet
      const newRecord = {
        filename: audioFile.name,
        metadata: {
          name: audioFile.name,
          relPath: audioFile.name,
          category: 'MUSC',
          subcategory: 'TONE',
          catKey: 'MUSC-TONE',
          rootKey: 'E',
          pitch: 164.8,
          bpm: 120,
          length: 180,
          integrated_lufs: -14.2
        }
      };

      setAnalysisResult(prev => {
        const exists = prev.some(it => (it.metadata?.name || it.filename) === audioFile.name);
        return exists ? prev : [newRecord, ...prev];
      });

      selectSound(audioFile.name);
      revealTab('examiner');
    }
  }

  const handleUnloadSounds = async () => {
    if (libraryResult.length && !window.confirm(
      `Unload ${libraryResult.length.toLocaleString()} analyzed sample(s)? The 3D cloud, the 2D charts and the file list will be cleared. Your .PEAK sidecars stay on disk, so re-scanning the folder reads them straight back.`
    )) return;

    setAudioFiles([]);
    setAnalysisResult([]);
    setCurrentSound('');
    setSchemaNotice('');
    setAudioRoot('');
    setAudioRootLinked('');
    await clearDirHandle();
  }

  return {
    handleDrop, handleUnloadSounds, loadDemoPack, reopenFolder,
  };
}
