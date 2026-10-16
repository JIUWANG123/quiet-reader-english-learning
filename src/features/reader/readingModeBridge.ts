import type {ReadingMode} from '../../types';

/** Keep swipe/tap distinct so the injected bridge can apply mode-specific touch rules. */
export function readingModeForBridge(mode:ReadingMode):ReadingMode{return mode;}
