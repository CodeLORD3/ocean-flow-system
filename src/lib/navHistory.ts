/**
 * Håller reda på var man kom ifrån, så att det alltid finns en enkel väg
 * tillbaka. Varje gång man byter sida sparas adressen och sidans namn i en
 * kort kedja — tillbaka-raden högst upp läser den och visar "Tillbaka till X".
 *
 * Inget sparas i databasen; kedjan lever så länge fliken är öppen.
 */

export interface NavEntry {
  url: string;
  title: string;
}

const MAX = 12;
let stack: NavEntry[] = [];
const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((l) => l());
}

/** Registrera att man nu står på en sida. */
export function recordNav(url: string, title: string) {
  const last = stack[stack.length - 1];
  if (last && last.url === url) return;
  // Går man tillbaka till en sida som redan ligger i kedjan kapas kedjan där.
  const existing = stack.findIndex((e) => e.url === url);
  if (existing >= 0) stack = stack.slice(0, existing);
  stack = [...stack, { url, title }].slice(-MAX);
  emit();
}

/** Sidan man kom ifrån, om det finns någon. */
export function previousNav(): NavEntry | null {
  return stack.length > 1 ? stack[stack.length - 2] : null;
}

/** Ta bort nuvarande sida ur kedjan när man går tillbaka. */
export function popNav() {
  if (stack.length > 1) {
    stack = stack.slice(0, -1);
    emit();
  }
}

export function subscribeNav(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/**
 * Lägger på en väg tillbaka på en länk: ?retur=<varifrån>&returtext=<namn>.
 * Används när man skickar någon vidare från ett ställe till ett annat.
 */
export function withReturn(url: string, from: string, label: string): string {
  if (url.includes("retur=")) return url;
  const sep = url.includes("?") ? "&" : "?";
  return `${url}${sep}retur=${encodeURIComponent(from)}&returtext=${encodeURIComponent(label)}`;
}
