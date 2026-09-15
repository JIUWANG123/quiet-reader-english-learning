export function sameAnswer(input: string, answer: string) {
  return input.trim().toLowerCase() === answer.trim().toLowerCase();
}

export function quizChoices(answer: string, pool: string[], random = Math.random) {
  const unique = [...new Map(pool.map(value => [value.trim().toLowerCase(), value.trim()])).values()]
    .filter(value => value && !sameAnswer(value, answer));
  function shuffle(values: string[]) {
    for (let i = values.length - 1; i > 0; i--) {
      const j = Math.floor(random() * (i + 1));
      [values[i], values[j]] = [values[j], values[i]];
    }
    return values;
  }
  return answer.trim() ? shuffle([answer.trim(), ...shuffle(unique).slice(0, 3)]) : [];
}

export function clozeSentence(sentence: string, forms: string[]) {
  const targets = new Set(forms.map(form => form.toLowerCase()));
  let matched = false;
  const text = sentence.replace(/[A-Za-z]+(?:['’-][A-Za-z]+)*/g, word => {
    if (!targets.has(word.toLowerCase())) return word;
    matched = true;
    return '______';
  });
  return matched ? text : null;
}
