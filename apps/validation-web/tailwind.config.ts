import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}",
    "../../packages/ui/src/**/*.{ts,tsx}"
  ],
  theme: {
    extend: {
      colors: {
        ink: "#0f172a",
        sand: "#f7f4ee",
        clay: "#ddc6a8",
        ember: "#b45309",
        moss: "#365314"
      },
      boxShadow: {
        panel: "0 20px 40px rgba(15, 23, 42, 0.08)"
      },
      keyframes: {
        "status-sheen": {
          "0%": { backgroundPosition: "260% 50%" },
          "100%": { backgroundPosition: "-260% 50%" }
        }
      },
      animation: {
        "status-sheen": "status-sheen 0.65s linear infinite"
      }
    }
  },
  plugins: []
};

export default config;
