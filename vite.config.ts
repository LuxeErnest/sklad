import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";

// https://vitejs.dev/config/
export default defineConfig(() => ({
  server: {
    host: "::",
    port: 8080,
  },
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  build: {
    rollupOptions: {
      output: {
        // Раньше всё собиралось в один файл на мегабайт, который целиком
        // разбирался при каждом запуске. Крупные и редко меняющиеся
        // библиотеки вынесены отдельно, чтобы не пересобираться вместе с кодом.
        manualChunks: {
          react: ["react", "react-dom", "react-router-dom"],
          spreadsheet: ["xlsx"],
        },
      },
    },
  },
}));
