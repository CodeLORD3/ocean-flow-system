import type { Config } from "tailwindcss";

export default {
  darkMode: ["class"],
  content: ["./pages/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./app/**/*.{ts,tsx}", "./src/**/*.{ts,tsx}"],
  prefix: "",
  theme: {
    container: {
      center: true,
      padding: "2rem",
      screens: {
        "2xl": "1400px",
      },
    },
    extend: {
      fontFamily: {
        heading: ["Space Grotesk", "sans-serif"],
        body: ["DM Sans", "sans-serif"],
      },
      colors: {
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        success: {
          DEFAULT: "hsl(var(--success))",
          foreground: "hsl(var(--success-foreground))",
        },
        warning: {
          DEFAULT: "hsl(var(--warning))",
          foreground: "hsl(var(--warning-foreground))",
        },
        row: {
          ok: "hsl(var(--row-ok))",
          "ok-hover": "hsl(var(--row-ok-hover))",
          "ok-edge": "hsl(var(--row-ok-edge))",
          "ok-text": "hsl(var(--row-ok-text))",
          warn: "hsl(var(--row-warn))",
          "warn-hover": "hsl(var(--row-warn-hover))",
          "warn-edge": "hsl(var(--row-warn-edge))",
          "warn-text": "hsl(var(--row-warn-text))",
          late: "hsl(var(--row-late))",
          "late-hover": "hsl(var(--row-late-hover))",
          "late-edge": "hsl(var(--row-late-edge))",
          "late-text": "hsl(var(--row-late-text))",
          done: "hsl(var(--row-done))",
          "done-hover": "hsl(var(--row-done-hover))",
          "done-edge": "hsl(var(--row-done-edge))",
          "done-text": "hsl(var(--row-done-text))",
          off: "hsl(var(--row-off))",
          "off-hover": "hsl(var(--row-off-hover))",
          "off-edge": "hsl(var(--row-off-edge))",
          "off-text": "hsl(var(--row-off-text))",
          neutral: "hsl(var(--row-neutral))",
          "neutral-hover": "hsl(var(--row-neutral-hover))",
        },
        grid: {
          line: "hsl(var(--grid-line))",
          head: "hsl(var(--grid-head))",
        },
        mackerel: {
          DEFAULT: "hsl(var(--mackerel))",
          foreground: "hsl(var(--mackerel-foreground))",
          light: "hsl(var(--mackerel-light))",
          shimmer: "hsl(var(--mackerel-shimmer))",
          dark: "hsl(var(--mackerel-dark))",
          gold: "hsl(var(--mackerel-gold))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
        sidebar: {
          DEFAULT: "hsl(var(--sidebar-background))",
          foreground: "hsl(var(--sidebar-foreground))",
          primary: "hsl(var(--sidebar-primary))",
          "primary-foreground": "hsl(var(--sidebar-primary-foreground))",
          accent: "hsl(var(--sidebar-accent))",
          "accent-foreground": "hsl(var(--sidebar-accent-foreground))",
          border: "hsl(var(--sidebar-border))",
          ring: "hsl(var(--sidebar-ring))",
        },
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
      boxShadow: {
        card: "var(--shadow-card)",
        "card-hover": "var(--shadow-card-hover)",
      },
      keyframes: {
        "accordion-down": {
          from: { height: "0" },
          to: { height: "var(--radix-accordion-content-height)" },
        },
        "accordion-up": {
          from: { height: "var(--radix-accordion-content-height)" },
          to: { height: "0" },
        },
        "fade-in": {
          from: { opacity: "0", transform: "translateY(8px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
        "notice-flash": {
          "0%": { boxShadow: "0 0 0 0 hsl(var(--primary) / 0)", backgroundColor: "hsl(var(--primary) / 0)" },
          "12%": { boxShadow: "0 0 0 3px hsl(var(--primary) / 0.55)", backgroundColor: "hsl(var(--primary) / 0.12)" },
          "55%": { boxShadow: "0 0 0 3px hsl(var(--primary) / 0.35)", backgroundColor: "hsl(var(--primary) / 0.08)" },
          "100%": { boxShadow: "0 0 0 0 hsl(var(--primary) / 0)", backgroundColor: "hsl(var(--primary) / 0)" },
        },
      },
      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
        "fade-in": "fade-in 0.4s ease-out forwards",
        "notice-flash": "notice-flash 5s ease-in-out 1 both",
      },

    },
  },
  plugins: [require("tailwindcss-animate")],
} satisfies Config;
