import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isMatch } from '../public/js/match.js';

test('засчитывает слово, прочитанное по слогам', () => {
  assert.ok(isMatch('машина', ['ма ши на']));
  assert.ok(isMatch('машина', ['Маши на.']));
  assert.ok(isMatch('машина', ['ма-ши-на']));
  assert.ok(isMatch('мама', ['ма ма']));
  assert.ok(isMatch('кот', ['ко кот']));
  assert.ok(isMatch('лиса', ['Лиса!']));
});

test('не различает е и ё', () => {
  assert.ok(isMatch('самолёт', ['самолет']));
  assert.ok(isMatch('ёж', ['Еж']));
});

test('прощает одну ошибку распознавания в длинных словах', () => {
  assert.ok(isMatch('мороженое', ['мороженное']));
  assert.ok(isMatch('машина', ['маша на']));
});

test('не засчитывает другое слово', () => {
  assert.ok(!isMatch('кот', ['кит']));
  assert.ok(!isMatch('кот', ['который']));
  assert.ok(!isMatch('мама', ['папа']));
  assert.ok(!isMatch('рука', ['река']));
  assert.ok(!isMatch('машина', ['маша']));
  assert.ok(!isMatch('лиса', ['']));
});

test('ищет среди всех вариантов распознавания', () => {
  assert.ok(isMatch('коза', ['коса', 'коза', 'касса']));
});
