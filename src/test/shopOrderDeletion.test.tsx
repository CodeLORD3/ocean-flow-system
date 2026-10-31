import { describe, it, expect, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
const db = vi.hoisted(() => ({ eq: vi.fn(async () => ({ error: null })) }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { from: () => ({ delete: () => ({ eq: db.eq }) }) } }));
vi.mock("@/hooks/useActivityLog", () => ({ logActivity: vi.fn(async () => {}) }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
import { DeleteShopOrderButton } from "@/components/orders/DeleteShopOrderButton";

describe("shop order deletion", () => {
  it("refreshes both store and wholesale lists after a successful deletion", async () => {
    const client = new QueryClient();
    const invalidate = vi.spyOn(client, "invalidateQueries");
    render(<QueryClientProvider client={client}><DeleteShopOrderButton order={{ id: "order-a", status: "Ny", store_id: "store-a" }} /></QueryClientProvider>);
    fireEvent.click(screen.getByRole("button", { name: "Ta bort order" }));
    fireEvent.click(screen.getByRole("button", { name: "Ta bort", exact: true }));
    await waitFor(() => expect(invalidate).toHaveBeenCalledWith({ queryKey: ["shop-orders-shop"] }));
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["shop_orders"] });
    expect(db.eq).toHaveBeenCalledWith("id", "order-a");
  });
});