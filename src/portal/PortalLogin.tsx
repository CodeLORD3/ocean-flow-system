import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "react-router-dom";
import { Search, DollarSign, TrendingUp, Shield, ArrowRight } from "lucide-react";

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

  const steps = [
    {
      icon: Search,
      title: "Browse Offers",
      description: "Explore curated trade finance opportunities backed by real goods. Each offer shows the expected return, duration, and risk profile so you can make informed decisions.",
    },
    {
      icon: DollarSign,
      title: "Invest",
      description: "Choose an offer and invest any amount above the minimum. Your capital finances the purchase of goods that are already pre-sold, reducing risk.",
    },
    {
      icon: TrendingUp,
      title: "Get Repaid with Returns",
      description: "When the goods are sold, you receive your original investment plus the agreed return. Typical durations are 30–90 days with attractive fixed returns.",
    },
  ];

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Header */}
      <header className="h-14 flex items-center justify-between border-b border-border px-6 bg-white">
        <div className="flex items-center gap-2">
          <div className="h-7 w-7 bg-primary flex items-center justify-center">
            <span className="text-primary-foreground font-bold text-xs">OT</span>
          </div>
          <span className="text-foreground font-bold text-sm">Ocean Trade</span>
        </div>
      </header>

      <div className="flex-1 flex flex-col items-center justify-center px-4 py-12">
        {/* Hero section */}
        <div className="text-center mb-10 max-w-xl">
          <h1 className="text-2xl font-bold text-foreground mb-2">Invest in Trade Finance</h1>
          <p className="text-sm text-muted-foreground leading-relaxed">
            Earn attractive short-term returns by financing the purchase of pre-sold goods. 
            Simple, transparent, and backed by real inventory.
          </p>
        </div>

        {/* How It Works */}
        <div className="w-full max-w-3xl mb-10">
          <h2 className="text-xs font-semibold text-muted-foreground tracking-wider text-center mb-6">HOW IT WORKS</h2>
          <div className="grid grid-cols-3 gap-6">
            {steps.map((step, i) => (
              <div key={step.title} className="border border-border bg-white p-6 text-center relative">
                <div className="absolute -top-3 left-1/2 -translate-x-1/2 h-6 w-6 bg-primary text-primary-foreground flex items-center justify-center text-xs font-bold">
                  {i + 1}
                </div>
                <step.icon className="h-8 w-8 text-primary mx-auto mb-3 mt-2" />
                <h3 className="text-sm font-semibold text-foreground mb-2">{step.title}</h3>
                <p className="text-xs text-muted-foreground leading-relaxed">{step.description}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Trust badges */}
        <div className="flex items-center gap-6 mb-8">
          {[
            { icon: Shield, text: "Backed by real goods" },
            { icon: TrendingUp, text: "Fixed returns" },
            { icon: DollarSign, text: "Short-term durations" },
          ].map((badge) => (
            <div key={badge.text} className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <badge.icon className="h-3.5 w-3.5 text-primary" />
              {badge.text}
            </div>
          ))}
        </div>

        {/* Login form */}
        <div className="w-full max-w-sm">
          <div className="border border-border bg-white">
            <div className="h-11 flex items-center justify-center border-b border-border">
              <span className="text-sm font-semibold text-foreground">
                {isSignUp ? "Request Access" : "Sign In"}
              </span>
            </div>
            <div className="p-6 space-y-4">
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-1.5">
                  <label className="text-xs text-muted-foreground font-medium">Email</label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    className="w-full h-10 bg-muted/50 border border-border px-3 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none"
                    placeholder="your@email.com"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs text-muted-foreground font-medium">Password</label>
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    minLength={6}
                    className="w-full h-10 bg-muted/50 border border-border px-3 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none"
                    placeholder="••••••••"
                  />
                </div>

                {error && (
                  <div className="text-xs text-destructive bg-destructive/5 border border-destructive/20 px-3 py-2">
                    {error}
                  </div>
                )}
                {message && (
                  <div className="text-xs text-green-700 bg-green-50 border border-green-200 px-3 py-2">
                    {message}
                  </div>
                )}

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full h-10 bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 disabled:opacity-50 transition-colors flex items-center justify-center gap-2"
                >
                  {loading ? "Processing..." : isSignUp ? "Submit Request" : "Sign In"}
                  {!loading && <ArrowRight className="h-4 w-4" />}
                </button>
              </form>

              <div className="text-center">
                <button
                  onClick={() => { setIsSignUp(!isSignUp); setError(""); setMessage(""); }}
                  className="text-xs text-muted-foreground hover:text-primary transition-colors"
                >
                  {isSignUp ? "← Back to Sign In" : "Don't have an account? Request Access →"}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      <footer className="h-8 flex items-center justify-center border-t border-border text-[10px] text-muted-foreground bg-white">
        Ocean Trade Platform · Secure Investment Portal
      </footer>
    </div>
  );
}
