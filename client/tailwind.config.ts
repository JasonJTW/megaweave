import type { Config } from "tailwindcss";
import colors from "tailwindcss/colors";
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
      colors: {
        // Megaweave brand colors
        megaweave: {
          // Light warm tones
          cream: "#FDFCE8", // rgb(253, 252, 232)
          sand: "#D2CEB4", // rgb(210, 206, 180)
          stone: "#B2A986", // rgb(178, 169, 134)

          // Rich golden tones
          gold: {
            light: "#D5AB1C", // rgb(213, 171, 28)
            DEFAULT: "#A17624", // rgb(161, 118, 36)
          },

          // Natural green tones
          forest: {
            light: "#587635", // rgb(88, 118, 53)
            DEFAULT: "#3E6330", // rgb(62, 99, 48)
            dark: "#233519", // rgb(35, 53, 25)
          },

          // Accent colors
          red: {
            light: "#D14C41", // rgb(209, 76, 65)
            dark: "#54160F", // rgb(84, 22, 15)
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
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
          ...colors.neutral,
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
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
