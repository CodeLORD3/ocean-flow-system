import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";

const realtime = vi.hoisted(() => ({ channel: vi.fn(), removeChannel: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: realtime }));
vi.mock("@/hooks/useCurrentStaff", () => ({
  useCurrentStaff: () => ({ data: null }),
  staffFullName: () => "Testperson",
}));
vi.mock("@/hooks/useCustomerDemand", () => ({ useCustomerDemand: () => ({ data: new Map() }) }));
vi.mock("@/components/DeliveryNote", () => ({ default: () => null }));
vi.mock("@/components/orders/DeleteShopOrderButton", () => ({
  DeleteShopOrderButton: () => null,
  DELETABLE_SHOP_ORDER_STATUSES: ["Öppen"],
}));

import { OrderTable } from "@/pages/ShopOrders";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.clearAllMocks();
});

describe("opening a shared order", () => {
  it.each([390, 640, 813, 1280])("mounts one live editor at %i px and reopens without duplicate callbacks", (width) => {
    vi.spyOn(window, "matchMedia").mockImplementation((query) => ({
      matches: width <= Number(query.match(/max-width: (\d+)px/)?.[1]),
      media: query, onchange: null,
      addEventListener: vi.fn(), removeEventListener: vi.fn(),
      addListener: vi.fn(), removeListener: vi.fn(), dispatchEvent: () => true,
    }));
    let subscribed = false;
    const channel = {
      on: vi.fn((_kind: string) => {
        if (subscribed) throw new Error("cannot add presence callbacks after subscribe()");
        return channel;
      }),
      subscribe: vi.fn(() => { subscribed = true; return channel; }),
      presenceState: () => ({}),
      track: vi.fn(), send: vi.fn(),
    };
    realtime.channel.mockImplementation(() => channel);
    realtime.removeChannel.mockImplementation(() => { subscribed = false; });
    const order = {
      id: "open-order", status: "Öppen", created_at: "2026-10-31T12:22:56Z",
      desired_delivery_date: "2026-11-04", store_id: "store-zollikon",
      stores: { name: "Fiskskaldjur Zollikon" },
      shop_order_lines: [{ id: "line-a", product_id: "product-a", quantity_ordered: 20, unit: "kg",
        products: { name: "Färska Räkor Lyx", category: "Skaldjur" } }],
    };
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<QueryClientProvider client={client}>
      <OrderTable orders={[order]} products={[]} emptyMsg="" toast={vi.fn()}
        allowedWeekdays={null} isDateDisabled={() => false} />
    </QueryClientProvider>);
    const open = () => {
      if (width < 640) fireEvent.click(screen.getByRole("button", { name: /Tryck för att öppna/ }));
      else fireEvent.click(screen.getAllByText("Fiskskaldjur Zollikon")[1]);
    };
    open();
    expect(realtime.channel).toHaveBeenCalledTimes(1);
    expect(screen.getAllByText("Live · delad beställning")).toHaveLength(1);
    expect(screen.getByDisplayValue("20")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /^Stäng$/ }));
    expect(realtime.removeChannel).toHaveBeenCalledTimes(1);
    open();
    expect(realtime.channel).toHaveBeenCalledTimes(2);
    expect(screen.getAllByText("Live · delad beställning")).toHaveLength(1);
    act(() => cleanup());
    client.clear();
  });
});