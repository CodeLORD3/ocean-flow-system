import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate, Link } from "react-router-dom";
import { ArrowRight, Eye, EyeOff } from "lucide-react";

export default function PortalLogin() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
    if (signInError) {
      setError(signInError.message);
    } else {
      navigate("/portal");
    }
    setLoading(false);
  };

  return (
    <div className="min-h-screen bg-[#f4f6f9] flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="flex items-center justify-center gap-2 mb-8">
          <div className="h-8 w-8 bg-[#1a3a4a] flex items-center justify-center rounded">
            <span className="text-white font-bold text-xs">MT</span>
          </div>
          <span className="text-[#1a3a4a] font-bold text-lg">Makrill Trade</span>
        </div>

        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-8">
          <h1 className="text-xl font-bold text-[#1a3a4a] mb-1">Welcome back</h1>
          <p className="text-sm text-gray-500 mb-6">Sign in to your Makrill Trade account.</p>

          {error && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded text-red-700 text-xs">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-[#1a3a4a]/20 focus:border-[#1a3a4a]"
                required
                autoFocus
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-xs font-medium text-gray-700">Password</label>
                <Link to="/portal/forgot-password" className="text-xs text-[#1a3a4a] hover:underline">
                  Forgot password?
                </Link>
              </div>
              <div className="relative">
                <input
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-[#1a3a4a]/20 focus:border-[#1a3a4a] pr-10"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-[#1a3a4a] text-white py-2.5 rounded text-sm font-medium hover:bg-[#1a3a4a]/90 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {loading ? "Signing in…" : "Sign in"}
              {!loading && <ArrowRight className="h-4 w-4" />}
            </button>
          </form>
        </div>

        <p className="text-center text-xs text-gray-500 mt-4">
          Don't have an account?{" "}
          <Link to="/portal/signup" className="text-[#1a3a4a] font-medium hover:underline">
            Create one
          </Link>
        </p>
      </div>
    </div>
  );
}
