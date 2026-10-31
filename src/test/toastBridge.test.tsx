import { describe, it, expect, vi } from "vitest";
import { createElement } from "react";
import { ToastAction } from "@/components/ui/toast";
const calls = vi.hoisted(() => ({ error: vi.fn(), toast: vi.fn() }));
vi.mock("sonner", () => ({ toast: Object.assign(calls.toast, { error: calls.error, dismiss: vi.fn() }) }));
import { toast } from "@/hooks/use-toast";

describe("Sonner bridge", () => {
  it("preserves the retry handler and 60-second duration", () => {
    const retry = vi.fn();
    toast({ title: "Utskrift misslyckades", variant: "destructive", duration: 60000,
      action: createElement(ToastAction, { altText: "Försök igen", onClick: retry }, "Försök igen") });
    const options = calls.error.mock.calls.at(-1)?.[1];
    expect(options.duration).toBe(60000);
    expect(options.action.label).toBe("Försök igen");
    options.action.onClick();
    expect(retry).toHaveBeenCalledOnce();
  });
});