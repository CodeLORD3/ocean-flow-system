import { useEffect, useRef } from "react";
import { useLocation } from "react-router-dom";

/**
 * Appen skrollar inne i .app-main, inte i fönstret. Skrollpositionen sparas
 * per flik (sökväg) och återställs när man kommer tillbaka; nya sidor börjar överst.
 */
const positions = new Map<string, number>();

const ScrollToTop = () => {
  const { pathname } = useLocation();
  const prev = useRef<string | null>(null);

  useEffect(() => {
    const el = document.querySelector<HTMLElement>(".app-main");
    if (prev.current && el) positions.set(prev.current, el.scrollTop);
    prev.current = pathname;
    const top = positions.get(pathname) ?? 0;
    if (el) {
      requestAnimationFrame(() => el.scrollTo({ top, left: 0 }));
    } else {
      window.scrollTo({ top: 0, left: 0 });
    }
  }, [pathname]);

  return null;
};

export default ScrollToTop;
