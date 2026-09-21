/**
 * Kort "ping" för nya chattmeddelanden. Använder WebAudio så att ingen
 * ljudfil behöver laddas — fungerar direkt efter första användarklicket
 * (webbläsare kräver interaktion innan ljud får spelas).
 */

let ctx: AudioContext | null = null;
let queuedTaskAlerts = 0;

function getContext(): AudioContext | null {
  if (typeof window === "undefined") return null;
  const audioWindow = window as Window & typeof globalThis & {
    webkitAudioContext?: typeof AudioContext;
  };
  const Ctor = window.AudioContext || audioWindow.webkitAudioContext;
  if (!Ctor) return null;
  if (!ctx) ctx = new Ctor();
  return ctx;
}

const STORAGE_KEY = "chat-sound-enabled";

export function isChatSoundEnabled(): boolean {
  if (typeof window === "undefined") return false;
  return window.localStorage.getItem(STORAGE_KEY) !== "off";
}

export function setChatSoundEnabled(on: boolean) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, on ? "on" : "off");
}

function unlockAudio() {
  const audio = getContext();
  if (!audio) return;

  void audio.resume().then(() => {
    if (queuedTaskAlerts > 0) {
      const repeats = queuedTaskAlerts;
      queuedTaskAlerts = 0;
      scheduleTaskAlert(audio, repeats);
    }
  }).catch(() => undefined);
}

/* Webbläsare kräver att ljudet låses upp direkt i ett tryck eller tangenttryck. */
if (typeof window !== "undefined") {
  window.addEventListener("pointerdown", unlockAudio, { passive: true });
  window.addEventListener("keydown", unlockAudio);
}

/** Spelar upp två snabba toner (som en chatt-notis). */
export function playChatPing() {
  if (!isChatSoundEnabled()) return;
  const audio = getContext();
  if (!audio) return;
  const play = () => {
    const now = audio.currentTime;
    const tone = (freq: number, at: number, dur = 0.14) => {
      const osc = audio.createOscillator();
      const gain = audio.createGain();
      osc.type = "sine";
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.0001, now + at);
      gain.gain.exponentialRampToValueAtTime(0.18, now + at + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + at + dur);
      osc.connect(gain).connect(audio.destination);
      osc.start(now + at);
      osc.stop(now + at + dur + 0.02);
    };

    tone(880, 0);
    tone(1170, 0.13);
  };

  if (audio.state === "running") play();
  else void audio.resume().then(play).catch(() => undefined);
}

function scheduleTaskAlert(audio: AudioContext, repeats: number) {
  const now = audio.currentTime;
  const tone = (
    freq: number,
    at: number,
    dur: number,
    type: OscillatorType,
    peak: number,
  ) => {
    const osc = audio.createOscillator();
    const gain = audio.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, now + at);
    gain.gain.setValueAtTime(0.0001, now + at);
    gain.gain.exponentialRampToValueAtTime(peak, now + at + 0.03);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + at + dur);
    osc.connect(gain).connect(audio.destination);
    osc.start(now + at);
    osc.stop(now + at + dur + 0.02);
  };

  /* Signalen upprepas några gånger så man hör den även om man tittar bort */
  for (let i = 0; i < Math.max(1, repeats); i++) {
    const at = i * 1.1;
    /* "blopp": mjuk och lite lägre */
    tone(587.33, at, 0.2, "sine", 0.34);
    /* "ding": ljusare och ren */
    tone(987.77, at + 0.17, 0.38, "sine", 0.4);
  }
}

/** Ny uppgift: "blopp–ding" — mjuk lägre ton följd av en ljusare ren ton, upprepad några gånger. */
export function playTaskAlert(repeats = 3) {
  const audio = getContext();
  if (!audio) return;
  const safeRepeats = Math.max(1, repeats);

  if (audio.state === "running") {
    scheduleTaskAlert(audio, safeRepeats);
    return;
  }

  queuedTaskAlerts = safeRepeats;
  void audio.resume().then(() => {
    if (audio.state !== "running" || queuedTaskAlerts === 0) return;
    const queuedRepeats = queuedTaskAlerts;
    queuedTaskAlerts = 0;
    scheduleTaskAlert(audio, queuedRepeats);
  }).catch(() => undefined);
}


