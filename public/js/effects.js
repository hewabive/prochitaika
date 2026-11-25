// Конфетти и победная мелодия. Без файлов: всё рисуется на canvas и синтезируется Web Audio.

const canvas = document.getElementById('confetti');
const ctx = canvas.getContext('2d');
const COLORS = ['#FF7A33', '#FFC93C', '#1FA971', '#3A7DF0', '#8E55E0', '#E8488F'];
let pieces = [];
let frame = 0;

export function confetti() {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = innerWidth * dpr;
  canvas.height = innerHeight * dpr;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  // Две «хлопушки» из нижних углов экрана.
  for (const side of [-1, 1]) {
    for (let i = 0; i < 80; i++) {
      pieces.push({
        x: side < 0 ? 0 : innerWidth,
        y: innerHeight,
        vx: -side * (4 + Math.random() * 9),
        vy: -(14 + Math.random() * 12) * Math.min(1, innerHeight / 700),
        size: 7 + Math.random() * 8,
        angle: Math.random() * Math.PI,
        spin: (Math.random() - 0.5) * 0.4,
        color: COLORS[i % COLORS.length],
        age: 0,
      });
    }
  }
  if (!frame) frame = requestAnimationFrame(tick);
}

export function stopConfetti() {
  pieces = [];
  cancelAnimationFrame(frame);
  frame = 0;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
}

function tick() {
  ctx.clearRect(0, 0, innerWidth, innerHeight);
  pieces = pieces.filter((p) => p.y < innerHeight + 40 && p.age < 300);
  for (const p of pieces) {
    p.vy += 0.32;
    p.vx *= 0.985;
    p.x += p.vx;
    p.y += p.vy;
    p.angle += p.spin;
    p.age++;
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(p.angle);
    ctx.fillStyle = p.color;
    ctx.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2);
    ctx.restore();
  }
  frame = pieces.length ? requestAnimationFrame(tick) : 0;
}

let audio = null;

// Браузер разрешает звук только после нажатия, поэтому «будим» аудио по нажатию на микрофон.
export function unlockAudio() {
  try {
    audio ??= new (window.AudioContext || window.webkitAudioContext)();
    if (audio.state === 'suspended') audio.resume();
  } catch { /* без звука тоже можно */ }
}

export function jingle() {
  if (!audio) return;
  const notes = [523.25, 659.25, 783.99, 1046.5]; // до-ми-соль-до
  const t0 = audio.currentTime + 0.02;
  notes.forEach((freq, i) => {
    const osc = audio.createOscillator();
    const gain = audio.createGain();
    const t = t0 + i * 0.11;
    const length = i === notes.length - 1 ? 0.6 : 0.22;
    osc.type = 'triangle';
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(0.22, t + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.001, t + length);
    osc.connect(gain).connect(audio.destination);
    osc.start(t);
    osc.stop(t + length + 0.05);
  });
}
