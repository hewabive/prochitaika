import { LEVELS, ROUND_SIZE } from './words.js';
import { fusions, hasVowel, forSpeech } from './split.js';
import { isMatch } from './match.js';
import { canRecognize, listen } from './speech.js';
import { canSpeak, speak, stopSpeaking } from './tts.js';
import { confetti, jingle, stopConfetti, unlockAudio } from './effects.js';

// Звуки, которые дети часто ещё не выговаривают. Слова с ними можно отключить в настройках.
const HARD_LETTERS = ['р', 'л', 'ш', 'ж', 'ч', 'щ', 'с', 'з', 'ц'];
const $ = (id) => document.getElementById(id);
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const TIPS = {
  tiles: 'Нажми на слог — я его прочитаю',
  arcs: 'Нажми на слог, чтобы его услышать',
  plain: 'Прочитай слово целиком',
};
const REST_TIP = 'Твоя очередь читать!';

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

const decks = new Map(); // перемешанные колоды по уровням, чтобы слова не повторялись подряд

const settings = {
  split: 'fusions',              // 'fusions' (ко-ш-ка) или 'syllables' (кош-ка)
  upper: store.get('upper', true),
  skip: [],                      // буквы, слова с которыми пропускаем
  ...store.get('settings', {}),
};

function saveSettings() {
  store.set('settings', settings);
  decks.clear();
}

const state = {
  level: null,
  round: [],       // слова текущего раунда
  results: [],     // 'win' | 'skip' по каждому слову
  index: 0,
  fails: 0,
  hint: false,
  listening: null, // активная сессия распознавания
};
let speechRun = 0; // номер текущей озвучки, чтобы новая прерывала старую

const currentWord = () => state.round[state.index];
const playableWords = (level) => level.words.filter((word) => !settings.skip.some((letter) => word.text.includes(letter)));
const partsOf = (word) => (settings.split === 'fusions' ? fusions(word.text) : word.syllables);

// ---------- Экраны ----------
// Ребёнок иногда случайно нажимает системную кнопку «Назад». Поэтому, пока открыт не главный
// экран, в истории браузера лежит лишняя запись (INNER). «Назад» снимает её, а не закрывает
// приложение (см. обработчик popstate). В меню записи нет, и «Назад» работает как обычно.

const INNER = 'prochitaika-inner';
const hasInnerEntry = () => history.state === INNER;

function show(screen) {
  for (const id of ['menu', 'settings', 'game', 'done']) $(id).hidden = id !== screen;
  window.scrollTo(0, 0);
  if (screen !== 'menu' && !hasInnerEntry()) history.pushState(INNER, '');
}

function goMenu() {
  state.listening?.stop(true);
  endRest();
  stopSpeaking();
  stopConfetti();
  renderMenu();
  show('menu');
  if (hasInnerEntry()) history.back(); // в меню «Назад» снова должен закрывать приложение
}

// Системная «Назад»: из настроек ведёт в меню, а в игре и на итогах раунда ничего не делает,
// чтобы случайное нажатие не сбило раунд. Взрослый выходит в меню кнопкой ← на экране.
window.addEventListener('popstate', () => {
  if (!$('settings').hidden) goMenu();
  else if (!$('game').hidden || !$('done').hidden) history.pushState(INNER, '');
});

// На телефоне разворачиваемся на весь экран, так системные кнопки спрятаны и их труднее задеть.
// Установленное приложение и так открывается на весь экран (display в manifest.webmanifest).
// В обычной вкладке Chrome или пока телефон не обновил установленное приложение, просим
// полноэкранный режим при нажатии: без нажатия браузер его не включает. Если ребёнок из него
// вышел, следующее нажатие включит его снова.
function enterFullscreen() {
  if (!matchMedia('(pointer: coarse)').matches) return; // на компьютере не мешаем
  if (document.fullscreenElement || !document.fullscreenEnabled) return;
  if (matchMedia('(display-mode: fullscreen)').matches) return;
  document.documentElement.requestFullscreen({ navigationUI: 'hide' }).catch(() => { /* не страшно */ });
}

// ---------- Меню ----------

function renderMenu() {
  const stars = store.get('stars', {});
  $('levels').replaceChildren(...LEVELS.map((level) => {
    const available = playableWords(level).length;
    const card = document.createElement('button');
    card.type = 'button';
    card.className = 'level-card';
    card.disabled = available === 0;
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
    card.querySelector('.level-about').textContent = available ? level.about : 'Все слова со звуками, которые сейчас пропускаем';
    card.addEventListener('click', () => {
      unlockAudio();
      startRound(level);
    });
    return card;
  }));
  $('filter-note').hidden = settings.skip.length === 0;
  $('filter-note').textContent = 'Пропускаем слова с буквами: ' + settings.skip.map((l) => l.toUpperCase()).join(', ');
}

function applyCase() {
  document.body.classList.toggle('upper', settings.upper);
  for (const button of document.querySelectorAll('[data-case]')) {
    button.setAttribute('aria-pressed', String((button.dataset.case === 'upper') === settings.upper));
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

// ---------- Настройки ----------

function renderSettings() {
  for (const button of document.querySelectorAll('[data-split]')) {
    button.setAttribute('aria-pressed', String(button.dataset.split === settings.split));
  }
  $('example-fusions').replaceChildren(...renderParts(fusions('кошка')));
  $('example-syllables').replaceChildren(...renderParts(['кош', 'ка']));
  applyCase();
  $('skip-letters').replaceChildren(...HARD_LETTERS.map((letter) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'letter cased';
    button.textContent = letter;
    button.setAttribute('aria-pressed', String(settings.skip.includes(letter)));
    button.addEventListener('click', () => {
      settings.skip = settings.skip.includes(letter)
        ? settings.skip.filter((l) => l !== letter)
        : [...settings.skip, letter];
      saveSettings();
      renderSettings();
    });
    return button;
  }));
  const total = LEVELS.reduce((n, level) => n + level.words.length, 0);
  const left = LEVELS.reduce((n, level) => n + playableWords(level).length, 0);
  $('words-left').textContent = `Слов в игре: ${left} из ${total}`;
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
  const words = playableWords(level);
  const count = Math.min(ROUND_SIZE, words.length);
  const picked = [];
  while (picked.length < count) {
    let deck = decks.get(level.id);
    if (!deck?.length) {
      deck = shuffle([...words]);
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
  if (!state.round.length) return goMenu();
  $('level-tag').textContent = `Ур. ${level.id}`;
  document.documentElement.style.setProperty('--level', level.color);
  show('game');
  renderTurn();
}

function renderTurn() {
  state.fails = 0;
  state.hint = false;
  endRest();
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

// Слоги и слияния (с гласной) — цветные, под дужкой, озвучиваются по нажатию.
// Отдельные согласные — с точкой и без звука: синтезатор не умеет произносить
// одиночный звук и вместо [ш] сказал бы «ша».
function renderParts(parts, onTap) {
  let colored = 0;
  return parts.map((part) => {
    const voiced = hasVowel(part);
    const element = document.createElement(onTap && voiced ? 'button' : 'span');
    element.className = 'syl ' + (voiced ? (colored++ % 2 ? 'syl--b' : 'syl--a') : 'syl--single');
    element.textContent = part;
    if (onTap && voiced) {
      element.type = 'button';
      element.addEventListener('click', () => onTap(part, element));
    }
    return element;
  });
}

const displayMode = () => (state.level.display === 'plain' && state.hint ? 'arcs' : state.level.display);

function renderWord() {
  const word = currentWord();
  const mode = displayMode();
  const box = $('word');
  box.className = `word word--${mode} cased`;
  if (word.text.length >= 8) box.classList.add('word--long');
  if (mode === 'plain') {
    box.textContent = word.text;
  } else {
    box.replaceChildren(...renderParts(partsOf(word), saySyllable));
  }
  renderTip();
  $('hint').hidden = state.level.display !== 'plain' || state.hint;
}

function renderTip() {
  $('tip-text').textContent = isResting() ? REST_TIP : TIPS[displayMode()];
}

function restartAnimation(element, className) {
  if (!element) return;
  element.classList.remove(className);
  void element.offsetWidth; // перезапуск CSS-анимации
  element.classList.add(className);
}

const pulse = (element) => restartAnimation(element, 'is-speaking');

// ---------- Пауза между озвучками ----------
// Чтобы ребёнок не нажимал слог за слогом, а пробовал читать сам, после озвучки слоги
// «отдыхают» (pause в words.js; на первом уровне паузы нет). Пока идёт пауза, рядом
// с подсказкой заполняется кружок с динамиком, дужки бледнеют и постепенно наливаются цветом.
// Нажатие на слог в это время только покачивает его и кружок.

let restTimer = 0;
let restRun = 0;

const isResting = () => $('game').classList.contains('is-resting');

function startRest(seconds, spoken) {
  const run = ++restRun;
  clearTimeout(restTimer);
  const game = $('game');
  game.classList.remove('is-counting');
  game.classList.add('is-resting');
  game.style.setProperty('--rest', `${seconds}s`);
  renderTip();
  // Отсчёт начинаем, когда слог договорён, иначе длинная озвучка съест паузу.
  spoken.then(() => {
    if (run !== restRun) return;
    restartAnimation(game, 'is-counting');
    restTimer = setTimeout(() => endRest(true), seconds * 1000);
  });
}

function endRest(ready = false) {
  restRun++;
  clearTimeout(restTimer);
  if (!isResting()) return;
  $('game').classList.remove('is-resting', 'is-counting');
  renderTip();
  if (ready) $('word').querySelectorAll('button.syl').forEach(pulse); // слоги «проснулись»
}

function saySyllable(syllable, element) {
  if (isResting()) {
    restartAnimation(element, 'is-waiting');
    restartAnimation($('rest'), 'is-waiting');
    return;
  }
  state.listening?.stop(true); // не слушаем сами себя
  speechRun++;
  pulse(element);
  const spoken = speak(forSpeech(syllable), { rate: 0.7 });
  if (state.level.pause > 0) startRest(state.level.pause, spoken);
}

async function listenWord() {
  state.listening?.stop(true);
  const run = ++speechRun;
  if (state.level.display === 'plain' && !state.hint) {
    state.hint = true;
    renderWord();
  }
  const word = currentWord();
  const parts = partsOf(word);
  const elements = $('word').querySelectorAll('.syl');
  for (let i = 0; i < parts.length; i++) {
    if (run !== speechRun) return;
    pulse(elements[i]);
    if (hasVowel(parts[i])) await speak(forSpeech(parts[i]), { rate: 0.7 });
    else await wait(450);
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
  // Кнопки «На следующий уровень» тут нет: главное действие — продолжать на этом же
  // уровне, а сменить уровень взрослый может через меню.
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
$('to-menu').addEventListener('click', goMenu);
$('open-settings').addEventListener('click', () => { renderSettings(); show('settings'); });
$('settings-back').addEventListener('click', goMenu);
$('settings-done').addEventListener('click', goMenu);
for (const button of document.querySelectorAll('[data-case]')) {
  button.addEventListener('click', () => {
    settings.upper = button.dataset.case === 'upper';
    saveSettings();
    applyCase();
  });
}
for (const button of document.querySelectorAll('[data-split]')) {
  button.addEventListener('click', () => {
    settings.split = button.dataset.split;
    saveSettings();
    renderSettings();
  });
}
// После обработчиков кнопок, чтобы смена размера экрана не мешала самому нажатию.
document.addEventListener('click', enterFullscreen);
document.addEventListener('visibilitychange', () => {
  if (document.hidden) state.listening?.stop(true);
});

applyCase();
renderMenu();
checkSupport();
show('menu');

if ('serviceWorker' in navigator && window.isSecureContext) {
  navigator.serviceWorker.register('./sw.js').catch(() => { /* офлайн-режим не обязателен */ });
}
