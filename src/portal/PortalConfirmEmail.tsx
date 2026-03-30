import { Link } from "react-router-dom";
import { Mail } from "lucide-react";

export default function PortalConfirmEmail() {
  return (
    <div className="min-h-screen bg-[#f4f6f9] flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="flex items-center justify-center gap-2 mb-8">
          <div className="h-8 w-8 bg-[#1a3a4a] flex items-center justify-center rounded">
            <span className="text-white font-bold text-xs">OT</span>
          </div>
          <span className="text-[#1a3a4a] font-bold text-lg">Ocean Trade</span>
        </div>

        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-8 text-center">
          <div className="mx-auto w-12 h-12 bg-[#1a3a4a]/10 rounded-full flex items-center justify-center mb-4">
            <Mail className="h-6 w-6 text-[#1a3a4a]" />
          </div>
          <h1 className="text-xl font-bold text-[#1a3a4a] mb-2">Check your email</h1>
          <p className="text-sm text-gray-500 leading-relaxed mb-6">
            We've sent a confirmation link to your email address.<br />
            Click the link to verify your account and start investing.
          </p>
          <div className="border-t border-gray-100 pt-4">
            <p className="text-xs text-gray-400">
              Didn't receive the email? Check your spam folder or{" "}
              <Link to="/portal/signup" className="text-[#1a3a4a] underline">try again</Link>.
            </p>
          </div>
        </div>

        <p className="text-center text-xs text-gray-500 mt-4">
          <Link to="/portal/login" className="text-[#1a3a4a] font-medium hover:underline">
            Back to sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
