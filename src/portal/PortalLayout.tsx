import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Outlet, useNavigate, NavLink } from "react-router-dom";
import { BarChart3, Briefcase, History, LogOut } from "lucide-react";

export default function PortalLayout() {
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
      setLoading(false);
      if (!session?.user) navigate("/portal/login");
    });
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
      setLoading(false);
      if (!session?.user) navigate("/portal/login");
    });
    return () => subscription.unsubscribe();
  }, [navigate]);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate("/portal/login");
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0a0e1a] flex items-center justify-center">
        <div className="text-[#0066ff] font-mono text-sm animate-pulse">LOADING...</div>
      </div>
    );
  }

  if (!user) return null;

  const navItems = [
    { to: "/portal", icon: BarChart3, label: "OFFERS", end: true },
    { to: "/portal/commitments", icon: Briefcase, label: "MY COMMITMENTS" },
    { to: "/portal/archive", icon: History, label: "ARCHIVE" },
  ];

  return (
    <div className="min-h-screen bg-[#0a0e1a] text-[#c8d6e5] font-mono flex flex-col">
      {/* Top bar */}
      <header className="h-10 flex items-center justify-between border-b border-[#1a2035] px-4 bg-[#0d1220]">
        <div className="flex items-center gap-6">
          <span className="text-[#0066ff] font-bold text-xs tracking-[0.2em]">TRADE PORTAL</span>
          <nav className="flex items-center gap-1">
            {navItems.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                className={({ isActive }) =>
                  `flex items-center gap-1.5 px-3 py-1.5 text-[10px] tracking-wider transition-colors ${
                    isActive
                      ? "text-[#0066ff] bg-[#0066ff]/10 border-b-2 border-[#0066ff]"
                      : "text-[#5a6a7a] hover:text-[#c8d6e5]"
                  }`
                }
              >
                <item.icon className="h-3 w-3" />
                {item.label}
              </NavLink>
            ))}
          </nav>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-[10px] text-[#5a6a7a]">{user.email}</span>
          <button
            onClick={handleLogout}
            className="flex items-center gap-1 text-[10px] text-[#5a6a7a] hover:text-red-400 transition-colors"
          >
            <LogOut className="h-3 w-3" />
            EXIT
          </button>
        </div>
      </header>

      <main className="flex-1 overflow-auto p-4">
        <Outlet />
      </main>

      <footer className="h-6 flex items-center justify-between border-t border-[#1a2035] px-4 text-[9px] text-[#3a4a5a]">
        <span>TRADE PORTAL v1.0</span>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1">
            <div className="h-1.5 w-1.5 rounded-full bg-green-500 animate-pulse" />
            CONNECTED
          </div>
        </div>
      </footer>
    </div>
  );
}
