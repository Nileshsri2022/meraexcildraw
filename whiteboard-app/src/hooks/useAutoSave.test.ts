/**
 * useAutoSave debounce tests (Track 3) — READ THE STATUS NOTE FIRST.
 *
 * STATUS: the real `useAutoSave` hook is NOT tested here, deliberately.
 * It is a React hook (useState/useEffect/useRef/useCallback) that also
 * touches `window` (beforeunload listener) and IndexedDB (via
 * ../data/LocalStorage). Rendering it requires a DOM environment (jsdom)
 * plus a React renderer (@testing-library/react `renderHook`), neither of
 * which is installed in this repo — there is no test runner at all today.
 * Writing a node-environment test that calls the hook would fail, not pass,
 * so no such test is claimed here.
 *
 * What DOES run below (node, no DOM): the pure, extractable debounce /
 * persistence contract, mirrored exactly from the hook source read at main
 * 3b6510d (`whiteboard-app/src/hooks/useAutoSave.ts`):
 *   - triggerSave stores pending data, clears any existing timeout, and
 *     schedules the save after `debounceMs` (defaults in the hook:
 *     enabled = true, debounceMs = 2000);
 *   - a disabled hook never schedules a save;
 *   - performSave skips empty scenes (elements.length === 0);
 *   - flushSave clears the timer and saves pending data immediately.
 * The mirror below is labelled as such: it guards the CONTRACT, it does
 * not execute the hook. Wiring the hook to a shared pure helper (and then
 * testing that helper for real) is a separate refactor, NOT done in this
 * track, to keep this change minimal and backward-compatible.
 *
 * The skipped block at the bottom is the placeholder for the real hook
 * test: it documents exactly what environment it needs (jsdom +
 * @testing-library/react) so a future step can enable it instead of
 * silently pretending the hook is covered.
 *
 * Run: `bun run --cwd ./whiteboard-app test` (vitest, node environment).
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ─── Contract mirror (NOT the hook) ────────────────────────────────────────

interface SceneData {
    elements: unknown[];
    appState: Record<string, unknown>;
    files: Record<string, unknown>;
}

/**
 * Minimal faithful mirror of useAutoSave's triggerSave / performSave /
 * flushSave timer logic, with the persistence call injected as `save`.
 * Mirrors: pending-data overwrite, clearTimeout on retrigger,
 * setTimeout(save, debounceMs), enabled guard, empty-scene skip.
 * Deliberately does NOT mirror the hook's isSaving guard or its
 * setSaveStatus / setLastSaved React state — those need a renderer.
 */
function createDebouncedSaver(options: {
    enabled?: boolean;
    debounceMs?: number;
    save: (data: SceneData) => void;
}) {
    const { enabled = true, debounceMs = 2000, save } = options;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let pending: SceneData | null = null;

    function runPending() {
        if (!pending) return;
        const data = pending;
        pending = null;
        if (data.elements.length === 0) return; // hook: "Don't save empty scenes"
        save(data);
    }

    return {
        triggerSave(data: SceneData) {
            if (!enabled) return;
            pending = data;
            if (timer) clearTimeout(timer);
            timer = setTimeout(() => {
                timer = null;
                runPending();
            }, debounceMs);
        },
        flushSave() {
            if (timer) {
                clearTimeout(timer);
                timer = null;
            }
            runPending();
        },
    };
}

const scene = (id: string): SceneData => ({
    elements: [{ id }],
    appState: {},
    files: {},
});

beforeEach(() => {
    vi.useFakeTimers();
});

afterEach(() => {
    vi.useRealTimers();
});

describe("useAutoSave debounce contract (pure-logic mirror — NOT the hook)", () => {
    it("coalesces rapid triggerSave calls into ONE save with the LATEST data", () => {
        const save = vi.fn();
        const saver = createDebouncedSaver({ debounceMs: 2000, save });

        saver.triggerSave(scene("first"));
        saver.triggerSave(scene("second"));
        saver.triggerSave(scene("third"));

        expect(save).not.toHaveBeenCalled();
        vi.advanceTimersByTime(1999);
        expect(save).not.toHaveBeenCalled();
        vi.advanceTimersByTime(1);

        expect(save).toHaveBeenCalledTimes(1);
        expect(save).toHaveBeenCalledWith(scene("third"));
    });

    it("restarts the debounce window on each retrigger", () => {
        const save = vi.fn();
        const saver = createDebouncedSaver({ debounceMs: 2000, save });

        saver.triggerSave(scene("a"));
        vi.advanceTimersByTime(1500);
        saver.triggerSave(scene("b"));
        vi.advanceTimersByTime(1500);
        expect(save).not.toHaveBeenCalled();
        vi.advanceTimersByTime(500);

        expect(save).toHaveBeenCalledTimes(1);
        expect(save).toHaveBeenCalledWith(scene("b"));
    });

    it("never schedules a save when disabled", () => {
        const save = vi.fn();
        const saver = createDebouncedSaver({ enabled: false, debounceMs: 2000, save });

        saver.triggerSave(scene("x"));
        vi.advanceTimersByTime(10000);

        expect(save).not.toHaveBeenCalled();
    });

    it("never saves an empty scene", () => {
        const save = vi.fn();
        const saver = createDebouncedSaver({ debounceMs: 2000, save });

        saver.triggerSave({ elements: [], appState: {}, files: {} });
        vi.advanceTimersByTime(5000);

        expect(save).not.toHaveBeenCalled();
    });

    it("flushSave saves pending data immediately and cancels the timer", () => {
        const save = vi.fn();
        const saver = createDebouncedSaver({ debounceMs: 2000, save });

        saver.triggerSave(scene("pending"));
        saver.flushSave();

        expect(save).toHaveBeenCalledTimes(1);
        expect(save).toHaveBeenCalledWith(scene("pending"));
        vi.advanceTimersByTime(10000);
        expect(save).toHaveBeenCalledTimes(1); // no double-save from the timer
    });
});

// ─── Placeholder: the REAL hook test (needs a DOM environment) ─────────────

describe.skip("useAutoSave hook (REQUIRES DOM — placeholder, not runnable here)", () => {
    it.skip("debounces triggerSave and persists via saveScene (needs jsdom + @testing-library/react renderHook)", () => {
        // To enable: add `jsdom` and `@testing-library/react` as devDependencies,
        // render the hook with renderHook, drive triggerSave with fake timers,
        // and assert saveScene is called once with the latest scene. The hook
        // also registers a window beforeunload listener and checks
        // hasSavedScene() on mount, so a plain node environment cannot run it.
        // Until then this stays skipped and the hook itself is UNVERIFIED.
    });
});
