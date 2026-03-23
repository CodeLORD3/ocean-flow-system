import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "react-router-dom";

export default function PortalLogin() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isSignUp, setIsSignUp] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setMessage("");
    setLoading(true);

    if (isSignUp) {
      const { error } = await supabase.auth.signUp({
        email,
        password,
        options: { emailRedirectTo: window.location.origin + "/portal" },
      });
      if (error) setError(error.message);
      else setMessage("Check your email to confirm your account.");
    } else {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) setError(error.message);
      else navigate("/portal");
    }
    setLoading(false);
  };

  return (
    <div className="min-h-screen bg-[#0a0e1a] flex items-center justify-center font-mono">
      <div className="w-full max-w-sm">
        {/* Terminal header */}
        <div className="border border-[#1a2035] bg-[#0d1220]">
          <div className="h-8 flex items-center px-3 border-b border-[#1a2035] gap-2">
            <div className="h-2 w-2 rounded-full bg-red-500/60" />
            <div className="h-2 w-2 rounded-full bg-yellow-500/60" />
            <div className="h-2 w-2 rounded-full bg-green-500/60" />
            <span className="text-[10px] text-[#3a4a5a] ml-2">TRADE PORTAL — AUTH</span>
          </div>

          <div className="p-6 space-y-6">
            <div className="space-y-1">
              <h1 className="text-[#0066ff] text-lg font-bold tracking-[0.15em]">TRADE PORTAL</h1>
              <p className="text-[10px] text-[#5a6a7a] tracking-wider">
                {isSignUp ? "CREATE ACCOUNT" : "AUTHENTICATE TO CONTINUE"}
              </p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-1">
                <label className="text-[10px] text-[#5a6a7a] tracking-wider">EMAIL</label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  className="w-full h-9 bg-[#0a0e1a] border border-[#1a2035] px-3 text-xs text-[#c8d6e5] focus:border-[#0066ff] focus:outline-none transition-colors"
                  placeholder="user@domain.com"
                />
              </div>
              <div className="space-y-1">
                <label className="text-[10px] text-[#5a6a7a] tracking-wider">PASSWORD</label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  minLength={6}
                  className="w-full h-9 bg-[#0a0e1a] border border-[#1a2035] px-3 text-xs text-[#c8d6e5] focus:border-[#0066ff] focus:outline-none transition-colors"
                  placeholder="••••••••"
                />
              </div>

              {error && (
                <div className="text-[10px] text-red-400 bg-red-400/10 border border-red-400/20 px-3 py-2">
                  ERROR: {error}
                </div>
              )}
              {message && (
                <div className="text-[10px] text-green-400 bg-green-400/10 border border-green-400/20 px-3 py-2">
                  {message}
                </div>
              )}

              <button
                type="submit"
                disabled={loading}
                className="w-full h-9 bg-[#0066ff] text-white text-[11px] font-bold tracking-wider hover:bg-[#0052cc] disabled:opacity-50 transition-colors"
              >
                {loading ? "PROCESSING..." : isSignUp ? "CREATE ACCOUNT" : "LOGIN"}
              </button>
            </form>

            <button
              onClick={() => { setIsSignUp(!isSignUp); setError(""); setMessage(""); }}
              className="text-[10px] text-[#5a6a7a] hover:text-[#0066ff] transition-colors tracking-wider"
            >
              {isSignUp ? "← BACK TO LOGIN" : "CREATE NEW ACCOUNT →"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
