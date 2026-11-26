import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LEVELS } from '../public/js/words.js';

const VOWELS = /[аеёиоуыэюя]/g;

test('в каждом слоге ровно одна гласная', () => {
  for (const level of LEVELS) {
    for (const word of level.words) {
      for (const syllable of word.syllables) {
        const vowels = syllable.match(VOWELS) ?? [];
        assert.equal(vowels.length, 1, `уровень ${level.id}: «${word.syllables.join('-')}», слог «${syllable}»`);
      }
    }
  }
});

test('у каждого слова есть картинка и только русские буквы', () => {
  for (const level of LEVELS) {
    for (const word of level.words) {
      assert.match(word.text, /^[а-яё]+$/, `уровень ${level.id}: «${word.text}»`);
      assert.ok(word.emoji, `нет картинки у «${word.text}»`);
    }
  }
});

test('слова не повторяются и на каждом уровне хватает слов на раунд', () => {
  const seen = new Set();
  for (const level of LEVELS) {
    assert.ok(level.words.length >= 5, `на уровне ${level.id} меньше 5 слов`);
    for (const word of level.words) {
      assert.ok(!seen.has(word.text), `слово «${word.text}» встречается дважды`);
      seen.add(word.text);
    }
  }
});

test('пауза между озвучками задана числом секунд', () => {
  for (const level of LEVELS) {
    assert.ok(Number.isFinite(level.pause) && level.pause >= 0, `уровень ${level.id}: pause = ${level.pause}`);
  }
});
