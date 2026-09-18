import { createRoot } from "react-dom/client";
import { registerSW } from "virtual:pwa-register";
import App from "./App.tsx";
import "./index.css";

let reloadingForUpdate = false;

const host = window.location.hostname;
const isPreview =
  import.meta.env.DEV ||
  host === "localhost" ||
  host.endsWith("lovableproject.com") ||
  host.endsWith("id-preview--dc92d94e-c472-4cf5-a88c-37dbe635baaa.lovable.app");

if (isPreview) {
  navigator.serviceWorker?.getRegistrations?.().then((regs) => {
    regs.forEach((r) => r.unregister());
  });
} else {
  registerSW({
    immediate: true,
    onNeedRefresh() {
      window.location.reload();
    },
    onRegisteredSW(_swUrl, registration) {
      if (!registration) return;
      window.setInterval(() => registration.update(), 5 * 60 * 1000);
    },
  });

  navigator.serviceWorker?.addEventListener("controllerchange", () => {
    if (reloadingForUpdate) return;
    reloadingForUpdate = true;
    window.location.reload();
  });
}

const root = document.getElementById("root");
if (root) createRoot(root).render(<App />);
