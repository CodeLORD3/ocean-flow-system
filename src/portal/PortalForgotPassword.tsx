import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Link } from "react-router-dom";
import { ArrowLeft, Mail } from "lucide-react";

export default function PortalForgotPassword() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    const { error: resetError } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/portal/reset-password`,
    });

    if (resetError) {
      setError(resetError.message);
    } else {
      setSent(true);
    }
    setLoading(false);
  };

  return (
    <div className="min-h-screen bg-[#f4f6f9] flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="flex items-center justify-center gap-2 mb-8">
          <div className="h-8 w-8 bg-[#1a3a4a] flex items-center justify-center rounded">
            <span className="text-white font-bold text-xs">MT</span>
          </div>
          <span className="text-[#1a3a4a] font-bold text-lg">Makrill Trade</span>
        </div>

        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-8">
          {sent ? (
            <div className="text-center">
              <div className="mx-auto w-12 h-12 bg-[#1a3a4a]/10 rounded-full flex items-center justify-center mb-4">
                <Mail className="h-6 w-6 text-[#1a3a4a]" />
              </div>
              <h1 className="text-xl font-bold text-[#1a3a4a] mb-2">Check your email</h1>
              <p className="text-sm text-gray-500 leading-relaxed mb-4">
                We've sent a password reset link to <strong>{email}</strong>.<br />
                Click the link to set a new password.
              </p>
              <p className="text-xs text-gray-400">
                Didn't receive the email? Check your spam folder or{" "}
                <button onClick={() => setSent(false)} className="text-[#1a3a4a] underline">try again</button>.
              </p>
            </div>
          ) : (
            <>
              <h1 className="text-xl font-bold text-[#1a3a4a] mb-1">Reset your password</h1>
              <p className="text-sm text-gray-500 mb-6">
                Enter the email address associated with your account and we'll send you a link to reset your password.
              </p>

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

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full bg-[#1a3a4a] text-white py-2.5 rounded text-sm font-medium hover:bg-[#1a3a4a]/90 transition-colors disabled:opacity-50"
                >
                  {loading ? "Sending…" : "Send reset link"}
                </button>
              </form>
            </>
          )}
        </div>

        <p className="text-center text-xs text-gray-500 mt-4">
          <Link to="/portal/login" className="text-[#1a3a4a] font-medium hover:underline flex items-center justify-center gap-1">
            <ArrowLeft className="h-3 w-3" /> Back to sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
