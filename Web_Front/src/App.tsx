// Part of the APK.audio project — http://APK.audio — made by Anthony Kuzub
// MIT Licence. Free, for everyone, for ever. Full text in LICENSE at the root.
import { useState, useEffect, useMemo, useRef, useCallback } from 'react'
import './index.css'
import { fsaSupported, getDirHandle, scanDirectoryHandle, clearDirHandle, getAudioRoot, isTauri, getLastFolderName, resolveAudioUrl, readRootFile } from './audioLinking'
import { FAVORITES_FILE, FAVORITES_STORAGE_KEY, favoriteKeyOf, parseFavorites, type Favorites } from './favorites'
import SampleFooter, { type FooterTab } from './components/SampleFooter'
import LayersMenu from './components/examiner/LayersMenu'
import Header from './components/Header'
import ScanalyzeTab from './components/ScanalyzeTab'
import CloudTab from './components/CloudTab'
import StatsTabRaw from './components/StatsTab'
import GroupsTabRaw from './components/GroupsTab'
import ExaminerTabRaw from './components/ExaminerTab'
import ExtractorTabRaw from './components/ExtractorTab'
import RenameTabRaw from './components/RenameTab'
import FaceBallTabRaw from './components/FaceBallTab/FaceBallTab'
import DevicesTabRaw from './components/DevicesTab'
import SongTabRaw from './components/SongTab'
import ScopeBar from './components/ScopeBar'
import { matchesScope } from './groupColors'
import { altCategory, altSubcategory } from './ucsIndex'
import { compileQuery, subKey } from './ucsSynonyms'
import { UCS_SYNONYMS } from './ucsSynonymData'
import { SOLO, handOffToWindow, receiveHandOff } from './soloWindow'
import { lazy, Suspense } from 'react'
import { fetchRecordings, isRecording, type RecordingsLoad } from './recordings'
import RecordingPanel from './components/RecordingPanel'
import { makeFavoriteActions } from './appFavorites'
import { makeFooterActions } from './appFooter'
import { makeLibraryActions } from './appLibrary'

const StatsTab = lazy(async () => ({ default: StatsTabRaw }))
const GroupsTab = lazy(async () => ({ default: GroupsTabRaw }))
const ExaminerTab = lazy(async () => ({ default: ExaminerTabRaw }))
const ExtractorTab = lazy(async () => ({ default: ExtractorTabRaw }))
const RenameTab = lazy(async () => ({ default: RenameTabRaw }))
const FaceBallTab = lazy(async () => ({ default: FaceBallTabRaw }))
const DevicesTab = lazy(async () => ({ default: DevicesTabRaw }))
const SongTab = lazy(async () => ({ default: SongTabRaw }))

const TAB_IDS = ['scanalyze', 'song', 'devices', 'cloud', 'faceball', 'stats', 'groups', 'examiner', 'favorites', 'extractor', 'rename'] as const;

function tabFromHash(): string {
  const h = window.location.hash.replace(/^#\/?/, '');
  return (TAB_IDS as readonly string[]).includes(h) ? h : 'scanalyze';
}

function App() {
  // The scanned library — what Scanalyze, reopen, the demo pack and dropped .PEAKs fill,
  // and the only thing the file-writing tabs (Scanalyze, Extractor, Rename) are handed.
  const [libraryResult, setAnalysisResult] = useState<any[]>([])
  // The bench's recordings (recordings.ts) — every device the capture recorder keeps, one
  // record per leaf. Held apart so a scan or an unload never writes or drops them; the
  // views read both as one corpus.
  const [recordings, setRecordings] = useState<RecordingsLoad | null>(null)
  const [recordingsBusy, setRecordingsBusy] = useState(false)
  const [recordingPanelOpen, setRecordingPanelOpen] = useState(true)
  const analysisResult = useMemo(
    () => (recordings?.records.length ? libraryResult.concat(recordings.records) : libraryResult),
    [libraryResult, recordings],
  )
  const loadRecordings = useCallback(async (every: boolean) => {
    setRecordingsBusy(true);
    try {
      const got = await fetchRecordings(every);
      if (got) setRecordings(got);
    } finally {
      setRecordingsBusy(false);
    }
  }, []);
  // Served by an APK.audio portal: the recordings are part of the corpus from the start.
  useEffect(() => { void loadRecordings(false); }, [loadRecordings]);
  const [audioFiles, setAudioFiles] = useState<File[]>([])
  // DB Live Status for Web deployment
  const [dbStatus, setDbStatus] = useState<{ online: boolean; records: number; checked: boolean }>({ online: false, records: 0, checked: false });
  // Re-read the live row count. Called on mount AND after a scan finishes
  // contributing — it used to run only on mount, so the number on screen stayed
  // frozen at whatever it was when the page loaded, no matter how much the scan
  // had just added.
  const refreshDbStatus = useCallback(() => {
    const baseUrl = isTauri() ? 'https://scanalyzer.like.audio' : '.';
    fetch(`${baseUrl}/api/db_status.php`)
      .then(res => res.json())
      .then(data => {
        setDbStatus({ online: data.status === 'online', records: data.records || 0, checked: true });
      })
      .catch(() => setDbStatus({ online: false, records: 0, checked: true }));
  }, []);
  useEffect(() => { refreshDbStatus(); }, [refreshDbStatus]);

  const [activeTab, setActiveTab] = useState(tabFromHash())
  const [isAnalyzing, setIsAnalyzing] = useState(false)
  const [progress, setProgress] = useState(0)
  const [currentSound, setCurrentSound] = useState('')

  // ---- Selection history: step back through what you were just listening to.
  //
  // A ring of the last selections with a cursor into it. `selectSound` is what
  // every tab calls, and it records; Back/Forward set the selection directly and
  // only move the cursor — routing them through `selectSound` would push the
  // step back onto the history and you could never leave the last two entries.
  const SELECTION_HISTORY_MAX = 11; // the current pick plus ten to go back through
  const [history, setHistory] = useState<string[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);

  const selectSound = useCallback((name: string) => {
    setCurrentSound(name);
    setRecordingPanelOpen(true);
    if (!name) return;
    setHistory((prev) => {
      // Re-picking what is already selected is not a new history entry.
      if (prev[historyIndex] === name) return prev;
      // A new pick after going back discards the forward entries — the usual
      // browser rule, and the only one that keeps Forward meaning "where I came
      // back from" rather than an unrelated branch.
      const kept = prev.slice(0, historyIndex + 1);
      kept.push(name);
      const trimmed = kept.slice(-SELECTION_HISTORY_MAX);
      setHistoryIndex(trimmed.length - 1);
      return trimmed;
    });
  }, [historyIndex]);

  const canGoBack = historyIndex > 0;
  const canGoForward = historyIndex >= 0 && historyIndex < history.length - 1;
  const goBack = useCallback(() => {
    setHistoryIndex((i) => {
      if (i <= 0) return i;
      setCurrentSound(history[i - 1]);
      return i - 1;
    });
  }, [history]);
  const goForward = useCallback(() => {
    setHistoryIndex((i) => {
      if (i < 0 || i >= history.length - 1) return i;
      setCurrentSound(history[i + 1]);
      return i + 1;
    });
  }, [history]);
  // Set when a loaded .PEAK predates the grouped schema and had to be migrated.
  const [schemaNotice, setSchemaNotice] = useState('')
  // Desktop only: the absolute folder relative .PEAK paths resolve against.
  const [audioRootLinked, setAudioRootLinked] = useState(getAudioRoot())
  // A previously scanned folder we can offer to reopen on startup: its display name,
  // plus a busy flag while its cached sidecars are being read back in.
  const [reopenName, setReopenName] = useState<string | null>(null)
  const [reopening, setReopening] = useState(false)
  const [demoLoading, setDemoLoading] = useState(false)

  // Global Scope State
  const [scopeGroup, setScopeGroup] = useState<string | null>(null)
  const [scopeSub, setScopeSub] = useState<string | null>(null)
  const [filterText, setFilterText] = useState('')
  const [altRanks, setAltRanks] = useState<Set<number>>(new Set())
  // Scope = an explicitly-picked category/subcategory (matchesScope) plus the free-text
  // filter. The alphabet scrubber only pages the category CHIPS in ScopeBar; it no longer
  // filters the data. (It used to also drive a `scopeLetters` window that defaulted to A–E
  // on mount, so the whole app booted showing only categories A–E — a hidden filter nobody
  // set. That coupling is gone.)
  // The free text also goes through the UCS synonym library (ucsSynonyms.ts): "sedan"
  // finds a record filed VEHICLES › CAR even though no field says "sedan". Compiled once
  // per keystroke, not per record; if it cannot expand, it is the old substring filter.
  const filterQuery = useMemo(() => compileQuery(UCS_SYNONYMS, filterText), [filterText])
  const scopedData = useMemo(() => {
    return analysisResult.filter(it => {
      if (!matchesScope(it, scopeGroup, scopeSub, altRanks)) return false;
      if (!filterText.trim()) return true;

      const alts = it.ucs?.alternatives || [];
      const altText = alts.map((a: any) => `${altCategory(a)} ${altSubcategory(a)}`).join(' ');
      const haystack = `${it.metadata?.name || ''} ${it.classification?.group || ''} ${it.classification?.subgroup || ''} ${it.ucs?.category || ''} ${it.ucs?.subcategory || ''} ${altText} ${it.classification?.timbre || ''} ${it.musicality?.root_note_name || ''} ${it.classification?.reason?.[0] || ''}`
        .toLowerCase();
      const keys = [subKey(it.ucs?.category, it.ucs?.subcategory),
        ...alts.map((a: any) => subKey(altCategory(a), altSubcategory(a)))];
      return filterQuery.test(haystack, keys);
    });
  }, [analysisResult, scopeGroup, scopeSub, filterText, filterQuery, altRanks])

  // What every tab renders: the scoped set. (The old Groups hide/show filter was retired.)
  const filteredData = scopedData
  // …less the recordings, for the tabs that write files: there is no audio behind them.
  const libraryRows = useMemo(
    () => (recordings?.records.length ? filteredData.filter(it => !isRecording(it)) : filteredData),
    [filteredData, recordings],
  )

  // Global footer transport: every tab reports the sample it's playing via onSound
  // (its name), so we can resolve the whole record here and drive one shared footer —
  // download / play-stop and "push to any tab" — from any page.
  const footerAudioRef = useRef<HTMLAudioElement>(null)
  // The same element as state, so children that visualize it (the 3D EYE overlay)
  // re-render when it mounts — a ref alone wouldn't trigger that first render.
  const [footerAudioEl, setFooterAudioEl] = useState<HTMLAudioElement | null>(null)
  const [footerPlaying, setFooterPlaying] = useState(false)
  const footerItem = useMemo(
    () => (currentSound ? analysisResult.find(it => (it.metadata?.name || '') === currentSound) || null : null),
    [currentSound, analysisResult],
  )

  // Favorites — one Map (relative path → favorited_unix) owned here, because the F key
  // works on every tab, the orange paints four surfaces, and favorites.json has exactly
  // one writer. Persisted as a SIBLING of the manifest (user data — re-scans regenerate
  // the manifest but never touch favorites.json), with a localStorage mirror for the
  // demo pack / denied-grant cases. See Documentation/Action Artifact/favorites_tab_audit.md.
  const [favorites, setFavorites] = useState<Favorites>(new Map())
  const favoritesRef = useRef(favorites); favoritesRef.current = favorites;
  const favPersistTimerRef = useRef<number | null>(null)
  // Whether the web folder handle has a readwrite grant: null = not asked yet.
  const favCanWriteRef = useRef<boolean | null>(null)

  // Persisting and toggling favorites: src/appFavorites.ts.
  const {
    toggleFavorite,
  } = makeFavoriteActions({
    favCanWriteRef, favPersistTimerRef, favoritesRef, setFavorites,
  });

  // Load favorites whenever a library opens (scan, reopen, demo, dropped .PEAKs — every
  // path lands here when analysisResult fills). Disk first, localStorage mirror second.
  const hasData = analysisResult.length > 0;
  useEffect(() => {
    if (!hasData) return;
    let cancelled = false;
    (async () => {
      let text: string | null = null;
      try {
        if (isTauri()) {
          const dir = getAudioRoot();
          if (dir) {
            const { invoke } = await import('@tauri-apps/api/core');
            text = await invoke<string>('read_root_text', { directory: dir, fileName: FAVORITES_FILE }).catch(() => null);
          }
        } else if (fsaSupported()) {
          const handle = await getDirHandle();
          if (handle) text = await readRootFile(handle, FAVORITES_FILE);
        }
      } catch { /* fall through to the mirror */ }
      if (text == null) { try { text = localStorage.getItem(FAVORITES_STORAGE_KEY); } catch { /* none */ } }
      if (!cancelled) setFavorites(parseFavorites(text));
    })();
    return () => { cancelled = true; };
  }, [hasData]);

  // F flags whatever the footer readout is on — playing or just-finished. Same guards as
  // every other global key: never while typing, never on key repeat.
  const footerItemRef = useRef(footerItem); footerItemRef.current = footerItem;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'f' && e.key !== 'F') return;
      if (e.repeat || e.ctrlKey || e.metaKey || e.altKey) return;
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return;
      const item = footerItemRef.current;
      if (!item) return;
      e.preventDefault();
      toggleFavorite(item);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // The Favorites tab's rows: the scoped/filtered set ∩ the favorites set, so the scope
  // bar narrows favorites exactly like every other tab.
  const favoriteRows = useMemo(
    () => filteredData.filter(it => favorites.has(favoriteKeyOf(it))),
    [filteredData, favorites],
  );

  // Some tabs own their OWN <audio> element because it feeds a live visual (the Examiner's
  // eye + VU/phase meters, the Extractor's wave circle and region loops). On those tabs the
  // shared footer audio would be a SECOND element playing the same file — out of sync with
  // the eye, and audible as a double. So an audio-owning tab registers its transport here,
  // and the footer's Play/Dig delegate to it (and mirror ITS playing/digging state) instead
  // of driving footerAudioRef. See ExaminerTab / ExtractorTab `registerTransport`.
  const tabTransportRef = useRef<{ play: () => void; dig: () => void } | null>(null)
  const [tabPlaying, setTabPlaying] = useState(false)
  const [tabDigging, setTabDigging] = useState(false)
  const tabOwnsAudio = activeTab === 'examiner' || activeTab === 'extractor' || activeTab === 'favorites' || activeTab === 'song'

  // Keep the active tab in sync with the URL hash (linkable / back-forward).
  useEffect(() => {
    const onHash = () => setActiveTab(tabFromHash());
    window.addEventListener('hashchange', onHash);
    if (!window.location.hash) window.location.hash = '#/scanalyze';
    return () => window.removeEventListener('hashchange', onHash);
  }, [])

  // Re-link the audio folder we remember, so samples play again after a reload.
  //
  // Chrome only hands a stored directory handle back on `granted`; if the grant has
  // lapsed to `prompt`, re-requesting it REQUIRES a user gesture, and there is no
  // "Load Sounds" button any more to supply one. So we borrow the gesture the user is
  // already making: the first click anywhere in the app re-asks. Clicking a point in
  // the cloud to hear it is itself the gesture that makes it audible.
  //
  // Without this the app looked linked, listed every sample, and played nothing.
  useEffect(() => {
    if (!fsaSupported()) return;
    let done = false;

    const link = async (mayPrompt: boolean) => {
      if (done) return;
      const handle = await getDirHandle();
      if (!handle) return;
      const options = { mode: 'read' } as any;
      let state = await handle.queryPermission(options);
      if (state !== 'granted') {
        if (!mayPrompt) return;                       // no gesture yet — wait for one
        state = await handle.requestPermission(options);
        if (state !== 'granted') return;              // the user said no; respect it
      }
      try {
        done = true;
        setAudioFiles(await scanDirectoryHandle(handle));
      } catch (err) {
        // The folder was moved, renamed or deleted since we stored the handle. Drop it,
        // or it throws on every load and every click for ever after.
        console.warn('Remembered audio folder is gone; forgetting it.', err);
        done = true;
        await clearDirHandle();
      }
    };

    void link(false);                                  // already granted? link silently.
    const onGesture = () => { void link(true); };
    window.addEventListener('pointerdown', onGesture);
    return () => window.removeEventListener('pointerdown', onGesture);
  }, []);

  // Offer to reopen a previously scanned folder. If one is remembered — a granted FSA
  // directory handle on the web, or a linked audio root on the desktop — surface a
  // prompt on startup. Reopening reads the cached .PEAK sidecars back in, no re-analysis.
  useEffect(() => {
    // Read the remembered folder name synchronously from the localStorage "cookie"
    // (set the last time a folder was picked), so the prompt appears immediately.
    if (isTauri()) {
      const root = getAudioRoot();
      if (root) setReopenName(root.split(/[\\/]/).pop() || root);
      return;
    }
    if (!fsaSupported()) return;
    const name = getLastFolderName();
    if (name) setReopenName(name);
  }, []);

  // …but a solo window fills itself, without asking.
  //
  // The prompt exists because reopening needs permission and permission needs a
  // gesture. When the grant is still `granted` no gesture is required, and the
  // shell has eight windows onto the same folder: making every one of them open
  // with the same blue bar, and charging a click each to answer it, is the cost
  // of breaking the tabs out charged back to the user eight times. Where the
  // grant HAS lapsed the bar is still there and still the way in.
  useEffect(() => {
    if (!SOLO || isTauri() || !fsaSupported()) return;
    let cancelled = false;
    (async () => {
      const handle = await getDirHandle();
      if (!handle || cancelled) return;
      const state = await handle.queryPermission({ mode: 'read' } as any);
      if (state !== 'granted' || cancelled) return;
      reopenFolder();
    })();
    return () => { cancelled = true; };
  }, []);

  const goToTab = (id: string) => { window.location.hash = `#/${id}`; setActiveTab(id); }

  // "Now look at the result" — the jump this app makes for you after a folder
  // opens, a scan lands or a file is dropped. A solo window is one screen with
  // its name on the shell's title bar, so making it become another screen is the
  // one move it must not make: the reveal is dropped, and the window that owns
  // that screen is opened instead where a real click asked for it (onViewCloud,
  // footerPush). See soloWindow.ts.
  const revealTab = (id: string) => { if (!SOLO) goToTab(id); }

  const [autoPlay, setAutoPlay] = useState(true);
  const [autoLoop, setAutoLoop] = useState(false);
  const [digging, setDigging] = useState(false);

  // Play a newly selected item if autoPlay or DIG is active. Skipped on audio-owning tabs:
  // those play the selection through their OWN element (so their eye/meters follow it), and
  // letting the footer element ALSO start it would double the audio.
  useEffect(() => {
    if ((autoPlay || digging) && footerItem && footerAudioRef.current && !tabOwnsAudio) {
      (async () => {
        const src = await resolveAudioUrl(audioFiles, footerItem);
        if (src) {
          if (footerAudioRef.current!.src.startsWith('blob:')) URL.revokeObjectURL(footerAudioRef.current!.src);
          footerAudioRef.current!.src = src;
          footerAudioRef.current!.play().catch(() => {});
        }
      })();
    }
  }, [currentSound, autoPlay, digging]); // footerItem updates when currentSound updates

  // Pushing a file to another tab (the footer's push buttons, the cloud's Examine /
  // Extract) filters that tab to the file AND opens it there — landing on a filtered
  // list that still needs a click is half a push. `pushedName` carries the open-this
  // intent; the target tab consumes it via onAutoOpened once the row is selected.
  const [pushedName, setPushedName] = useState('');

  // The other end of that push, for whichever window was opened by it.
  useEffect(() => {
    if (!SOLO) return;
    return receiveHandOff(activeTab, (name) => { setFilterText(name); setPushedName(name); });
  }, [activeTab])

  const [isDragging, setIsDragging] = useState(false)

  // The footer's actions: src/appFooter.ts.
  const {
    footerAudioFile, footerDownload, footerPlay, footerPush, handleFooterEnded,
  } = makeFooterActions({
    audioFiles, digging, filteredData, footerAudioRef, footerItem, footerPlaying, goToTab,
    selectSound, setDigging, setFilterText, setFooterPlaying, setPushedName, tabOwnsAudio,
    tabTransportRef,
  });

  // Filling and emptying the library: src/appLibrary.ts.
  const {
    handleDrop, handleUnloadSounds, loadDemoPack, reopenFolder,
  } = makeLibraryActions({
    libraryResult, revealTab, selectSound, setAnalysisResult, setAudioFiles, setAudioRootLinked,
    setCurrentSound, setDemoLoading, setIsDragging, setReopenName, setReopening, setSchemaNotice,
  });

  const tabs = [
    { id: 'scanalyze', label: 'SCANALYZE' },
    { id: 'song', label: 'SONG' },
    // Beside SCANALYZE rather than among the views: both are the act of finding
    // things — one over a folder, one over the network — and the rest of the
    // strip reads what was found.
    { id: 'devices', label: 'DEVICES' },
    { id: 'cloud', label: '3D' },
    { id: 'faceball', label: '4D' },
    { id: 'stats', label: '2D' },
    { id: 'examiner', label: 'Examiner' },
    { id: 'favorites', label: '★ Favorites' },
    { id: 'extractor', label: 'Extractor' },
    { id: 'rename', label: 'Rename' }
  ];

  return (
    <div
      className="app-container"
      onDragOver={(e) => {
        // Only react to files being dragged in — ignore text/element drags.
        if (!Array.from(e.dataTransfer.types || []).includes('Files')) return;
        e.preventDefault();
        if (!isDragging) setIsDragging(true);
      }}
      onDragLeave={(e) => { if (e.currentTarget === e.target) setIsDragging(false); }}
      onDrop={handleDrop}
    >
      {isDragging && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, zIndex: 1000, background: 'var(--accent-primary)', color: 'black', textAlign: 'center', padding: '0.35rem', fontSize: '0.85rem', fontWeight: 600, pointerEvents: 'none' }}>
          Drop Audio File (.m4a, .wav) or .PEAK Sidecar to Load & Examine
        </div>
      )}
      <Header isAnalyzing={isAnalyzing} progress={progress} onUnloadSounds={handleUnloadSounds} audioCount={audioFiles.length} audioRoot={audioRootLinked} currentSound={currentSound} sample={footerItem} hasData={analysisResult.length > 0} activeTab={activeTab} />

      {schemaNotice && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.4rem 0.75rem', background: 'rgba(255,190,60,0.10)', borderBottom: '1px solid var(--border-color)', color: 'var(--text-secondary)', fontSize: '0.78rem' }}>
          <span style={{ flex: 1 }}>{schemaNotice}</span>
          <button className="btn" onClick={() => setSchemaNotice('')} style={{ background: 'rgba(255,255,255,0.05)', border: 'none', padding: '0.2rem 0.6rem', fontSize: '0.75rem' }}>Dismiss</button>
        </div>
      )}

      {reopenName && !libraryResult.length && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.4rem 0.75rem', background: 'rgba(59,130,246,0.12)', borderBottom: '1px solid var(--border-color)', color: 'var(--text-primary)', fontSize: '0.8rem' }}>
          <span style={{ flex: 1 }}>Reopen previously scanned folder <strong>“{reopenName}”</strong>? Its cached analysis loads without re-scanning.</span>
          <button className="btn primary" disabled={reopening} onClick={reopenFolder} style={{ padding: '0.2rem 0.7rem', fontSize: '0.75rem' }}>{reopening ? 'Opening…' : 'Open'}</button>
          <button className="btn" onClick={() => setReopenName(null)} style={{ background: 'rgba(255,255,255,0.05)', border: 'none', padding: '0.2rem 0.6rem', fontSize: '0.75rem' }}>Not now</button>
        </div>
      )}

      {/* The demo pack is an offer to LOAD something, so in the broken-out windows
          it belongs on the one that loads — otherwise the same green invitation
          rides along the top of all eight. */}
      {/* …and never on DEVICES, which has no corpus to be empty: that screen
          reads the network, so an invitation to load samples above it is an
          offer about a different application. */}
      {!libraryResult.length && activeTab !== 'devices' && (!SOLO || activeTab === 'scanalyze') && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.4rem 0.75rem', background: 'rgba(16,185,129,0.10)', borderBottom: '1px solid var(--border-color)', color: 'var(--text-primary)', fontSize: '0.8rem' }}>
          <span style={{ flex: 1 }}>New here? Load a curated pack of 30 music + 30 sound-effect samples to explore right away — no folder needed.</span>
          <button className="btn primary" disabled={demoLoading} onClick={loadDemoPack} style={{ padding: '0.2rem 0.7rem', fontSize: '0.75rem' }}>{demoLoading ? 'Loading…' : '🎧 Sample samples for sampling'}</button>
        </div>
      )}

      {/* The bench's recordings (capture recorder): in the corpus whenever this page is
          served by an APK.audio portal. Shown where the corpus is loaded from. */}
      {recordings && activeTab === 'scanalyze' && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.4rem 0.75rem', background: 'rgba(59,130,246,0.10)', borderBottom: '1px solid var(--border-color)', color: 'var(--text-primary)', fontSize: '0.8rem' }}>
          <span style={{ flex: 1 }}>
            📼 <strong>{recordings.records.length.toLocaleString()}</strong> recorded series from{' '}
            <strong>{new Set(recordings.records.map((r: any) => r.recording?.device)).size.toLocaleString()}</strong>{' '}
            {recordings.every ? 'devices (every device the recorder holds)' : 'devices that report data'} are in the corpus — scope chip RECORDING, axes “Rec · …”.
            {' '}Loaded {new Date(recordings.loadedAt).toLocaleTimeString(undefined, { hour12: false })}.
          </span>
          <button className="btn primary" disabled={recordingsBusy} onClick={() => loadRecordings(recordings.every)} style={{ padding: '0.2rem 0.7rem', fontSize: '0.75rem' }}>{recordingsBusy ? 'Reading…' : '↻ Refresh'}</button>
          <button className="btn" disabled={recordingsBusy} onClick={() => loadRecordings(!recordings.every)} style={{ background: 'rgba(255,255,255,0.05)', border: 'none', padding: '0.2rem 0.6rem', fontSize: '0.75rem' }}
            title={recordings.every ? 'Only the devices that report data — what the Recording page draws' : 'Every device the rigs hold — tens of thousands of leaves'}>
            {recordings.every ? 'Data devices only' : 'Every device'}
          </button>
          <button className="btn" onClick={() => setRecordings({ ...recordings, records: [] })} style={{ background: 'rgba(255,255,255,0.05)', border: 'none', padding: '0.2rem 0.6rem', fontSize: '0.75rem' }}>Leave out</button>
        </div>
      )}

      {/* Tabs Navigation — the window IS the tab in solo, and the OS drew its
          name on the title bar three pixels above this row. */}
      {!SOLO && (
      <nav className="tabs-nav glass-panel" role="tablist" aria-label="Scanalyzer screens" style={{ display: 'flex', gap: '2px', padding: '2px', borderTop: 'none', borderBottom: '1px solid var(--border-color)', borderRadius: '0', zIndex: 40 }}>
        {tabs.map(tab => (
          <button
            key={tab.id}
            id={`tab-${tab.id}`}
            role="tab"
            aria-selected={activeTab === tab.id}
            aria-controls="app-main-panel"
            onClick={() => goToTab(tab.id)}
            className={`btn ${activeTab === tab.id ? 'primary' : ''}`}
            style={{ 
              flex: 1,
              background: activeTab === tab.id ? 'var(--accent-primary)' : 'rgba(255,255,255,0.05)',
              color: activeTab === tab.id ? 'black' : 'var(--text-primary)',
              border: 'none',
              padding: '0.25rem 1rem',
              whiteSpace: 'nowrap',
              fontWeight: activeTab === tab.id ? 'bold' : 'normal',
              borderRadius: '2px',
            }}
          >
            {tab.label}
          </button>
        ))}
      </nav>
      )}

      {/* Global Scope Bar — the sample corpus's filter, so it is not drawn over
          DEVICES, whose rows it does not describe and cannot narrow. */}
      {analysisResult.length > 0 && activeTab !== 'devices' && (
        <div style={{ padding: '0.1rem 1rem', background: '#0d1017', borderBottom: '1px solid var(--border-color)', zIndex: 50 }}>
          <ScopeBar
            analysisResult={analysisResult}
            group={scopeGroup} sub={scopeSub} setGroup={setScopeGroup} setSub={setScopeSub}
            filterText={filterText} setFilterText={setFilterText}
            altRanks={altRanks} setAltRanks={setAltRanks}
          />
        </div>
      )}

      {/* Main Content Area */}
      {/* One panel, eight tabs: the screens are display:none siblings and a
          conditional Suspense block rather than eight separate regions, so the
          panel role belongs on the container they share. In solo the tablist is
          not rendered at all, so aria-labelledby would point at nothing — the
          window title is the label there, and this is a plain region. */}
      <main
        className="app-main"
        id="app-main-panel"
        role={SOLO ? 'region' : 'tabpanel'}
        {...(SOLO
          ? { 'aria-label': tabs.find(t => t.id === activeTab)?.label ?? 'Scanalyzer' }
          : { 'aria-labelledby': `tab-${activeTab}` })}
        style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, overflow: 'hidden', padding: 0 }}
      >
        
        <div style={{ display: activeTab === 'scanalyze' ? 'flex' : 'none', flex: 1, flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
          <ScanalyzeTab 
            analysisResult={libraryResult} 
            setAnalysisResult={setAnalysisResult}
            isAnalyzing={isAnalyzing}
            setIsAnalyzing={setIsAnalyzing}
            setProgress={setProgress}
            onViewCloud={() => { if (SOLO) handOffToWindow('cloud', ''); else goToTab('cloud'); }}
            setAudioFiles={setAudioFiles}
            onDbChanged={refreshDbStatus}
            dbStatus={dbStatus}
          />
        </div>

        <div style={{ display: activeTab === 'cloud' ? 'flex' : 'none', flex: 1, flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
          <CloudTab analysisResult={analysisResult} filteredData={scopedData} audioFiles={audioFiles} onSound={selectSound} selectedItem={footerItem} playing={footerPlaying}
            onExamine={(name) => footerPush('examiner', name)}
            onExtract={(name) => footerPush('extractor', name)}
            eyeAudio={footerAudioEl} onEyePlay={footerPlay} />
        </div>

        <Suspense fallback={<div style={{ padding: '2rem', color: 'var(--text-secondary)' }}>Loading tab...</div>}>
          {activeTab === 'song' && (
            <SongTab
              selectedItem={footerItem}
              audioFiles={audioFiles}
              onSound={selectSound}
              analysisResult={analysisResult}
            />
          )}
          {activeTab === 'stats' && <StatsTab analysisResult={analysisResult} filteredData={filteredData} audioFiles={audioFiles} onSound={selectSound} selectedItem={footerItem} />}
          {activeTab === 'devices' && <DevicesTab />}
          {activeTab === 'groups' && <GroupsTab filteredData={filteredData} />}
          {activeTab === 'examiner' && <ExaminerTab analysisResult={analysisResult} filteredData={filteredData} audioFiles={audioFiles} onSound={selectSound} autoLoop={autoLoop}
            favorites={favorites}
            autoOpenName={pushedName} onAutoOpened={() => setPushedName('')}
            registerTransport={t => { tabTransportRef.current = t; }} onPlayingChange={setTabPlaying} onDiggingChange={setTabDigging} />}
          {/* The Favorites tab IS an Examiner — same component, mounted under its own hash
              with rows pre-filtered to the favorites set. DIG here digs favorites only. */}
          {activeTab === 'favorites' && <ExaminerTab analysisResult={analysisResult} filteredData={favoriteRows} audioFiles={audioFiles} onSound={selectSound} autoLoop={autoLoop}
            favorites={favorites}
            autoOpenName={pushedName} onAutoOpened={() => setPushedName('')}
            emptyMessage="No favorites yet — press F while a sample plays, or tap ★ in the footer."
            registerTransport={t => { tabTransportRef.current = t; }} onPlayingChange={setTabPlaying} onDiggingChange={setTabDigging} />}
          {activeTab === 'extractor' && <ExtractorTab analysisResult={libraryResult} filteredData={libraryRows} audioFiles={audioFiles} onSound={selectSound} setAnalysisResult={setAnalysisResult}
            favorites={favorites}
            autoOpenName={pushedName} onAutoOpened={() => setPushedName('')}
            registerTransport={t => { tabTransportRef.current = t; }} onPlayingChange={setTabPlaying} />}
          {activeTab === 'faceball' && <FaceBallTab filteredData={scopedData} selectedItem={footerItem} onSound={selectSound}
            audioFiles={audioFiles} eyeAudio={footerAudioEl} onEyePlay={footerPlay} />}
          {activeTab === 'rename' && <RenameTab analysisResult={libraryResult} filteredData={libraryRows} audioFiles={audioFiles} />}
        </Suspense>

      </main>

      {/* A picked recording has no audio for the footer to play: say what it holds. */}
      {activeTab !== 'devices' && recordingPanelOpen && isRecording(footerItem) && (
        <RecordingPanel item={footerItem} onClose={() => setRecordingPanelOpen(false)} />
      )}

      {/* Global footer — the selected SAMPLE's transport, so it is not drawn on
          DEVICES: every button on it (download, play, dig, push to a tab) acts on
          a sample, and that screen has none to act on. */}
      {activeTab !== 'devices' && (
      <SampleFooter
        item={footerItem}
        favorite={footerItem ? favorites.has(favoriteKeyOf(footerItem)) : false}
        onToggleFavorite={() => { if (footerItem) toggleFavorite(footerItem); }}
        playing={tabOwnsAudio ? tabPlaying : footerPlaying}
        digging={tabOwnsAudio ? tabDigging : digging}
        autoPlay={autoPlay}
        autoLoop={autoLoop}
        current={activeTab as FooterTab}
        onPlay={footerPlay}
        onBack={goBack}
        onForward={goForward}
        canBack={canGoBack}
        canForward={canGoForward}
        onDig={() => { if (tabOwnsAudio && tabTransportRef.current) tabTransportRef.current.dig(); else setDigging(!digging); }}
        onToggleAutoPlay={setAutoPlay}
        onToggleAutoLoop={setAutoLoop}
        onDownload={footerDownload}
        getAudio={footerAudioFile}
        onCopyData={() => {
          if (footerItem) {
            navigator.clipboard.writeText(JSON.stringify(footerItem, null, 2));
          }
        }}
        onPush={footerPush}
        layersMenu={(activeTab === 'examiner' || activeTab === 'favorites')
          ? <LayersMenu stereo={Number(footerItem?.metadata?.channels) >= 2} />
          : undefined}
        dbStatus={dbStatus}
      />
      )}
      <audio ref={el => { footerAudioRef.current = el; setFooterAudioEl(el); }} style={{ display: 'none' }} loop={autoLoop && !digging}
        onPlay={() => setFooterPlaying(true)} onPause={() => setFooterPlaying(false)} onEnded={handleFooterEnded} />
    </div>
  )
}

export default App
