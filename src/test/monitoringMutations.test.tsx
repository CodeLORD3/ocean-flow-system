import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";

const state = vi.hoisted(() => ({ calls: [] as { table: string; op: string; args: unknown[] }[], templateStore: "store-a" }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: {
  from: (table: string) => {
    const q: Record<string, unknown> = {};
    for (const op of ["select", "eq", "gte", "order", "range", "update", "delete", "is", "in"]) q[op] = (...args: unknown[]) => {
      state.calls.push({ table, op, args }); return q;
    };
    q.single = async () => ({ data: { store_id: state.templateStore }, error: null });
    q.then = (resolve: (v: unknown) => unknown) => resolve({ data: table === "checklist_days" ? [{ id: "day-a" }] : [], error: null });
    return q;
  },
} }));
vi.mock("@/contexts/StaffAuthContext", () => ({ useStaffAuth: () => ({ staff: null }) }));
vi.mock("@/hooks/useChecklist", () => ({ todayIso: () => "2026-10-31", staffInitials: () => "", DEFAULT_CHECKLIST_TEMPLATE_ID: "default" }));
import { useDeleteRegisterTask, useRenameRegisterTask } from "@/hooks/useTasks";

function wrapper({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={new QueryClient({ defaultOptions: { mutations: { retry: false } } })}>{children}</QueryClientProvider>;
}
beforeEach(() => { state.calls = []; state.templateStore = "store-a"; });
describe("register mutation boundaries", () => {
  it.each(["delete", "rename"])("%s only targets this store's unstarted current/future work", async (kind) => {
    const { result } = renderHook(() => ({ remove: useDeleteRegisterTask(), rename: useRenameRegisterTask() }), { wrapper });
    await act(async () => {
      if (kind === "delete") await result.current.remove.mutateAsync({ task: "Städa golv", templateItemId: "tpl-a", storeId: "store-a" });
      else await result.current.rename.mutateAsync({ oldName: "Städa golv", newName: "Tvätta golv", templateItemId: "tpl-a", storeId: "store-a" });
    });
    expect(state.calls).toContainEqual({ table: "checklist_days", op: "eq", args: ["store_id", "store-a"] });
    expect(state.calls).toContainEqual({ table: "checklist_days", op: "gte", args: ["checklist_date", "2026-10-31"] });
    expect(state.calls).toContainEqual({ table: "checklist_items", op: "in", args: ["day_id", ["day-a"]] });
    expect(state.calls).toContainEqual({ table: "checklist_items", op: "eq", args: ["done", false] });
    expect(state.calls).toContainEqual({ table: "checklist_items", op: "is", args: ["started_at", null] });
    expect(state.calls).toContainEqual({ table: "checklist_items", op: "eq", args: ["template_item_id", "tpl-a"] });
  });
  it("blocks shared templates before any write", async () => {
    state.templateStore = "";
    const { result } = renderHook(() => useDeleteRegisterTask(), { wrapper });
    await expect(result.current.mutateAsync({ task: "Städa golv", templateItemId: "shared", storeId: "store-a" })).rejects.toThrow("gemensam");
    expect(state.calls.filter((c) => ["delete", "update"].includes(c.op))).toEqual([]);
  });
});