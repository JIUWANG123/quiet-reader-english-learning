export type ReaderMode='swipe'|'tap'|'scroll';
export function volumeKeysEnabledForReadingMode(enabled:boolean,readingMode:ReaderMode){return enabled&&readingMode!=='scroll';}
