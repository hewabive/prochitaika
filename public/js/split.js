// Деление слова на слияния (согласная + гласная) и отдельные буквы:
// ко-ш-ка, ли-мо-н, з-ве-з-да, по-е-з-д.
// Мягкий и твёрдый знак остаются со своей согласной: мо-р-ко-вь, ко-м-пью-те-р.

const VOWELS = new Set('аеёиоуыэюя');
const SIGNS = new Set('ьъ');

export const hasVowel = (part) => [...part].some((ch) => VOWELS.has(ch));

// Как отдать слог синтезатору речи. Без подсказки Google TTS на Android принимает
// «со», «ко», «до», «по», «но» за безударные предлоги и частицы и говорит «са», «ка»,
// «да», «па», «на». Ребёнок же читает каждый слог с полной гласной.
// Обычно хватает знака ударения после гласной (проверено для со, по, но, то, во).
// «ко» и «до» знак игнорирует. Для них подобраны написания, проверенные на телефоне
// через страницу voice-test.html.
const STRESS = '\u0301';
const SPOKEN = {
  'ко': 'к\u00F3', // латинская «ó»
  'до': 'доо', // протяжно, зато с «о»
};

export function forSpeech(part) {
  if (SPOKEN[part]) return SPOKEN[part];
  const letters = [...part];
  const i = letters.findIndex((ch) => VOWELS.has(ch));
  if (i < 0 || letters[i] === 'ё') return part; // «ё» всегда ударная
  letters.splice(i + 1, 0, STRESS);
  return letters.join('');
}

export function fusions(word) {
  const letters = [...word];
  const parts = [];
  let i = 0;
  while (i < letters.length) {
    if (VOWELS.has(letters[i])) {
      parts.push(letters[i++]);
      continue;
    }
    let part = letters[i++];
    if (SIGNS.has(letters[i])) part += letters[i++];
    if (VOWELS.has(letters[i])) part += letters[i++];
    parts.push(part);
  }
  return parts;
}
