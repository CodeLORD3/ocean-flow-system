/**
 * Kort "ping" för nya chattmeddelanden. Använder WebAudio så att ingen
 * ljudfil behöver laddas — fungerar direkt efter första användarklicket
 * (webbläsare kräver interaktion innan ljud får spelas).
 */

let ctx: AudioContext | null = null;

function getContext(): AudioContext | null {
  if (typeof window === "undefined") return null;
  const Ctor = window.AudioContext || (window as any).webkitAudioContext;
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

/** Spelar upp två snabba toner (som en chatt-notis). */
export function playChatPing() {
  if (!isChatSoundEnabled()) return;
  const audio = getContext();
  if (!audio) return;
  if (audio.state === "suspended") void audio.resume();

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
}
