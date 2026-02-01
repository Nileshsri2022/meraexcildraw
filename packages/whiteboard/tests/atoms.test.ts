import { describe, it, expect, beforeEach } from "vitest";
import { createStore } from "jotai";
import {
    elementsAtom,
    selectedElementIdsAtom,
    appStateAtom,
    historyAtom,
    collabAtom,
    nonDeletedElementsAtom,
    selectedElementsAtom,
    zoomAtom,
    themeAtom,
    selectedToolAtom,
} from "../src/state/atoms";
import { createElement, deleteElement } from "@whiteboard/element";

describe("state atoms", () => {
    let store: ReturnType<typeof createStore>;

    beforeEach(() => {
        store = createStore();
    });

    describe("elementsAtom", () => {
        it("should initialize with empty array", () => {
            expect(store.get(elementsAtom)).toEqual([]);
        });

        it("should store elements", () => {
            const element = createElement("rectangle", 0, 0);
            store.set(elementsAtom, [element]);
            expect(store.get(elementsAtom)).toHaveLength(1);
            expect(store.get(elementsAtom)[0].type).toBe("rectangle");
        });
    });

    describe("selectedElementIdsAtom", () => {
        it("should initialize with empty set", () => {
            expect(store.get(selectedElementIdsAtom).size).toBe(0);
        });

        it("should store selected element IDs", () => {
            store.set(selectedElementIdsAtom, new Set(["id1", "id2"]));
            expect(store.get(selectedElementIdsAtom).has("id1")).toBe(true);
            expect(store.get(selectedElementIdsAtom).has("id2")).toBe(true);
        });
    });

    describe("appStateAtom", () => {
        it("should have default values", () => {
            const state = store.get(appStateAtom);
            expect(state.zoom).toBe(1);
            expect(state.scrollX).toBe(0);
            expect(state.scrollY).toBe(0);
            expect(state.theme).toBe("light");
            expect(state.selectedTool).toBe("rectangle");
        });

        it("should update state", () => {
            const state = store.get(appStateAtom);
            store.set(appStateAtom, { ...state, zoom: 2, theme: "dark" });

            const updated = store.get(appStateAtom);
            expect(updated.zoom).toBe(2);
            expect(updated.theme).toBe("dark");
        });
    });

    describe("historyAtom", () => {
        it("should initialize with empty history", () => {
            const history = store.get(historyAtom);
            expect(history.past).toEqual([]);
            expect(history.present).toEqual([]);
            expect(history.future).toEqual([]);
        });
    });

    describe("collabAtom", () => {
        it("should initialize with default values", () => {
            const collab = store.get(collabAtom);
            expect(collab.isCollaborating).toBe(false);
            expect(collab.roomId).toBeNull();
            expect(collab.username).toBe("Anonymous");
        });
    });

    describe("nonDeletedElementsAtom (derived)", () => {
        it("should filter deleted elements", () => {
            const el1 = createElement("rectangle", 0, 0);
            const el2 = deleteElement(createElement("ellipse", 0, 0));
            const el3 = createElement("diamond", 0, 0);

            store.set(elementsAtom, [el1, el2, el3]);

            const nonDeleted = store.get(nonDeletedElementsAtom);
            expect(nonDeleted).toHaveLength(2);
            expect(nonDeleted.map((e) => e.type)).toEqual(["rectangle", "diamond"]);
        });
    });

    describe("selectedElementsAtom (derived)", () => {
        it("should return selected elements", () => {
            const el1 = createElement("rectangle", 0, 0);
            const el2 = createElement("ellipse", 0, 0);
            const el3 = createElement("diamond", 0, 0);

            store.set(elementsAtom, [el1, el2, el3]);
            store.set(selectedElementIdsAtom, new Set([el1.id, el3.id]));

            const selected = store.get(selectedElementsAtom);
            expect(selected).toHaveLength(2);
            expect(selected.map((e) => e.id)).toContain(el1.id);
            expect(selected.map((e) => e.id)).toContain(el3.id);
        });
    });

    describe("zoomAtom (writable derived)", () => {
        it("should get zoom from appState", () => {
            expect(store.get(zoomAtom)).toBe(1);
        });

        it("should set zoom within bounds", () => {
            store.set(zoomAtom, 2);
            expect(store.get(zoomAtom)).toBe(2);
        });

        it("should clamp zoom to minimum 0.1", () => {
            store.set(zoomAtom, 0.01);
            expect(store.get(zoomAtom)).toBe(0.1);
        });

        it("should clamp zoom to maximum 10", () => {
            store.set(zoomAtom, 20);
            expect(store.get(zoomAtom)).toBe(10);
        });
    });

    describe("themeAtom (writable derived)", () => {
        it("should get theme from appState", () => {
            expect(store.get(themeAtom)).toBe("light");
        });

        it("should set theme", () => {
            store.set(themeAtom, "dark");
            expect(store.get(themeAtom)).toBe("dark");
        });
    });

    describe("selectedToolAtom (writable derived)", () => {
        it("should get selectedTool from appState", () => {
            expect(store.get(selectedToolAtom)).toBe("rectangle");
        });

        it("should set selected tool", () => {
            store.set(selectedToolAtom, "ellipse");
            expect(store.get(selectedToolAtom)).toBe("ellipse");
        });
    });
});
