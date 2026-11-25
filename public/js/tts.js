// Озвучка слогов и слов встроенным синтезатором речи (на Android это Google TTS).

const synth = 'speechSynthesis' in window ? window.speechSynthesis : null;
let voice = null;

function pickVoice() {
  const russian = synth.getVoices().filter((v) => /^ru/i.test(v.lang));
  voice = russian.find((v) => v.localService) || russian[0] || null;
}

if (synth) {
  pickVoice();
  synth.addEventListener('voiceschanged', pickVoice);
}

export const canSpeak = Boolean(synth);

export function stopSpeaking() {
  synth?.cancel();
}

export function speak(text, { rate = 0.85, pitch = 1.05 } = {}) {
  return new Promise((resolve) => {
    if (!synth) return resolve();
    synth.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'ru-RU';
    if (voice) utterance.voice = voice;
    utterance.rate = rate;
    utterance.pitch = pitch;
    // Android иногда не присылает onend, поэтому страхуемся таймером.
    const fallback = setTimeout(resolve, 1500 + text.length * 250);
    utterance.onend = utterance.onerror = () => {
      clearTimeout(fallback);
      resolve();
    };
    synth.speak(utterance);
  });
}
