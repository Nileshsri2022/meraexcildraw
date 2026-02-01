import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
    plugins: [react()],
    resolve: {
        alias: {
            "@whiteboard/common": path.resolve(__dirname, "../packages/common/src"),
            "@whiteboard/element": path.resolve(__dirname, "../packages/element/src"),
            "@whiteboard/math": path.resolve(__dirname, "../packages/math/src"),
            "@whiteboard/utils": path.resolve(__dirname, "../packages/utils/src"),
            "@whiteboard/whiteboard": path.resolve(__dirname, "../packages/whiteboard/src"),
        },
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
