import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: "class",
  content: [
    "./src/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        primary: {
          DEFAULT: "#008080",
          50:  "#e6f5f5",
          100: "#b3e0e0",
          200: "#80cccc",
          300: "#4db8b8",
          400: "#26a8a8",
          500: "#008080",
          600: "#007373",
          700: "#006363",
          800: "#005252",
          900: "#003d3d",
        },
        navy: {
          DEFAULT: "#004B79",
          50:  "#e6eff6",
          100: "#b3cfe6",
          200: "#80afd5",
          300: "#4d8fc5",
          400: "#2677b8",
          500: "#004B79",
          600: "#00436d",
          700: "#003860",
          800: "#002e50",
          900: "#00213a",
        },
        danger: {
          DEFAULT: "#ED1B2E",
          50:  "#fde8ea",
          100: "#f9b8be",
          200: "#f58892",
          300: "#f15866",
          400: "#ef3444",
          500: "#ED1B2E",
          600: "#d41829",
          700: "#b71424",
          800: "#9a101e",
          900: "#730c16",
        },
      },
      fontFamily: {
        sans: ["Inter", "system-ui", "sans-serif"],
      },
      animation: {
        "fade-in": "fadeIn 0.2s ease-in-out",
        "slide-in": "slideIn 0.2s ease-in-out",
        "slide-up": "slideUp 0.2s ease-in-out",
      },
      keyframes: {
        fadeIn: {
          "0%":   { opacity: "0" },
          "100%": { opacity: "1" },
        },
        slideIn: {
          "0%":   { transform: "translateX(-10px)", opacity: "0" },
          "100%": { transform: "translateX(0)",     opacity: "1" },
        },
        slideUp: {
          "0%":   { transform: "translateY(10px)", opacity: "0" },
          "100%": { transform: "translateY(0)",    opacity: "1" },
        },
      },
      boxShadow: {
        card: "0 1px 3px 0 rgba(0,0,0,0.1), 0 1px 2px -1px rgba(0,0,0,0.1)",
        "card-lg": "0 4px 6px -1px rgba(0,0,0,0.1), 0 2px 4px -2px rgba(0,0,0,0.1)",
      },
    },
  },
  plugins: [],
};

export default config;
