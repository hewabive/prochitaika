// Деление слова на слияния (согласная + гласная) и отдельные буквы:
// ко-ш-ка, ли-мо-н, з-ве-з-да, по-е-з-д.
// Мягкий и твёрдый знак остаются со своей согласной: мо-р-ко-вь, ко-м-пью-те-р.

const VOWELS = new Set('аеёиоуыэюя');
const SIGNS = new Set('ьъ');

export const hasVowel = (part) => [...part].some((ch) => VOWELS.has(ch));

// Знак ударения после гласной слога (для озвучки). Без него синтезатор принимает
// «со», «ко», «по», «но», «не», «же» за безударные предлоги и частицы и говорит
// «са», «ка», «па», «на», «ни», «жы». Ребёнок читает каждый слог с полной гласной.
const STRESS = '́';

export function stressed(part) {
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
