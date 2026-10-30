// The built UCS synonym index the app searches with. Kept apart from ucsSynonyms.ts so
// that file stays import-free (and so node-testable); this is the one place the two
// JSONs are bundled in. See ucsSynonyms.ts for what the two rings are.
import ucsSynonyms from './ucsSynonyms.json';
import ucsThesaurus from './ucsThesaurus.json';
import { buildSynonymIndex, EMPTY_INDEX, type SynonymIndex } from './ucsSynonyms';

function build(): SynonymIndex {
  // A library that will not build leaves search exactly as it was before synonyms
  // existed — the plain substring filter — rather than taking the app down with it.
  try {
    const index = buildSynonymIndex(ucsSynonyms.subcategories, ucsThesaurus.rings);
    if (index.skipped) console.warn(`UCS synonyms: skipped ${index.skipped} malformed row(s)/ring(s)`);
    return index;
  } catch (e) {
    console.warn('UCS synonyms: library failed to build — plain text filter only', e);
    return EMPTY_INDEX;
  }
}

export const UCS_SYNONYMS: SynonymIndex = build();
