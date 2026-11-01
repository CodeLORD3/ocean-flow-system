import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useIsMobile } from "@/hooks/use-mobile";

afterEach(() => vi.restoreAllMocks());

function mockViewport(width: number) {
  const listeners = new Set<() => void>();
  let currentWidth = width;
  vi.spyOn(window, "matchMedia").mockImplementation((query) => ({
    get matches() {
      const max = Number(query.match(/max-width: (\d+)px/)?.[1]);
      return currentWidth <= max;
    },
    media: query,
    onchange: null,
    addEventListener: (_event: string, callback: EventListenerOrEventListenerObject) => {
      if (typeof callback === "function") listeners.add(callback as () => void);
    },
    removeEventListener: (_event: string, callback: EventListenerOrEventListenerObject) => {
      if (typeof callback === "function") listeners.delete(callback as () => void);
    },
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: () => true,
  }));
  return (nextWidth: number) => {
    currentWidth = nextWidth;
    act(() => listeners.forEach((listener) => listener()));
  };
}

describe("order detail viewport", () => {
  it("selects the mobile editor below the order layout's 640px breakpoint", () => {
    mockViewport(639);
    const { result } = renderHook(() => useIsMobile(640));
    expect(result.current).toBe(true);
  });

  it("selects only the desktop editor at 640px and updates across that boundary", () => {
    const resize = mockViewport(640);
    const { result } = renderHook(() => useIsMobile(640));
    expect(result.current).toBe(false);
    resize(639);
    expect(result.current).toBe(true);
    resize(813);
    expect(result.current).toBe(false);
  });

  it("preserves the existing 768px default for other pages", () => {
    mockViewport(767);
    const { result } = renderHook(() => useIsMobile());
    expect(result.current).toBe(true);
  });
});