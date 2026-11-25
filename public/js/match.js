// Проверка: прочитал ли ребёнок нужное слово.
//
// Мы не расшифровываем произвольную речь, а сверяем с заранее известным словом.
// Ребёнок читает по слогам, поэтому распознаватель часто выдаёт слово кусками:
// «ма ши на», «маши на», «ко кот». Склеиваем соседние кусочки и ищем среди
// склеек целевое слово. В длинных словах (от 6 букв) прощаем одну ошибку
// распознавания, в коротких требуем точного совпадения, иначе «рука» засчиталась бы за «река».

export function tokens(text) {
  return text.toLowerCase().replaceAll('ё', 'е').split(/[^а-я]+/).filter(Boolean);
}

export function normalize(text) {
  return tokens(text).join('');
}

export function levenshtein(a, b) {
  const row = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let diag = row[0];
    row[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const up = row[j];
      row[j] = Math.min(row[j] + 1, row[j - 1] + 1, diag + (a[i - 1] === b[j - 1] ? 0 : 1));
      diag = up;
    }
  }
  return row[b.length];
}

export function isMatch(target, candidates) {
  const goal = normalize(target);
  const tolerance = goal.length >= 6 ? 1 : 0;
  for (const text of candidates) {
    const parts = tokens(text);
    for (let i = 0; i < parts.length; i++) {
      let joined = '';
      for (let j = i; j < parts.length; j++) {
        joined += parts[j];
        if (joined.length > goal.length + tolerance) break;
        if (joined.length >= goal.length - tolerance && levenshtein(goal, joined) <= tolerance) return true;
      }
    }
  }
  return false;
}
