const EDGE_PUNCTUATION = /^[^A-Za-z]+|[^A-Za-z]+$/g;

export function normalizeLookupWord(input: string) {
  return input.normalize('NFKC').replace(/[’‘]/g, "'").trim()
    .replace(EDGE_PUNCTUATION, '').toLocaleLowerCase('en-US');
}

export function extractSingleLookupWord(input: string) {
  const word = normalizeLookupWord(input);
  return /^[a-z]+(?:'[a-z]+)*(?:-[a-z]+)*$/.test(word) ? word : null;
}

export function tokenizeReadableText(text: string) {
  return text.split(/([A-Za-z]+(?:[’'][A-Za-z]+)*(?:-[A-Za-z]+)*)/g);
}

export function extractSourceSentence(text: string, word: string) {
  const index = text.toLocaleLowerCase('en-US').indexOf(word.toLocaleLowerCase('en-US'));
  if (index < 0) return text.trim().slice(0, 500);
  const before = Math.max(
    text.lastIndexOf('.', index - 1), text.lastIndexOf('!', index - 1),
    text.lastIndexOf('?', index - 1), text.lastIndexOf('\n', index - 1),
  );
  const ends = [
    text.indexOf('.', index + word.length), text.indexOf('!', index + word.length),
    text.indexOf('?', index + word.length), text.indexOf('\n', index + word.length),
  ].filter(value => value >= 0);
  const after = ends.length ? Math.min(...ends) + 1 : Math.min(text.length, index + 400);
  return text.slice(before + 1, after).trim().slice(0, 500);
}

export function sentenceFromSelection(selection: {previousContext: string; targetText: string; followingContext: string}) {
  const before = selection.previousContext.split(/[.!?\n]/).at(-1) ?? '';
  const after = selection.followingContext.match(/^[^.!?\n]*[.!?]?/)?.[0] ?? '';
  return (before.slice(-200) + selection.targetText + after.slice(0, 300)).trim();
}
