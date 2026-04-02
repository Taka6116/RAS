import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/lib/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      keyframes: {
        "loader-ring": {
          "0%, 100%": { boxShadow: "0 0 0 0 rgba(0, 154, 224, 0.35)" },
          "50%": { boxShadow: "0 0 0 7px rgba(0, 154, 224, 0)" },
        },
        "loader-dot-soft": {
          "0%, 100%": { opacity: "0.35", transform: "scale(0.92)" },
          "50%": { opacity: "1", transform: "scale(1)" },
        },
      },
      animation: {
        "loader-ring": "loader-ring 1.75s ease-out infinite",
        "loader-dot-soft": "loader-dot-soft 1.1s ease-in-out infinite",
      },
      colors: {
        rc: {
          primary: "#009AE0",
          "primary-hover": "#0080C0",
          "primary-light": "#E6F5FC",
          navy: "#0A2540",
          "navy-light": "#163A5F",
          accent: "#00B4D8",
          red: "#E63946",
        },
      },
      fontFamily: {
        sans: ["Noto Sans JP", "sans-serif"],
        mono: ["DM Mono", "monospace"],
      },
    },
  },
  plugins: [],
};
export default config;
