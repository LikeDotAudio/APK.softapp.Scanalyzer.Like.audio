// Part of the APK.audio project — http://APK.audio — made by Anthony Kuzub
// MIT Licence. Free, for everyone, for ever. Full text in LICENSE at the root.

/*
 * Scanalyzer — the global footer's actions: play, what happens when a sample
 * ends (DIG), download, the selected sample as a File, and pushing a file to
 * another tab or window.
 *
 * Split out of src/App.tsx (ROAD-3769), where these were closures of App(). App
 * calls this once per render, where they used to be declared, handing over the
 * state and setters they read (`c`); the bodies are unchanged. No hooks here:
 * every hook stays in App, in its order.
 */
import type { Dispatch, SetStateAction, RefObject } from 'react'
import { resolveAudioUrl, findAudioFile } from './audioLinking'
import { type FooterTab } from './components/SampleFooter'
import { SOLO, handOffToWindow } from './soloWindow'

/** What App hands over: the selection, the footer's element and the tab transport. */
export type FooterActionsContext = {
  audioFiles: File[]
  digging: boolean
  filteredData: any[]
  footerAudioRef: RefObject<HTMLAudioElement | null>
  footerItem: any
  footerPlaying: boolean
  goToTab: (id: string) => void
  selectSound: (name: string) => void
  setDigging: Dispatch<SetStateAction<boolean>>
  setFilterText: Dispatch<SetStateAction<string>>
  setFooterPlaying: Dispatch<SetStateAction<boolean>>
  setPushedName: Dispatch<SetStateAction<string>>
  tabOwnsAudio: boolean
  tabTransportRef: { current: { play: () => void; dig: () => void } | null }
}

export function makeFooterActions(c: FooterActionsContext) {
  const {
    audioFiles, digging, filteredData, footerAudioRef, footerItem, footerPlaying, goToTab,
    selectSound, setDigging, setFilterText, setFooterPlaying, setPushedName, tabOwnsAudio,
    tabTransportRef,
  } = c;

  const footerPlay = async () => {
    // On an audio-owning tab, the footer Play IS that tab's play — drive its player (and its
    // eye), not a second element.
    if (tabOwnsAudio && tabTransportRef.current) { tabTransportRef.current.play(); return; }
    if (!footerItem || !footerAudioRef.current) return;
    if (footerPlaying) {
      footerAudioRef.current.pause();
      return;
    }
    const src = await resolveAudioUrl(audioFiles, footerItem);
    if (!src) return;
    if (footerAudioRef.current.src.startsWith('blob:')) URL.revokeObjectURL(footerAudioRef.current.src);
    footerAudioRef.current.src = src;
    footerAudioRef.current.play().catch(() => {});
  };

  const handleFooterEnded = () => {
    setFooterPlaying(false);
    if (digging) {
      const idx = filteredData.findIndex(it => it === footerItem);
      if (idx !== -1 && idx + 1 < filteredData.length) {
        selectSound(filteredData[idx + 1].metadata?.name || '');
      } else {
        setDigging(false); // Reached end of list
      }
    }
  };

  const footerDownload = async () => {
    if (!footerItem) return;
    const url = await resolveAudioUrl(audioFiles, footerItem)
    if (!url) return
    const a = document.createElement('a')
    a.href = url
    a.download = footerItem.metadata?.name || 'sample'
    document.body.appendChild(a); a.click(); document.body.removeChild(a)
  }
  // The selected sample as a File, for the footer's ⚙ Convert. A file the browser already
  // holds is handed over as-is; otherwise it is read through the same resolver Download
  // uses, and the throwaway object URL that resolver makes is released once read.
  const footerAudioFile = async (): Promise<File | null> => {
    if (!footerItem) return null;
    const held = findAudioFile(audioFiles, footerItem);
    if (held) return held;
    const url = await resolveAudioUrl(audioFiles, footerItem);
    if (!url) return null;
    try {
      const blob = await (await fetch(url)).blob();
      return new File([blob], footerItem.metadata?.name || 'sample', { type: blob.type });
    } finally {
      if (url.startsWith('blob:')) URL.revokeObjectURL(url);
    }
  }

  // Solo windows push sideways: the target screen is a window of its own, and
  // switching THIS window's hidden tab to it would leave two windows called 3D
  // and Examiner both showing the Examiner. See soloWindow.ts.
  const footerPush = (tab: FooterTab, name: string) => {
    if (SOLO) { handOffToWindow(tab, name); return; }
    setFilterText(name);
    setPushedName(name);
    goToTab(tab);
  }

  return {
    footerAudioFile, footerDownload, footerPlay, footerPush, handleFooterEnded,
  };
}
