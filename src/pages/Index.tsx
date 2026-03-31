import { useNavigate } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import makrillLogo from "@/assets/makrill-trade-logo.png";

const Index = () => {
  const navigate = useNavigate();

  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <div className="text-center space-y-6">
        <img src={makrillLogo} alt="Makrill Trade" className="h-24 w-auto mx-auto" />
        <p className="text-sm text-muted-foreground max-w-xs mx-auto">
          Nordic Trade Finance — Invest in real commodity deals
        </p>
        <button
          onClick={() => navigate("/portal")}
          className="inline-flex items-center gap-2 px-6 py-3 bg-primary text-primary-foreground font-semibold text-sm rounded-sm hover:opacity-90 transition-opacity"
        >
          Go to Opportunities
          <ArrowRight className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
};

export default Index;
