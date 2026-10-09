import { defineConfig } from "vite";
import { resolve } from "node:path";

const isPages = process.env.GITHUB_PAGES === "true";

export default defineConfig({
  // GitHub Pages serves under /food-calendar/; Cloudflare Pages serves at root
  base: isPages ? "/food-calendar/" : "/",
  build: {
    outDir: "dist",
    rollupOptions: {
      input: {
        main: resolve(__dirname, "index.html"),
        admin: resolve(__dirname, "admin.html"),
      },
    },
  },
});
