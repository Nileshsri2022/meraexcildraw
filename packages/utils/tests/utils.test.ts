import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
    exportToPng,
    downloadFile,
    copyToClipboard,
    generateShareableLink,
    parseShareableLink,
    storage,
    capabilities,
} from "../src/index";

describe("utils", () => {
    describe("downloadFile", () => {
        it("should create and click a download link", () => {
            const createObjectURL = vi.fn(() => "blob:url");
            const revokeObjectURL = vi.fn();
            const click = vi.fn();
            const createElement = vi.spyOn(document, "createElement");

            (globalThis as any).URL.createObjectURL = createObjectURL;
            (globalThis as any).URL.revokeObjectURL = revokeObjectURL;

            const mockLink = { href: "", download: "", click };
            createElement.mockReturnValueOnce(mockLink as any);

            const blob = new Blob(["test"], { type: "text/plain" });
            downloadFile(blob, "test.txt");

            expect(createElement).toHaveBeenCalledWith("a");
            expect(mockLink.download).toBe("test.txt");
            expect(click).toHaveBeenCalled();
            expect(revokeObjectURL).toHaveBeenCalledWith("blob:url");

            createElement.mockRestore();
        });

        it("should handle string data URL", () => {
            const click = vi.fn();
            const createElement = vi.spyOn(document, "createElement");
            const mockLink = { href: "", download: "", click };
            createElement.mockReturnValueOnce(mockLink as any);

            downloadFile("data:text/plain;base64,dGVzdA==", "test.txt");

            expect(mockLink.href).toBe("data:text/plain;base64,dGVzdA==");
            expect(click).toHaveBeenCalled();

            createElement.mockRestore();
        });
    });

    describe("copyToClipboard", () => {
        it("should copy text to clipboard", async () => {
            const writeText = vi.fn().mockResolvedValue(undefined);
            Object.assign(navigator, {
                clipboard: { writeText },
            });

            const result = await copyToClipboard("test text");

            expect(writeText).toHaveBeenCalledWith("test text");
            expect(result).toBe(true);
        });

        it("should return false on clipboard error", async () => {
            const writeText = vi.fn().mockRejectedValue(new Error("Clipboard error"));
            Object.assign(navigator, {
                clipboard: { writeText },
            });

            const result = await copyToClipboard("test text");

            expect(result).toBe(false);
        });
    });

    describe("generateShareableLink", () => {
        it("should generate a shareable link with encoded data", () => {
            const elements = [{ id: "1", type: "rectangle" }];
            const link = generateShareableLink(elements, "https://example.com");

            expect(link).toContain("https://example.com/#data=");
        });
    });

    describe("parseShareableLink", () => {
        it("should parse a shareable link", () => {
            const elements = [{ id: "1", type: "rectangle" }];
            const link = generateShareableLink(elements, "https://example.com");
            const parsed = parseShareableLink(link);

            expect(parsed).toEqual(elements);
        });

        it("should return null for invalid link", () => {
            expect(parseShareableLink("https://example.com")).toBeNull();
        });

        it("should return null for malformed data", () => {
            expect(parseShareableLink("https://example.com/#data=invalid")).toBeNull();
        });
    });

    describe("storage", () => {
        beforeEach(() => {
            localStorage.clear();
        });

        it("should get value from localStorage", () => {
            localStorage.setItem("test-key", JSON.stringify({ value: 42 }));
            expect(storage.get("test-key", null)).toEqual({ value: 42 });
        });

        it("should return default value if key not found", () => {
            expect(storage.get("nonexistent", "default")).toBe("default");
        });

        it("should set value in localStorage", () => {
            storage.set("test-key", { value: 100 });
            expect(JSON.parse(localStorage.getItem("test-key")!)).toEqual({ value: 100 });
        });

        it("should remove value from localStorage", () => {
            localStorage.setItem("test-key", "value");
            storage.remove("test-key");
            expect(localStorage.getItem("test-key")).toBeNull();
        });
    });

    describe("capabilities", () => {
        it("should detect clipboard support", () => {
            expect(typeof capabilities.supportsClipboard()).toBe("boolean");
        });

        it("should detect IndexedDB support", () => {
            expect(typeof capabilities.supportsIndexedDB()).toBe("boolean");
        });

        it("should detect service worker support", () => {
            expect(typeof capabilities.supportsServiceWorker()).toBe("boolean");
        });

        it("should detect offline status", () => {
            expect(typeof capabilities.isOffline()).toBe("boolean");
        });

        it("should detect touch device", () => {
            expect(typeof capabilities.isTouchDevice()).toBe("boolean");
        });
    });
});
