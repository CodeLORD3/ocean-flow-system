import { registerSW } from "virtual:pwa-register";

/**
 * Enda stället där appens uppdatering hanteras.
 *
 * Appen ska alltid köra senaste publicerade version: vid inloggning, när appen
 * öppnas igen från hemskärmen och regelbundet medan den står öppen. Hittas en
 * nyare version laddas sidan om direkt.
 *
 * I förhandsvisning och utveckling registreras ingen service worker alls — där
 * städas i stället bort gamla registreringar.
 */
let reloadingForUpdate = false;
let updateSW: ((reload?: boolean) => Promise<void>) | null = null;
let swRegistration: ServiceWorkerRegistration | null = null;
let lastCheck = 0;

const CHECK_THROTTLE_MS = 30 * 1000;

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

function showBanner() {
  if (document.getElementById("app-update-banner")) return;
  const b = document.createElement("div");
  b.id = "app-update-banner";
  b.textContent = "Ny version, laddar om när du lämnat fältet";
  b.style.cssText = "position:fixed;top:0;left:0;right:0;z-index:2147483647;padding:8px 12px;text-align:center;font-size:14px;font-weight:600;background:hsl(var(--primary));color:hsl(var(--primary-foreground))";
  document.body.appendChild(b);
}

function reloadOnce() {
  if (reloadingForUpdate) return;
  // Pågående inmatning: visa banner och ladda om först när fältet lämnas.
  if (isEditing()) {
    showBanner();
    document.addEventListener("focusout", () => setTimeout(() => { if (!isEditing()) reloadOnce(); }, 300), { once: true });
    return;
  }
  reloadingForUpdate = true;
  if (isStandalone()) void hardReload();
  else window.location.reload();
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
      reloadOnce();
    },
    onRegisteredSW(_swUrl, registration) {
      if (!registration) return;
      swRegistration = registration;
      window.setInterval(() => registration.update(), 5 * 60 * 1000);
    },
  });

  navigator.serviceWorker?.addEventListener("controllerchange", () => reloadOnce());

  /* Appen öppnas igen från hemskärmen eller fliken tas fram — hämta senaste. */
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") void checkForUpdateNow();
  });
  window.addEventListener("focus", () => void checkForUpdateNow());
  // iOS väcker hemskärmsappar från bakgrunden utan omladdning (bfcache).
  window.addEventListener("pageshow", (e) => { if (e.persisted) void checkForUpdateNow(); });
}

/**
 * Letar efter en nyare version nu och laddar om sidan om en sådan finns.
 * Anropas bland annat direkt efter inloggning.
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
    /* Väntande version = ny kod finns nedladdad: byt och ladda om. */
    if (registration.waiting && navigator.serviceWorker.controller) {
      if (updateSW) await updateSW(true);
      else reloadOnce();
    }
  } catch (error) {
    console.warn("[uppdatering] kunde inte kontrollera ny version", error);
  }
}
