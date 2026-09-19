import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import { registerAppUpdates } from "@/lib/appUpdate";
import "./index.css";

registerAppUpdates();

const root = document.getElementById("root");
if (root) createRoot(root).render(<App />);
