import type { Config } from "tailwindcss";
// import colors from "tailwindcss/colors";
import tailwindcssAnimate from "tailwindcss-animate";
export default {
  darkMode: ["class"],
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
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
            dark: "#C8551E",
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
          15: "#e2e7df", // 15%
        },
        // secondary sand
        secondary: {
          DEFAULT: "#eaebe6", // 100%
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
      backgroundImage: {
        "megaweave-primary":
          "linear-gradient(135deg, #A17624 0%, #D5AB1C 100%)",
        "megaweave-forest":
          "linear-gradient(135deg, #233519 0%, #3E6330 35%, #587635 100%)",
        "megaweave-warm": "linear-gradient(135deg, #D2CEB4 0%, #B2A986 100%)",
        "megaweave-gold":
          "linear-gradient(135deg, #D5AB1C 0%, #A17624 35%, #D2CEB4 100%)",
        "megaweave-earth":
          "linear-gradient(135deg, #54160F 0%, #D14C41 50%, #D5AB1C 100%)",
        "megaweave-nature":
          "linear-gradient(135deg, #233519 0%, #587635 50%, #D2CEB4 100%)",
      },

      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
    },
  },
  plugins: [tailwindcssAnimate],
} satisfies Config;
