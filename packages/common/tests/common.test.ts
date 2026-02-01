import { describe, it, expect, vi, beforeEach } from "vitest";
import {
    COLORS,
    DEFAULT_UI_OPTIONS,
    DEFAULT_APP_STATE,
    SHORTCUTS,
    isShallowEqual,
    debounce,
    throttle,
    getUserColor,
    formatBytes,
    deepClone,
} from "../src/index";

describe("common utilities", () => {
    describe("COLORS", () => {
        it("should have predefined colors", () => {
            expect(COLORS.white).toBe("#ffffff");
            expect(COLORS.black).toBe("#1e1e1e");
            expect(COLORS.red).toBe("#fa5252");
            expect(COLORS.transparent).toBe("transparent");
        });
    });

    describe("DEFAULT_UI_OPTIONS", () => {
        it("should have canvas actions", () => {
            expect(DEFAULT_UI_OPTIONS.canvasActions.clearCanvas).toBe(true);
            expect(DEFAULT_UI_OPTIONS.canvasActions.toggleTheme).toBe(true);
        });

        it("should have tools options", () => {
            expect(DEFAULT_UI_OPTIONS.tools.image).toBe(true);
        });
    });

    describe("DEFAULT_APP_STATE", () => {
        it("should have default zoom of 1", () => {
            expect(DEFAULT_APP_STATE.zoom).toBe(1);
        });

        it("should have default scroll at origin", () => {
            expect(DEFAULT_APP_STATE.scrollX).toBe(0);
            expect(DEFAULT_APP_STATE.scrollY).toBe(0);
        });

        it("should have default theme light", () => {
            expect(DEFAULT_APP_STATE.theme).toBe("light");
        });

        it("should have default selected tool", () => {
            expect(DEFAULT_APP_STATE.selectedTool).toBe("rectangle");
        });
    });

    describe("SHORTCUTS", () => {
        it("should have undo shortcut", () => {
            expect(SHORTCUTS.UNDO).toBe("Ctrl+Z");
        });

        it("should have tool shortcuts", () => {
            expect(SHORTCUTS.RECTANGLE).toBe("2");
            expect(SHORTCUTS.ELLIPSE).toBe("3");
            expect(SHORTCUTS.HAND).toBe("H");
        });
    });

    describe("isShallowEqual", () => {
        it("should return true for equal objects", () => {
            const obj1 = { a: 1, b: 2, c: "test" };
            const obj2 = { a: 1, b: 2, c: "test" };
            expect(isShallowEqual(obj1, obj2)).toBe(true);
        });

        it("should return false for different objects", () => {
            const obj1 = { a: 1, b: 2 };
            const obj2 = { a: 1, b: 3 };
            expect(isShallowEqual(obj1, obj2)).toBe(false);
        });

        it("should return false for objects with different keys", () => {
            const obj1 = { a: 1, b: 2 } as any;
            const obj2 = { a: 1, c: 2 } as any;
            expect(isShallowEqual(obj1, obj2)).toBe(false);
        });

        it("should return true for empty objects", () => {
            expect(isShallowEqual({}, {})).toBe(true);
        });
    });

    describe("debounce", () => {
        beforeEach(() => {
            vi.useFakeTimers();
        });

        it("should debounce function calls", () => {
            const fn = vi.fn();
            const debouncedFn = debounce(fn, 100);

            debouncedFn();
            debouncedFn();
            debouncedFn();

            expect(fn).not.toHaveBeenCalled();

            vi.advanceTimersByTime(100);

            expect(fn).toHaveBeenCalledTimes(1);
        });

        it("should pass arguments to debounced function", () => {
            const fn = vi.fn();
            const debouncedFn = debounce(fn, 100);

            debouncedFn("arg1", "arg2");
            vi.advanceTimersByTime(100);

            expect(fn).toHaveBeenCalledWith("arg1", "arg2");
        });
    });

    describe("throttle", () => {
        beforeEach(() => {
            vi.useFakeTimers();
        });

        it("should throttle function calls", () => {
            const fn = vi.fn();
            const throttledFn = throttle(fn, 100);

            throttledFn();
            expect(fn).toHaveBeenCalledTimes(1);

            throttledFn();
            throttledFn();
            expect(fn).toHaveBeenCalledTimes(1);

            vi.advanceTimersByTime(100);
            throttledFn();
            expect(fn).toHaveBeenCalledTimes(2);
        });
    });

    describe("getUserColor", () => {
        it("should generate different colors for different indices", () => {
            const color1 = getUserColor(0);
            const color2 = getUserColor(1);
            const color3 = getUserColor(2);

            expect(color1).not.toBe(color2);
            expect(color2).not.toBe(color3);
        });

        it("should return HSL color string", () => {
            const color = getUserColor(0);
            expect(color).toMatch(/^hsl\(\d+\.?\d*,\s*70%,\s*50%\)$/);
        });
    });

    describe("formatBytes", () => {
        it("should format zero bytes", () => {
            expect(formatBytes(0)).toBe("0 Bytes");
        });

        it("should format bytes", () => {
            expect(formatBytes(500)).toBe("500 Bytes");
        });

        it("should format kilobytes", () => {
            expect(formatBytes(1024)).toBe("1 KB");
            expect(formatBytes(1536)).toBe("1.5 KB");
        });

        it("should format megabytes", () => {
            expect(formatBytes(1048576)).toBe("1 MB");
        });

        it("should format gigabytes", () => {
            expect(formatBytes(1073741824)).toBe("1 GB");
        });
    });

    describe("deepClone", () => {
        it("should create a deep copy of an object", () => {
            const original = { a: 1, b: { c: 2 } };
            const cloned = deepClone(original);

            expect(cloned).toEqual(original);
            expect(cloned).not.toBe(original);
            expect(cloned.b).not.toBe(original.b);
        });

        it("should clone arrays", () => {
            const original = [1, 2, [3, 4]];
            const cloned = deepClone(original);

            expect(cloned).toEqual(original);
            expect(cloned).not.toBe(original);
            expect(cloned[2]).not.toBe(original[2]);
        });
    });
});
