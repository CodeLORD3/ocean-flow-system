import { Navigate, useLocation } from "react-router-dom";
import { useCashier } from "./store/cashier";
import { ReactNode } from "react";

export default function PosGate({ children, requireShift = false }: { children: ReactNode; requireShift?: boolean }) {
  const cashier = useCashier((s) => s.cashier);
  const location = useLocation();

  if (!cashier) return <Navigate to="/pos/login" replace state={{ from: location }} />;
  if (requireShift && !cashier.shift_id) return <Navigate to="/pos/shift" replace />;

  return <>{children}</>;
}
