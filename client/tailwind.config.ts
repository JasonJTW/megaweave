import type { Config } from "tailwindcss";
// import colors from "tailwindcss/colors";
import tailwindcssAnimate from "tailwindcss-animate";
import plugin from "tailwindcss/plugin";
export default {
  darkMode: ["class"],
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      keyframes: {
        "accordion-down": {
          from: { height: "0" },
          to: { height: "var(--radix-accordion-content-height)" },
        },
        "accordion-up": {
          from: { height: "var(--radix-accordion-content-height)" },
          to: { height: "0" },
        },
        // 🚨 這是最關鍵的部分 🚨
        in: {
          "0%": { opacity: "0", transform: "scale(0.95)" },
          "100%": { opacity: "1", transform: "scale(1)" },
        },
        out: {
          "0%": { opacity: "1", transform: "scale(1)" },
          "100%": { opacity: "0", transform: "scale(0.95)" },
        },
      },
      animation: {
        // 重新定義或確認有這些標準的動畫工具類
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
        // 這些是 animate-in / animate-out 的後備或基礎定義
        in: "in 0.15s ease-out",
        out: "out 0.15s ease-in",
      },
      fontFamily: {
        ddin: ["var(--font-ddin-pro)"],
      },
      colors: {
        // Megaweave brand colors
        megaweave: {
          // Light warm tones
          cream: "#FDFCE8", // rgb(253, 252, 232)
          sand: "#efe6d6", // rgb(210, 206, 180)
          stone: "#B2A986", // rgb(178, 169, 134)

          // Rich golden tones
          gold: {
            DEFAULT: "#FAB40F", // rgb(161, 118, 36)
            light: "#FADC78", // rgb(213, 171, 28)
          },

          // Natural green tones
          forest: {
            DEFAULT: "#3C6432", // rgb(62, 99, 48)
            light: "#587635", // rgb(88, 118, 53)
            dark: "#23361A", // rgb(35, 54, 26)
          },

          // Accent colors
          red: {
            dark: "#C05421",
            light: "#FAA06C",
          },
          blue: {
            DEFAULT: "#5AAFA0",
            light: "#B5D8D4",
          },
          brown: {
            DEFAULT: "#46413C",
            light: "#D2C8B4",
          },
        },

        // Original shadcn/ui colors
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        // primary leaf green
        primary: {
          DEFAULT: "#3b6232", // 100%
          75: "#6c8965", // 75%
          50: "#9eb098", // 50%
          30: "#c4d0c2", // 30%
          15: "#e2e7e0", // 15%
          5: "#f4f5f3", // 5%
        },
        // secondary sand
        secondary: {
          DEFAULT: "#eaebe6", // 100%
        },
        dark: {
          DEFAULT: "#222222", // 100%
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        chart: {
          "1": "hsl(var(--chart-1))",
          "2": "hsl(var(--chart-2))",
          "3": "hsl(var(--chart-3))",
          "4": "hsl(var(--chart-4))",
          "5": "hsl(var(--chart-5))",
        },
      },

      // Custom gradients for easier use
      // backgroundImage: {
      //   "megaweave-primary":
      //     "linear-gradient(135deg, #A17624 0%, #D5AB1C 100%)",
      //   "megaweave-forest":
      //     "linear-gradient(135deg, #233519 0%, #3E6330 35%, #587635 100%)",
      //   "megaweave-warm": "linear-gradient(135deg, #D2CEB4 0%, #B2A986 100%)",
      //   "megaweave-earth":
      //     "linear-gradient(135deg, #54160F 0%, #D14C41 50%, #D5AB1C 100%)",
      //   "megaweave-nature":
      //     "linear-gradient(135deg, #233519 0%, #587635 50%, #D2CEB4 100%)",
      // },

      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
        "5xl": "5rem",
      },
    },
  },
  plugins: [
    tailwindcssAnimate,
    // *** 新增客製化文字樣式插件 ***
    plugin(function ({ addComponents }) {
      const typeStyles = {
        // --- Heading Styles ---
        ".type-h1": {
          fontSize: "4.5rem", // 72pt
          lineHeight: "1.2",
          fontWeight: "800", // Heavy (H)
        },
        ".type-h2": {
          fontSize: "3rem", // 48pt
          lineHeight: "1.3",
          fontWeight: "600", // Semibold (SB)
        },
        ".type-h3": {
          fontSize: "36px", // 36pt
          lineHeight: "1",
          fontWeight: "700", // Bold (B)
        },
        ".type-h4": {
          fontSize: "1.5rem", // 24pt
          lineHeight: "1.5",
          fontWeight: "700", // Bold (B)
        },
        ".type-h5": {
          fontSize: "1.25rem", // 20pt
          lineHeight: "1.5",
          fontWeight: "700", // Bold (B)
        },

        // --- Body Text Styles ---
        ".type-body-t1": {
          fontSize: "1.5rem", // 24pt
          lineHeight: "1.5",
          fontWeight: "500", // Medium (M)
        },
        ".type-body-t2": {
          fontSize: "1.25rem", // 20pt
          lineHeight: "1.5",
          fontWeight: "500", // Medium (M)
        },
        ".type-body-t3": {
          fontSize: "1.125rem", // 18pt
          lineHeight: "1.5",
          fontWeight: "500", // Regular (R)
        },
        ".type-body-t4": {
          fontSize: "16px", // 16pt
          lineHeight: "1",
          fontWeight: "500", // Regular (R)
        },
        // Body T5 範例 (包含 2% 字距)
        ".type-body-t5": {
          fontSize: "0.875rem", // 14pt
          lineHeight: "1.5",
          fontWeight: "400", // Regular (R) (假設)
          letterSpacing: "0.02em", // 2% 字距
        },
        ".type-button-b1": {
          fontSize: "18px", // 18pt
          lineHeight: "1.5rem",
          fontWeight: "600",
          letterSpacing: "0.02em",
        },
        ".type-button-b2": {
          fontSize: "16px", // 18pt
          lineHeight: "1",
          fontWeight: "600",
          letterSpacing: "0.05em", // 5% 字距
        },
      };

      addComponents(typeStyles);
    }),
  ],
} satisfies Config;
