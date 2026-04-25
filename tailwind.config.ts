import type { Config } from "tailwindcss";

/**
 * Brand color is dynamic — set via CSS variables in `<ThemeStyle/>` from Google
 * Sheets `Theme` row. Static palette shades (brand-50…900) remain as fallback
 * for badges and decorative elements; only `brand.DEFAULT` follows the admin.
 */
const config: Config = {
  darkMode: "class",
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          DEFAULT: "rgb(var(--c-brand, 225 6 0) / <alpha-value>)",
          50: "#FFE5E4",
          100: "#FFCCCA",
          200: "#FF9995",
          300: "#FF655F",
          400: "#FF322A",
          500: "rgb(var(--c-brand, 225 6 0) / <alpha-value>)",
          600: "rgb(var(--c-brand-dark, 178 5 0) / <alpha-value>)",
          700: "#840300",
          800: "#560200",
          900: "#280100",
        },
        ink: {
          DEFAULT: "rgb(var(--c-ink, 11 13 16) / <alpha-value>)",
          soft: "#161A1F",
          mute: "#262B33",
        },
        paper: {
          DEFAULT: "#F8F9FB",
          soft: "#EEF1F5",
          mute: "#DDE2EA",
        },
      },
      fontFamily: {
        sans: ["var(--font-manrope)", "system-ui", "sans-serif"],
      },
      boxShadow: {
        card: "0 8px 24px rgba(14, 18, 24, 0.08)",
        cardHover: "0 16px 40px rgba(14, 18, 24, 0.14)",
      },
      backgroundImage: {
        "hero-day":
          "linear-gradient(135deg, rgb(var(--c-brand) / 0.08) 0%, rgba(11,13,16,0.02) 100%)",
        "hero-night":
          "linear-gradient(135deg, rgb(var(--c-brand) / 0.18) 0%, rgba(11,13,16,0.85) 100%)",
      },
    },
  },
  plugins: [],
};
export default config;
