import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
    plugins: [react()],
    define: {
        "process.env.IS_PREACT": JSON.stringify("false"),
    },
    server: {
        port: 3000,
        open: true,
    },
    build: {
        outDir: "dist",
        sourcemap: true,
        rollupOptions: {
            output: {
                manualChunks: {
                    "vendor-excalidraw": ["@excalidraw/excalidraw"],
                    "vendor-markdown": [
                        "react-markdown",
                        "react-syntax-highlighter",
                        "remark-gfm",
                        "remark-math",
                        "rehype-katex",
                    ],
                    "vendor-katex": ["katex"],
                    "vendor-mermaid": ["@excalidraw/mermaid-to-excalidraw"],
                },
            },
        },
    },
});
