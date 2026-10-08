import { defineConfig } from "vite";

const isPages = process.env.GITHUB_PAGES === "true";

export default defineConfig({
  // GitHub Pages serves under /food-calendar/; Cloudflare Pages serves at root
  base: isPages ? "/food-calendar/" : "/",
  build: {
    outDir: "dist",
  },
});
