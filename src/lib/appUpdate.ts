import { registerSW } from "virtual:pwa-register";
import { hasUnsavedChanges, onUnsavedChange } from "@/lib/unsavedChanges";

/**
 * Enda stället där appens uppdatering hanteras.
 *
 * Ny version laddas aldrig in medan appen är synlig och något formulär har
 * osparade ändringar (register i lib/unsavedChanges) eller ett fält har fokus.
 * Då visas en fast rad "Ny version finns. Tryck för att uppdatera" och
 * omladdningen sker när inget längre är osparat, vid nästa sidbyte, eller när
 * appen varit dold i mer än 5 minuter. Hemskärmsläge laddar om hårt.
 *
 * I förhandsvisning och utveckling registreras ingen service worker alls.
 */
let reloadingForUpdate = false;
let updatePending = false;
let updateSW: ((reload?: boolean) => Promise<void>) | null = null;
let swRegistration: ServiceWorkerRegistration | null = null;
let lastCheck = 0;
let hiddenAt: number | null = null;

const CHECK_THROTTLE_MS = 30 * 1000;
const HIDDEN_RELOAD_MS = 5 * 60 * 1000;

function isPreviewHost() {
  const host = window.location.hostname;
  return (
    import.meta.env.DEV ||
    host === "localhost" ||
    host.endsWith("lovableproject.com") ||
    host.endsWith("id-preview--dc92d94e-c472-4cf5-a88c-37dbe635baaa.lovable.app")
  );
}

function isEditing() {
  const el = document.activeElement as HTMLElement | null;
  return !!el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT" || el.isContentEditable);
}

function isBusy() {
  return hasUnsavedChanges() || isEditing();
}

function showBanner() {
  if (document.getElementById("app-update-banner")) return;
  const b = document.createElement("button");
  b.type = "button";
  b.id = "app-update-banner";
  b.textContent = "Ny version finns. Tryck för att uppdatera";
  b.style.cssText = [
    "position:fixed",
    "left:8px",
    "right:8px",
    "bottom:calc(env(safe-area-inset-bottom, 0px) + 72px)",
    "z-index:2147483647",
    "min-height:48px",
    "padding:12px 16px",
    "border:0",
    "border-radius:12px",
    "text-align:center",
    "font-size:16px",
    "font-weight:600",
    "background:hsl(var(--primary))",
    "color:hsl(var(--primary-foreground))",
    "box-shadow:0 4px 16px rgba(0,0,0,.2)",
  ].join(";");
  b.addEventListener("click", () => {
    if (hasUnsavedChanges() && !window.confirm("Du har osparade ändringar som försvinner. Uppdatera ändå?")) return;
    void applyUpdate();
  });
  document.body.appendChild(b);
}

async function applyUpdate() {
  if (reloadingForUpdate) return;
  reloadingForUpdate = true;
  if (isStandalone()) return hardReload();
  if (updateSW) {
    try { await updateSW(true); return; } catch { /* faller tillbaka */ }
  }
  window.location.reload();
}

/** Ny version upptäckt: ladda om bara om det är säkert, annars vänta och visa raden. */
function requestReload() {
  if (reloadingForUpdate) return;
  updatePending = true;
  if (document.visibilityState === "visible" && isBusy()) {
    showBanner();
    return;
  }
  void applyUpdate();
}

/** Tillfälle att ladda om (sidbyte, fältet lämnat, inget osparat). */
function tryPendingReload() {
  if (!updatePending || reloadingForUpdate) return;
  if (isBusy()) { showBanner(); return; }
  void applyUpdate();
}

/** Hemskärmsapp (iPhone/Android). */
function isStandalone() {
  return window.matchMedia?.("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
}

/** Hemskärmsappar håller hårt i gammal kod: avregistrera service worker, töm cache och ladda om. */
async function hardReload() {
  try {
    const regs = (await navigator.serviceWorker?.getRegistrations?.()) ?? [];
    await Promise.allSettled(regs.map((r) => r.unregister()));
    if ("caches" in window) {
      const keys = await caches.keys();
      await Promise.allSettled(keys.map((k) => caches.delete(k)));
    }
  } finally {
    const url = new URL(window.location.href);
    url.searchParams.set("_v", String(Date.now()));
    window.location.replace(url.toString());
  }
}

function watchNavigation() {
  const wrap = (key: "pushState" | "replaceState") => {
    const orig = history[key].bind(history);
    history[key] = ((...args: Parameters<History["pushState"]>) => {
      const before = window.location.pathname;
      orig(...args);
      if (key === "pushState" && window.location.pathname !== before) setTimeout(tryPendingReload, 0);
    }) as History["pushState"];
  };
  wrap("pushState");
  window.addEventListener("popstate", () => setTimeout(tryPendingReload, 0));
}

export function registerAppUpdates() {
  if (isPreviewHost()) {
    navigator.serviceWorker?.getRegistrations?.().then((regs) => {
      regs.forEach((r) => r.unregister());
    });
    return;
  }

  updateSW = registerSW({
    immediate: true,
    onNeedRefresh() {
      requestReload();
    },
    onRegisteredSW(_swUrl, registration) {
      if (!registration) return;
      swRegistration = registration;
      window.setInterval(() => registration.update(), 5 * 60 * 1000);
    },
  });

  navigator.serviceWorker?.addEventListener("controllerchange", () => requestReload());

  watchNavigation();
  onUnsavedChange(() => { if (!hasUnsavedChanges()) setTimeout(tryPendingReload, 300); });
  document.addEventListener("focusout", () => setTimeout(() => { if (updatePending && !isBusy()) tryPendingReload(); }, 300));

  /* Appen öppnas igen från hemskärmen eller fliken tas fram — hämta senaste. */
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") { hiddenAt = Date.now(); return; }
    const wasLongHidden = hiddenAt !== null && Date.now() - hiddenAt > HIDDEN_RELOAD_MS;
    hiddenAt = null;
    if (wasLongHidden && updatePending && !hasUnsavedChanges()) { void applyUpdate(); return; }
    void checkForUpdateNow();
  });
  window.addEventListener("focus", () => void checkForUpdateNow());
  // iOS väcker hemskärmsappar från bakgrunden utan omladdning (bfcache).
  window.addEventListener("pageshow", (e) => { if (e.persisted) void checkForUpdateNow(); });
}

/**
 * Letar efter en nyare version nu. Finns en sådan laddas sidan om — men bara
 * när inget formulär har osparade ändringar; annars visas uppdateringsraden.
 */
export async function checkForUpdateNow() {
  if (isPreviewHost() || reloadingForUpdate) return;
  const now = Date.now();
  if (now - lastCheck < CHECK_THROTTLE_MS) return;
  lastCheck = now;

  try {
    const registration =
      swRegistration ?? (await navigator.serviceWorker?.getRegistration?.()) ?? null;
    if (!registration) return;
    swRegistration = registration;
    await registration.update();
    if (registration.waiting && navigator.serviceWorker.controller) requestReload();
  } catch (error) {
    console.warn("[uppdatering] kunde inte kontrollera ny version", error);
  }
}
