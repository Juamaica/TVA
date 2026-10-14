// Síntesis de efectos con Web Audio API. Sólo se crea el contexto tras una
// interacción del usuario (requisito de los navegadores).
let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let enabled = true;
let volume = 0.5;

export function configureAudio(on: boolean, vol: number) {
  enabled = on; volume = vol;
  if (master) master.gain.value = vol;
}

export function unlockAudio() {
  if (typeof window === "undefined") return;
  try {
    if (!ctx) {
      const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = volume;
      master.connect(ctx.destination);
    }
    if (ctx.state === "suspended") void ctx.resume();
  } catch { /* sin audio */ }
}

function tone(freq: number, dur: number, type: OscillatorType = "square", gain = 0.2, slideTo?: number) {
  if (!enabled || !ctx || !master) return;
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = type; o.frequency.value = freq;
  if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, ctx.currentTime + dur);
  g.gain.setValueAtTime(gain, ctx.currentTime);
  g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + dur);
  o.connect(g); g.connect(master);
  o.start(); o.stop(ctx.currentTime + dur);
}

function noise(dur: number, gain = 0.15, freq = 800) {
  if (!enabled || !ctx || !master) return;
  const size = ctx.sampleRate * dur;
  const buf = ctx.createBuffer(1, size, ctx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < size; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / size);
  const src = ctx.createBufferSource(); src.buffer = buf;
  const f = ctx.createBiquadFilter(); f.type = "bandpass"; f.frequency.value = freq; f.Q.value = 0.8;
  const g = ctx.createGain(); g.gain.value = gain;
  src.connect(f); f.connect(g); g.connect(master); src.start();
}

export const sfx = {
  tick: () => tone(1200, 0.04, "square", 0.08),
  key: () => tone(900, 0.05, "triangle", 0.1),
  confirm: () => { tone(660, 0.1, "sine", 0.2); setTimeout(() => tone(990, 0.18, "sine", 0.2), 90); },
  deny: () => { tone(220, 0.25, "sawtooth", 0.2, 110); },
  alert: () => { tone(880, 0.12, "square", 0.15); setTimeout(() => tone(880, 0.12, "square", 0.15), 180); },
  crisis: () => { tone(300, 0.4, "sawtooth", 0.18, 150); setTimeout(() => tone(300, 0.4, "sawtooth", 0.18, 150), 500); },
  scan: () => tone(400, 0.6, "sine", 0.1, 1600),
  portalOpen: () => { noise(1.2, 0.2, 400); tone(80, 1.2, "sine", 0.3, 320); },
  portalClose: () => { noise(0.8, 0.15, 300); tone(320, 0.8, "sine", 0.25, 60); },
  charge: () => tone(120, 1.5, "sawtooth", 0.12, 900),
  pulse: () => { tone(200, 0.5, "sine", 0.3, 50); noise(0.4, 0.2, 2000); },
  disintegrate: () => { noise(2.5, 0.18, 1200); tone(600, 2.5, "triangle", 0.08, 40); },
  complete: () => { [523, 659, 784, 1046].forEach((f, i) => setTimeout(() => tone(f, 0.25, "sine", 0.18), i * 110)); },
};

export function vibrate(pattern: number | number[], on: boolean) {
  if (!on || typeof navigator === "undefined" || !navigator.vibrate) return;
  try { navigator.vibrate(pattern); } catch { /* no soportado */ }
}

// ── Notificaciones locales (sólo eventos de la simulación, nunca engañosas) ──
export async function requestNotifications(): Promise<boolean> {
  if (typeof Notification === "undefined") return false;
  if (Notification.permission === "granted") return true;
  if (Notification.permission === "denied") return false;
  const r = await Notification.requestPermission();
  return r === "granted";
}

export function notify(title: string, body: string, tag?: string) {
  if (typeof Notification === "undefined" || Notification.permission !== "granted") return;
  const opts: NotificationOptions = { body, tag, icon: "/icons/icon-192.png", badge: "/icons/icon-192.png" };
  try {
    if (navigator.serviceWorker?.controller) {
      navigator.serviceWorker.ready.then((reg) => reg.showNotification(title, opts)).catch(() => new Notification(title, opts));
    } else new Notification(title, opts);
  } catch { /* ignore */ }
}
