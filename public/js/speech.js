// Распознавание речи через встроенный в Chrome Web Speech API.
// На Android звук отправляется в сервис распознавания Google: бесплатно, без ключей,
// но нужен интернет.

const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;

export const canRecognize = Boolean(Recognition);

// Ошибки, после которых повторять бессмысленно.
const FATAL = new Set(['not-allowed', 'service-not-allowed', 'audio-capture', 'network', 'language-not-supported']);

/**
 * Слушает микрофон, пока check(варианты) не вернёт true или не выйдет время.
 * Chrome на Android сам обрывает распознавание после паузы, а ребёнок, читающий
 * по слогам, делает паузы. Поэтому перезапускаем распознавание и копим услышанное.
 *
 * Возвращает { done: Promise<{matched, heard, error, cancelled}>, stop(cancel) }.
 */
export function listen({ check, onHeard = () => {}, maxMs = 10000 }) {
  const deadline = Date.now() + maxMs;
  const pastBest = [];   // лучшие варианты из завершившихся отрезков
  const pastAlts = [];   // все альтернативы из завершившихся отрезков
  let current = { best: '', alts: [] };
  let rec = null;
  let finished = false;
  let matched = false;
  let error = null;
  let restartTimer = 0;
  let segmentStart = 0;
  let resolve;
  const done = new Promise((r) => { resolve = r; });
  const timer = setTimeout(() => finish(), maxMs);

  const heard = () => [...pastBest, current.best].join(' ').replace(/\s+/g, ' ').trim();

  function finish(cancelled = false) {
    if (finished) return;
    finished = true;
    clearTimeout(timer);
    clearTimeout(restartTimer);
    if (rec) {
      rec.onresult = rec.onerror = rec.onend = null;
      try { rec.abort(); } catch { /* уже остановлен */ }
    }
    resolve({ matched, error, cancelled, heard: heard() });
  }

  function start() {
    if (finished) return;
    segmentStart = Date.now();
    current = { best: '', alts: [] };
    rec = new Recognition();
    rec.lang = 'ru-RU';
    rec.continuous = true;
    rec.interimResults = true;
    rec.maxAlternatives = 5;

    rec.onresult = (event) => {
      let best = '';
      const alts = [];
      for (let i = 0; i < event.results.length; i++) {
        const result = event.results[i];
        if (result.length) best += ' ' + result[0].transcript;
        for (let j = 0; j < result.length; j++) alts.push(result[j].transcript);
      }
      current = { best: best.trim(), alts };
      onHeard(heard());
      if (check([heard(), current.best, ...alts, ...pastAlts])) {
        matched = true;
        finish();
      }
    };

    rec.onerror = (event) => {
      if (FATAL.has(event.error)) {
        error = event.error;
        finish();
      }
    };

    rec.onend = () => {
      if (finished) return;
      if (current.best) pastBest.push(current.best);
      pastAlts.push(...current.alts);
      current = { best: '', alts: [] };
      if (Date.now() >= deadline) return finish();
      // Если отрезок оборвался мгновенно, чуть ждём, чтобы не крутиться вхолостую.
      const delay = Date.now() - segmentStart < 500 ? 400 : 0;
      restartTimer = setTimeout(start, delay);
    };

    try {
      rec.start();
    } catch {
      error = 'start-failed';
      finish();
    }
  }

  start();
  return { done, stop: finish };
}
