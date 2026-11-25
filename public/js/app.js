import { LEVELS } from './words.js';
import { isMatch } from './match.js';
import { canRecognize, listen } from './speech.js';
import { canSpeak, speak, stopSpeaking } from './tts.js';
import { confetti, jingle, stopConfetti, unlockAudio } from './effects.js';

const ROUND_SIZE = 5;
const $ = (id) => document.getElementById(id);

const TIPS = {
  tiles: 'Нажми на слог — я его прочитаю',
  arcs: 'Нажми на слог, чтобы его услышать',
  plain: 'Прочитай слово целиком',
};

const PRAISE = ['Молодец!', 'Отлично!', 'Здорово!', 'Умница!', 'Супер!', 'Так держать!'];

const ERRORS = {
  'not-allowed': 'Нет доступа к микрофону. Разрешите микрофон для этого сайта в настройках браузера.',
  'service-not-allowed': 'Нет доступа к микрофону. Разрешите микрофон для этого сайта в настройках браузера.',
  'audio-capture': 'Микрофон не найден или занят другим приложением.',
  network: 'Для распознавания речи нужен интернет.',
  'language-not-supported': 'Браузер не умеет распознавать русскую речь.',
  'start-failed': 'Не получилось включить микрофон. Попробуйте ещё раз.',
};

// Хранилище прогресса. В приватном режиме localStorage может быть недоступен, тогда просто не запоминаем.
const store = {
  get(key, fallback) {
    try {
      const value = localStorage.getItem('prochitaika:' + key);
      return value === null ? fallback : JSON.parse(value);
    } catch {
      return fallback;
    }
  },
  set(key, value) {
    try {
      localStorage.setItem('prochitaika:' + key, JSON.stringify(value));
    } catch { /* не страшно */ }
  },
};

const state = {
  level: null,
  round: [],       // слова текущего раунда
  results: [],     // 'win' | 'skip' по каждому слову
  index: 0,
  fails: 0,
  hint: false,
  listening: null, // активная сессия распознавания
};
const decks = new Map(); // перемешанные колоды по уровням, чтобы слова не повторялись подряд
let speechRun = 0;       // номер текущей озвучки, чтобы новая прерывала старую

const currentWord = () => state.round[state.index];

// ---------- Экраны ----------

function show(screen) {
  for (const id of ['menu', 'game', 'done']) $(id).hidden = id !== screen;
  window.scrollTo(0, 0);
}

function goMenu() {
  state.listening?.stop(true);
  stopSpeaking();
  stopConfetti();
  renderMenu();
  show('menu');
}

// ---------- Меню ----------

function renderMenu() {
  const stars = store.get('stars', {});
  $('levels').replaceChildren(...LEVELS.map((level) => {
    const card = document.createElement('button');
    card.type = 'button';
    card.className = 'level-card';
    card.style.setProperty('--level', level.color);
    card.innerHTML = `
      <span class="level-num">${level.id}</span>
      <span class="level-body">
        <span class="level-title"></span>
        <span class="level-example cased"></span>
        <span class="level-about"></span>
      </span>
      <span class="level-stars"><span aria-hidden="true">⭐</span> ${stars[level.id] || 0}</span>`;
    card.querySelector('.level-title').textContent = level.title;
    card.querySelector('.level-example').textContent = level.example;
    card.querySelector('.level-about').textContent = level.about;
    card.addEventListener('click', () => {
      unlockAudio();
      startRound(level);
    });
    return card;
  }));
}

function applyCase(upper) {
  document.body.classList.toggle('upper', upper);
  for (const button of document.querySelectorAll('[data-case]')) {
    button.setAttribute('aria-pressed', String((button.dataset.case === 'upper') === upper));
  }
}

function checkSupport() {
  const problems = [];
  if (!window.isSecureContext) {
    problems.push('Страница открыта не по HTTPS, поэтому браузер не даст доступ к микрофону. Откройте её по адресу https://… или на localhost.');
  } else if (!canRecognize) {
    problems.push('Этот браузер не умеет распознавать речь. Откройте Прочитайку в Google Chrome. Пока можно играть с кнопкой «Засчитать».');
  }
  if (!canSpeak) problems.push('Браузер не умеет произносить слоги вслух.');
  $('warning').textContent = problems.join(' ');
  $('warning').hidden = problems.length === 0;
}

// ---------- Раунд ----------

function shuffle(list) {
  for (let i = list.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [list[i], list[j]] = [list[j], list[i]];
  }
  return list;
}

function drawWords(level) {
  const count = Math.min(ROUND_SIZE, level.words.length);
  const picked = [];
  while (picked.length < count) {
    let deck = decks.get(level.id);
    if (!deck?.length) {
      deck = shuffle([...level.words]);
      decks.set(level.id, deck);
    }
    const word = deck.pop();
    if (!picked.includes(word)) picked.push(word);
  }
  return picked;
}

function startRound(level) {
  state.level = level;
  state.round = drawWords(level);
  state.results = [];
  state.index = 0;
  $('level-tag').textContent = `Ур. ${level.id}`;
  document.documentElement.style.setProperty('--level', level.color);
  show('game');
  renderTurn();
}

function renderTurn() {
  state.fails = 0;
  state.hint = false;
  renderProgress();
  renderWord();
  setStatus('');
  $('heard').textContent = '';
  $('helpers').hidden = true;
  $('listen-word').hidden = true;
}

function renderProgress() {
  $('progress').replaceChildren(...state.round.map((_, i) => {
    const dot = document.createElement('span');
    const result = state.results[i];
    dot.className = 'dot' + (result === 'win' ? ' is-win' : result === 'skip' ? ' is-skip' : i === state.index ? ' is-current' : '');
    return dot;
  }));
}

function renderWord() {
  const word = currentWord();
  const mode = state.level.display === 'plain' && state.hint ? 'arcs' : state.level.display;
  const box = $('word');
  box.className = `word word--${mode} cased`;
  if (word.text.length >= 8) box.classList.add('word--long');
  if (mode === 'plain') {
    box.textContent = word.text;
  } else {
    box.replaceChildren(...word.syllables.map((syllable) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'syl';
      button.textContent = syllable;
      button.addEventListener('click', () => saySyllable(syllable, button));
      return button;
    }));
  }
  $('tip').textContent = TIPS[mode];
  $('hint').hidden = state.level.display !== 'plain' || state.hint;
}

function pulse(element) {
  if (!element) return;
  element.classList.remove('is-speaking');
  void element.offsetWidth; // перезапуск CSS-анимации
  element.classList.add('is-speaking');
}

function saySyllable(syllable, element) {
  state.listening?.stop(true); // не слушаем сами себя
  speechRun++;
  pulse(element);
  speak(syllable, { rate: 0.7 });
}

async function listenWord() {
  state.listening?.stop(true);
  const run = ++speechRun;
  if (state.level.display === 'plain' && !state.hint) {
    state.hint = true;
    renderWord();
  }
  const word = currentWord();
  const elements = $('word').querySelectorAll('.syl');
  for (let i = 0; i < word.syllables.length; i++) {
    if (run !== speechRun) return;
    pulse(elements[i]);
    await speak(word.syllables[i], { rate: 0.7 });
  }
  if (run === speechRun) speak(word.text);
}

// ---------- Микрофон ----------

function setStatus(text, tone = '') {
  $('status').textContent = text;
  $('status').dataset.tone = tone;
}

function setListening(on) {
  $('mic').classList.toggle('is-listening', on);
  $('mic').setAttribute('aria-label', on ? 'Остановить' : 'Нажми и прочитай слово');
  $('mic-label').textContent = on ? 'Слушаю… Нажми, чтобы остановить' : 'Нажми и прочитай';
}

async function onMic() {
  unlockAudio();
  if (state.listening) {
    state.listening.stop();
    return;
  }
  if (!canRecognize) {
    setStatus('Распознавание речи здесь недоступно. Взрослый может нажать «Засчитать».', 'warn');
    $('helpers').hidden = false;
    return;
  }
  speechRun++;
  stopSpeaking();
  const word = currentWord();
  setListening(true);
  setStatus('Читай вслух!');
  $('heard').textContent = '';

  const session = listen({
    check: (texts) => isMatch(word.text, texts),
    onHeard: (text) => { $('heard').textContent = text ? `Слышу: «${text}»` : ''; },
    maxMs: 6000 + word.syllables.length * 1500,
  });
  state.listening = session;
  const result = await session.done;
  if (state.listening === session) state.listening = null;
  setListening(false);

  if (result.cancelled || currentWord() !== word || $('game').hidden) return;
  if (result.matched) return win();
  if (result.error) {
    setStatus(ERRORS[result.error] || 'Что-то пошло не так с микрофоном.', 'warn');
    $('helpers').hidden = false;
    return;
  }
  fail(result.heard);
}

function fail(heard) {
  state.fails++;
  if (!heard) {
    setStatus('Ничего не слышно. Нажми и прочитай погромче 🙂');
    $('heard').textContent = '';
  } else {
    setStatus(state.fails === 1 ? 'Почти! Попробуй ещё раз 🙂' : 'Ещё разок! Читай по слогам, не спеши');
    $('heard').textContent = `Похоже на «${heard}»`;
  }
  $('helpers').hidden = false;
  $('listen-word').hidden = state.fails < 2;
  // После двух неудач на «целом слове» сами показываем дужки.
  if (state.fails >= 2 && state.level.display === 'plain' && !state.hint) {
    state.hint = true;
    renderWord();
  }
}

// ---------- Победа ----------

function win() {
  if (!$('win').hidden) return;
  state.listening?.stop(true);
  const word = currentWord();
  state.results[state.index] = 'win';
  const stars = store.get('stars', {});
  stars[state.level.id] = (stars[state.level.id] || 0) + 1;
  store.set('stars', stars);
  renderProgress();
  setStatus('');
  $('heard').textContent = '';

  const praise = PRAISE[Math.floor(Math.random() * PRAISE.length)];
  $('win-emoji').textContent = word.emoji;
  $('win-word').textContent = word.text;
  $('win-text').textContent = praise;
  $('next').textContent = state.index + 1 < state.round.length ? 'Дальше →' : 'Готово! 🏆';
  $('win').hidden = false;
  $('next').focus({ preventScroll: true });
  confetti();
  jingle();
  const run = ++speechRun;
  setTimeout(() => { if (run === speechRun) speak(`${praise} ${word.text}!`); }, 600);
}

function next() {
  $('win').hidden = true;
  speechRun++;
  stopSpeaking();
  stopConfetti(); // чтобы конфетти не мешало читать следующее слово
  state.index++;
  if (state.index >= state.round.length) return showDone();
  renderTurn();
}

function skip() {
  state.listening?.stop(true);
  state.results[state.index] = 'skip';
  next();
}

function showDone() {
  const total = state.round.length;
  const wins = state.results.filter((r) => r === 'win').length;
  $('done-emoji').textContent = wins === total ? '🏆' : wins > 0 ? '🎉' : '🙂';
  $('done-title').textContent = wins === total ? 'Ура! Все слова прочитаны!' : wins > 0 ? 'Хорошая работа!' : 'Попробуем ещё?';
  $('done-text').textContent = `Прочитано слов: ${wins} из ${total}`;
  $('done-stars').textContent = '⭐'.repeat(wins);
  const nextLevel = LEVELS.find((l) => l.id === state.level.id + 1);
  $('next-level').hidden = !(nextLevel && wins === total);
  if (nextLevel) $('next-level').textContent = `На уровень ${nextLevel.id} →`;
  show('done');
  if (wins) {
    confetti();
    jingle();
  }
}

// ---------- Запуск ----------

$('mic').addEventListener('click', onMic);
$('back').addEventListener('click', goMenu);
$('hint').addEventListener('click', () => { state.hint = true; renderWord(); });
$('listen-word').addEventListener('click', listenWord);
$('accept').addEventListener('click', win);
$('skip').addEventListener('click', skip);
$('next').addEventListener('click', next);
$('again').addEventListener('click', () => startRound(state.level));
$('next-level').addEventListener('click', () => startRound(LEVELS.find((l) => l.id === state.level.id + 1)));
$('to-menu').addEventListener('click', goMenu);
for (const button of document.querySelectorAll('[data-case]')) {
  button.addEventListener('click', () => {
    const upper = button.dataset.case === 'upper';
    store.set('upper', upper);
    applyCase(upper);
  });
}
document.addEventListener('visibilitychange', () => {
  if (document.hidden) state.listening?.stop(true);
});

applyCase(store.get('upper', true));
renderMenu();
checkSupport();
show('menu');

if ('serviceWorker' in navigator && window.isSecureContext) {
  navigator.serviceWorker.register('./sw.js').catch(() => { /* офлайн-режим не обязателен */ });
}
