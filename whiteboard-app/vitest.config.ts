import { defineConfig } from "vitest/config";

// Minimal Vitest setup (Track 3). This file is separate from vite.config.ts,
// so `bun run build` (tsc && vite build) is untouched: Vite still reads
// vite.config.ts, and no test file is imported by app code.
// Vitest 1.x pairs with the repo's Vite 5 (vitest 2+/3+ require Vite 6/7).
// Tests run in node (no DOM): see the test files for what is mocked/skipped.
export default defineConfig({
    test: {
        environment: "node",
        include: ["src/**/*.test.ts"],
    },
});
