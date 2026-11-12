// Part of the APK.audio project — http://APK.audio — made by Anthony Kuzub
// MIT Licence. Free, for everyone, for ever. Full text in LICENSE at the root.

/*
 * Scanalyzer — favorites: the debounced write of favorites.json (with its
 * localStorage mirror) and toggling one sample in or out.
 *
 * Split out of src/App.tsx (ROAD-3769), where these were closures of App(). App
 * calls this once per render, where they used to be declared, handing over the
 * state and setters they read (`c`); the bodies are unchanged. No hooks here:
 * every hook stays in App, in its order.
 */
import type { Dispatch, SetStateAction } from 'react'
import { FAVORITES_FILE, FAVORITES_STORAGE_KEY, favoriteKeyOf, buildFavorites, type Favorites } from './favorites'
import { fsaSupported, getDirHandle, getAudioRoot, isTauri, writeRootFile, ensureReadwrite } from './audioLinking'

/** What App hands over: the favorites setter and the three refs the writer reads. */
export type FavoriteActionsContext = {
  favCanWriteRef: { current: boolean | null }
  favPersistTimerRef: { current: number | null }
  favoritesRef: { current: Favorites }
  setFavorites: Dispatch<SetStateAction<Favorites>>
}

export function makeFavoriteActions(c: FavoriteActionsContext) {
  const {
    favCanWriteRef, favPersistTimerRef, favoritesRef, setFavorites,
  } = c;

  // Debounced (500 ms after the last toggle): serialize the whole file, last write wins.
  const persistFavorites = () => {
    if (favPersistTimerRef.current) clearTimeout(favPersistTimerRef.current);
    favPersistTimerRef.current = window.setTimeout(async () => {
      favPersistTimerRef.current = null;
      const text = buildFavorites(favoritesRef.current);
      try { localStorage.setItem(FAVORITES_STORAGE_KEY, text); } catch { /* mirror only */ }
      try {
        if (isTauri()) {
          const dir = getAudioRoot();
          if (dir) {
            const { invoke } = await import('@tauri-apps/api/core');
            await invoke('write_root_text', { directory: dir, fileName: FAVORITES_FILE, text });
          }
        } else if (fsaSupported() && favCanWriteRef.current) {
          const handle = await getDirHandle();
          if (handle) await writeRootFile(handle, FAVORITES_FILE, text);
        }
      } catch (err) {
        console.warn('Could not write favorites.json — favorites live in this session only.', err);
      }
    }, 500);
  };

  const toggleFavorite = (item: any) => {
    const key = favoriteKeyOf(item);
    if (!key) return;
    // First toggle on web: upgrade the folder grant to readwrite while we still hold the
    // user activation this call rode in on (keydown/click). Asked once per session.
    if (!isTauri() && fsaSupported() && favCanWriteRef.current == null) {
      favCanWriteRef.current = false; // don't re-prompt while the first ask is in flight
      getDirHandle()
        .then(h => (h ? ensureReadwrite(h) : false))
        .then(ok => { favCanWriteRef.current = !!ok; if (ok) persistFavorites(); });
    }
    setFavorites(prev => {
      const next = new Map(prev);
      if (next.has(key)) next.delete(key);
      else next.set(key, Math.floor(Date.now() / 1000));
      return next;
    });
    persistFavorites();
  };

  return {
    toggleFavorite,
  };
}
