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
    },
});
