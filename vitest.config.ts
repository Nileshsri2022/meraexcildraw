import path from "path";
import { fileURLToPath } from "url";
import { defineConfig } from "vitest/config";

// ESM equivalent of __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export default defineConfig({
    resolve: {
        alias: [
            {
                find: /^@whiteboard\/common$/,
                replacement: path.resolve(__dirname, "./packages/common/src/index.ts"),
            },
            {
                find: /^@whiteboard\/common\/(.*?)/,
                replacement: path.resolve(__dirname, "./packages/common/src/$1"),
            },
            {
                find: /^@whiteboard\/element$/,
                replacement: path.resolve(__dirname, "./packages/element/src/index.ts"),
            },
            {
                find: /^@whiteboard\/element\/(.*?)/,
                replacement: path.resolve(__dirname, "./packages/element/src/$1"),
            },
            {
                find: /^@whiteboard\/math$/,
                replacement: path.resolve(__dirname, "./packages/math/src/index.ts"),
            },
            {
                find: /^@whiteboard\/math\/(.*?)/,
                replacement: path.resolve(__dirname, "./packages/math/src/$1"),
            },
            {
                find: /^@whiteboard\/utils$/,
                replacement: path.resolve(__dirname, "./packages/utils/src/index.ts"),
            },
            {
                find: /^@whiteboard\/utils\/(.*?)/,
                replacement: path.resolve(__dirname, "./packages/utils/src/$1"),
            },
            {
                find: /^@whiteboard\/whiteboard$/,
                replacement: path.resolve(__dirname, "./packages/whiteboard/src/index.tsx"),
            },
            {
                find: /^@whiteboard\/whiteboard\/(.*?)/,
                replacement: path.resolve(__dirname, "./packages/whiteboard/src/$1"),
            },
        ],
    },
    test: {
        root: __dirname,
        include: ["packages/**/tests/**/*.test.ts"],
        globals: true,
        environment: "jsdom",
        setupFiles: [path.resolve(__dirname, "./setupTests.ts")],
        coverage: {
            reporter: ["text", "json-summary", "json", "html"],
            thresholds: {
                lines: 60,
                branches: 70,
                functions: 63,
                statements: 60,
            },
        },
    },
});
