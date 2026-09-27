// THE LEGACY VANILLA-DOM SHELL. Nothing loads it: index.html boots main.tsx
// (the React app), and no page carries the ids shell/dom.ts looks up. It is
// kept, split one job per file, so its features can be revived or ported one
// module at a time. Importing this module boots it, in the order the old
// src/main.ts did at import time.
//
// THE FIVE RECOVERED MODULES, WIRED — PLAN-925.03. Each is a finished feature
// whose call site was lost when the shell was rebuilt around a three-column
// layout instead of the tab strip they were written for. The two per-file ones
// go into the inspector (inspector/bindings.ts); the three corpus-wide ones go
// into the Libraries modal (libraries.ts).
import { loadManualInventory } from './inventory/store';
import { renderKeylistUI } from './keylist/render';
import { bindFileInputs } from './load/fileLoad';
import { bindSortedView } from './sorted/sortedView';
import { bindLibraries } from './libraries';
import { bindKeylist } from './keylist/bind';
import { bindCatalog } from './catalog';
import { setupSashDividers } from './layout/sash';
import { bindOverlayToggles } from './overlays/toggles';

export { shell } from './state';

loadManualInventory(renderKeylistUI);
bindFileInputs();
bindSortedView();
bindLibraries();
bindKeylist();
bindCatalog();
setupSashDividers();
bindOverlayToggles();
