/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        "primary": "#059669",
        "primary-container": "#00855d",
        "primary-fixed": "#85f8c4",
        "primary-fixed-dim": "#68dba9",
        "secondary": "#047857",
        "secondary-container": "#6cf8bb",
        "tertiary": "#10b981",
        "tertiary-container": "#34d399",
        "surface": "#f8faf9",
        "surface-bright": "#fbfdfc",
        "surface-container-lowest": "#ffffff",
        "surface-container-low": "#f4f9f6",
        "surface-container": "#ecfdf5",
        "surface-container-high": "#e6f4ed",
        "surface-container-highest": "#d5e5dc",
        "on-surface": "#131b2e",
        "on-surface-variant": "#3d4a42",
        "outline": "#6d7a72",
        "outline-variant": "#cbd5e1",
        "error": "#ba1a1a",
        "error-container": "#ffdad6",
        "background": "#f8faf9",
      },
      fontFamily: {
        sans: ["'Plus Jakarta Sans'", "'Inter'", "sans-serif"],
        mono: ["'JetBrains Mono'", "monospace"],
      },
      boxShadow: {
        card: "0 1px 2px rgba(15, 23, 42, 0.03), 0 4px 16px rgba(5, 150, 105, 0.05)",
        floating: "0 12px 32px -4px rgba(15, 23, 42, 0.08), 0 4px 12px -2px rgba(5, 150, 105, 0.06)",
      },
    },
  },
  plugins: [],
}
