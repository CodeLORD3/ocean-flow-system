import { useEffect, useState } from "react";

/**
 * Helskärmsläge — sant när personalen gör en uppgift steg för steg.
 * Flytande knappar (t.ex. chattbubblan) göms så de inte ligger i vägen.
 */
let active = 0;
const listeners = new Set<() => void>();

function notify() {
  listeners.forEach((fn) => fn());
}

export function useFullscreenFlowFlag(on: boolean) {
  useEffect(() => {
    if (!on) return;
    active += 1;
    notify();
    return () => {
      active = Math.max(0, active - 1);
      notify();
    };
  }, [on]);
}

export function useFullscreenFlowActive() {
  const [value, setValue] = useState(active > 0);
  useEffect(() => {
    const fn = () => setValue(active > 0);
    listeners.add(fn);
    fn();
    return () => {
      listeners.delete(fn);
    };
  }, []);
  return value;
}
