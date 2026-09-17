import path from "node:path";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// https://vite.dev/config/
export default defineConfig({
  build: {
    emptyOutDir: true,
    rolldownOptions: {
      output: {
        codeSplitting: {
          groups: [
            // React runtime: tiny, shared by every chunk, changes rarely.
            // use-sync-external-store lives here too: eager code (sonner,
            // base-ui…) needs it, and leaving it in vendor-tiptap's
            // dependency closure would make the editor chunk load eagerly.
            {
              name: "vendor-react",
              test: /node_modules[\\/](react|react-dom|scheduler|use-sync-external-store)[\\/]/,
              priority: 10,
            },
            // TipTap + ProseMirror: only the lazy rich composer chunk needs
            // it; keeping it in its own chunk keeps the initial load free of
            // the editor.
            {
              name: "vendor-tiptap",
              test: /node_modules[\\/]@tiptap[\\/]/,
            },
            // Markdown pipeline (react-markdown + unified/remark/micromark):
            // only the lazy memo-content chunk needs it.
            {
              name: "vendor-markdown",
              test: /node_modules[\\/](react-markdown|remark-|rehype-|unified|micromark|mdast-|hast-|unist-|vfile|bail|trough|devlop|ccount|escape-string-regexp|property-information|space-separated-tokens|comma-separated-tokens|trim-lines|character-entities|decode-named-html-entity|markdown-table|zwitch|longest-streak|html-url-attributes|web-namespaces)/,
            },
            // Lucide icon set: large, shared, changes rarely.
            {
              name: "vendor-lucide",
              test: /node_modules[\\/]lucide-react[\\/]/,
            },
            // Base UI primitives + TanStack router/query: big app-shell libs.
            {
              name: "vendor-base-ui",
              test: /node_modules[\\/]@base-ui[\\/]/,
            },
            {
              name: "vendor-tanstack",
              test: /node_modules[\\/]@tanstack[\\/]/,
            },
          ],
        },
      },
    },
  },
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
