import { Outlet, useNavigate } from "react-router-dom";
import { useEffect, useState } from "react";
import "./pos.css";
import { useCashier } from "./store/cashier";
import { Button } from "@/components/ui/button";
import { Moon, Sun, LogOut, Wifi, WifiOff } from "lucide-react";

export default function PosLayout() {
  const [dark, setDark] = useState<boolean>(() =>
    typeof window !== "undefined" ? localStorage.getItem("pos.theme") === "dark" : false
  );
  const [online, setOnline] = useState<boolean>(typeof navigator !== "undefined" ? navigator.onLine : true);
  const cashier = useCashier((s) => s.cashier);
  const signOut = useCashier((s) => s.signOut);
  const nav = useNavigate();

  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
    };
  }, []);

  useEffect(() => {
    localStorage.setItem("pos.theme", dark ? "dark" : "light");
  }, [dark]);

  return (
    <div className={`pos-root ${dark ? "dark" : ""}`}>
      <header className="border-b border-border bg-card">
        <div className="flex h-14 items-center gap-3 px-4">
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-md bg-primary text-primary-foreground grid place-items-center font-semibold">
              FS
            </div>
            <div className="leading-tight">
              <div className="text-sm font-semibold">Fisk &amp; Skaldjur · Kassa</div>
              <div className="text-[11px] text-muted-foreground">Terminal · Stockholm</div>
            </div>
          </div>

          <div className="ml-auto flex items-center gap-2">
            <span
              className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ${
                online
                  ? "bg-success/10 text-success"
                  : "bg-warning/15 text-warning"
              }`}
            >
              {online ? <Wifi className="h-3 w-3" /> : <WifiOff className="h-3 w-3" />}
              {online ? "Online" : "Offline"}
            </span>

            <Button
              variant="ghost"
              size="icon"
              onClick={() => setDark((d) => !d)}
              title="Växla tema"
            >
              {dark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </Button>

            {cashier && (
              <>
                <div className="hidden sm:flex flex-col items-end leading-tight">
                  <span className="text-xs font-medium">{cashier.display_name}</span>
                  <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
                    {cashier.role === "manager"
                      ? "Manager"
                      : cashier.role === "shift_lead"
                        ? "Skiftledare"
                        : "Kassör"}
                  </span>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    signOut();
                    nav("/pos/login", { replace: true });
                  }}
                >
                  <LogOut className="h-3.5 w-3.5 mr-1" /> Logga ut
                </Button>
              </>
            )}
          </div>
        </div>
      </header>

      <main className="min-h-[calc(100vh-3.5rem)]">
        <Outlet />
      </main>
    </div>
  );
}
