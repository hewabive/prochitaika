import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fusions, hasVowel, stressed } from '../public/js/split.js';
import { LEVELS } from '../public/js/words.js';

test('делит слово на слияния и отдельные буквы', () => {
  assert.deepEqual(fusions('кошка'), ['ко', 'ш', 'ка']);
  assert.deepEqual(fusions('машина'), ['ма', 'ши', 'на']);
  assert.deepEqual(fusions('кот'), ['ко', 'т']);
  assert.deepEqual(fusions('звезда'), ['з', 'ве', 'з', 'да']);
  assert.deepEqual(fusions('поезд'), ['по', 'е', 'з', 'д']);
  assert.deepEqual(fusions('уши'), ['у', 'ши']);
  assert.deepEqual(fusions('ёж'), ['ё', 'ж']);
  assert.deepEqual(fusions('чайник'), ['ча', 'й', 'ни', 'к']);
});

test('мягкий знак остаётся со своей согласной', () => {
  assert.deepEqual(fusions('морковь'), ['мо', 'р', 'ко', 'вь']);
  assert.deepEqual(fusions('компьютер'), ['ко', 'м', 'пью', 'те', 'р']);
});

test('любое слово из словаря делится без потерь', () => {
  for (const level of LEVELS) {
    for (const word of level.words) {
      const parts = fusions(word.text);
      assert.equal(parts.join(''), word.text);
      for (const part of parts) {
        assert.ok(part.length <= 3, `«${word.text}»: слишком длинная часть «${part}»`);
        if (part.length > 1 && !/^[^аеёиоуыэюя][ьъ]$/.test(part)) {
          assert.ok(hasVowel(part), `«${word.text}»: часть «${part}» без гласной`);
        }
      }
    }
  }
});

test('ставит ударение на гласную слога, чтобы «со» не звучало как «са»', () => {
  assert.equal(stressed('со'), 'со\u0301');
  assert.equal(stressed('ко'), 'ко\u0301');
  assert.equal(stressed('кош'), 'ко\u0301ш');
  assert.equal(stressed('пью'), 'пью\u0301');
  assert.equal(stressed('у'), 'у\u0301');
  assert.equal(stressed('ё'), 'ё');
  assert.equal(stressed('ш'), 'ш');
});
