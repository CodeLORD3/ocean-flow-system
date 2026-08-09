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
          "ok-edge": "hsl(var(--row-ok-edge))",
          warn: "hsl(var(--row-warn))",
          "warn-edge": "hsl(var(--row-warn-edge))",
          late: "hsl(var(--row-late))",
          "late-edge": "hsl(var(--row-late-edge))",
          done: "hsl(var(--row-done))",
          "done-edge": "hsl(var(--row-done-edge))",
          off: "hsl(var(--row-off))",
          "off-edge": "hsl(var(--row-off-edge))",
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
