import { describe, it, expect, vi } from "vitest";
import {
    createElement,
    mutateElement,
    duplicateElement,
    deleteElement,
    restoreElement,
    getNonDeletedElements,
    getElementBounds,
    isPointInsideElement,
} from "../src/elementFactory";
import type { WhiteboardElement, RectangleElement, LinearElement } from "../src/types";

describe("elementFactory", () => {
    describe("createElement", () => {
        it("should create a rectangle element with correct properties", () => {
            const element = createElement("rectangle", 100, 200);

            expect(element.type).toBe("rectangle");
            expect(element.x).toBe(100);
            expect(element.y).toBe(200);
            expect(element.width).toBe(0);
            expect(element.height).toBe(0);
            expect(element.isDeleted).toBe(false);
            expect(element.id).toBeDefined();
            expect(element.version).toBe(1);
        });

        it("should create an ellipse element", () => {
            const element = createElement("ellipse", 50, 75);

            expect(element.type).toBe("ellipse");
            expect(element.x).toBe(50);
            expect(element.y).toBe(75);
        });

        it("should create a diamond element", () => {
            const element = createElement("diamond", 0, 0);
            expect(element.type).toBe("diamond");
        });

        it("should create a line element with points array", () => {
            const element = createElement("line", 10, 20) as LinearElement;

            expect(element.type).toBe("line");
            expect(element.points).toEqual([{ x: 0, y: 0 }]);
            expect(element.startArrowhead).toBeNull();
            expect(element.endArrowhead).toBeNull();
        });

        it("should create an arrow element with arrowhead", () => {
            const element = createElement("arrow", 10, 20) as LinearElement;

            expect(element.type).toBe("arrow");
            expect(element.endArrowhead).toBe("arrow");
        });

        it("should create a text element with default properties", () => {
            const element = createElement("text", 0, 0);

            expect(element.type).toBe("text");
            expect((element as any).text).toBe("");
            expect((element as any).fontSize).toBe(20);
        });

        it("should create a freedraw element with empty points", () => {
            const element = createElement("freedraw", 0, 0);

            expect(element.type).toBe("freedraw");
            expect((element as any).points).toEqual([]);
        });

        it("should apply custom options", () => {
            const element = createElement("rectangle", 0, 0, {
                strokeColor: "#ff0000",
                backgroundColor: "#00ff00",
                strokeWidth: 5,
            });

            expect(element.strokeColor).toBe("#ff0000");
            expect(element.backgroundColor).toBe("#00ff00");
            expect(element.strokeWidth).toBe(5);
        });
    });

    describe("mutateElement", () => {
        it("should update element and increment version", () => {
            const element = createElement("rectangle", 0, 0) as RectangleElement;
            const originalVersion = element.version;

            const mutated = mutateElement(element, { width: 100, height: 50 });

            expect(mutated.width).toBe(100);
            expect(mutated.height).toBe(50);
            expect(mutated.version).toBe(originalVersion + 1);
        });

        it("should update the timestamp", () => {
            const element = createElement("rectangle", 0, 0);
            const before = Date.now();

            const mutated = mutateElement(element, { x: 50 });

            expect(mutated.updated).toBeGreaterThanOrEqual(before);
        });
    });

    describe("duplicateElement", () => {
        it("should create a copy with new ID", () => {
            const element = createElement("rectangle", 100, 100);
            const duplicate = duplicateElement(element);

            expect(duplicate.id).not.toBe(element.id);
            expect(duplicate.x).toBe(element.x + 10);
            expect(duplicate.y).toBe(element.y + 10);
        });

        it("should apply custom offset", () => {
            const element = createElement("ellipse", 50, 50);
            const duplicate = duplicateElement(element, 20, 30);

            expect(duplicate.x).toBe(70);
            expect(duplicate.y).toBe(80);
        });

        it("should reset version to 1", () => {
            const element = createElement("rectangle", 0, 0);
            const mutated = mutateElement(element, { x: 10 });
            const duplicate = duplicateElement(mutated);

            expect(duplicate.version).toBe(1);
        });
    });

    describe("deleteElement", () => {
        it("should soft delete an element", () => {
            const element = createElement("rectangle", 0, 0);
            expect(element.isDeleted).toBe(false);

            const deleted = deleteElement(element);
            expect(deleted.isDeleted).toBe(true);
        });
    });

    describe("restoreElement", () => {
        it("should restore a deleted element", () => {
            const element = createElement("rectangle", 0, 0);
            const deleted = deleteElement(element);
            const restored = restoreElement(deleted);

            expect(restored.isDeleted).toBe(false);
        });
    });

    describe("getNonDeletedElements", () => {
        it("should filter out deleted elements", () => {
            const el1 = createElement("rectangle", 0, 0);
            const el2 = deleteElement(createElement("ellipse", 0, 0));
            const el3 = createElement("diamond", 0, 0);

            const nonDeleted = getNonDeletedElements([el1, el2, el3]);

            expect(nonDeleted).toHaveLength(2);
            expect(nonDeleted.map((e) => e.type)).toEqual(["rectangle", "diamond"]);
        });

        it("should return empty array for all deleted elements", () => {
            const elements = [
                deleteElement(createElement("rectangle", 0, 0)),
                deleteElement(createElement("ellipse", 0, 0)),
            ];

            expect(getNonDeletedElements(elements)).toHaveLength(0);
        });
    });

    describe("getElementBounds", () => {
        it("should return bounds for a shape element", () => {
            const element = mutateElement(createElement("rectangle", 10, 20) as RectangleElement, {
                width: 100,
                height: 50,
            });

            const bounds = getElementBounds(element);

            expect(bounds).toEqual({ x: 10, y: 20, width: 100, height: 50 });
        });

        it("should calculate bounds for a line element", () => {
            const element = createElement("line", 10, 20) as LinearElement;
            element.points = [
                { x: 0, y: 0 },
                { x: 50, y: 30 },
                { x: 100, y: 10 },
            ];

            const bounds = getElementBounds(element);

            expect(bounds.x).toBe(10);
            expect(bounds.y).toBe(20);
            expect(bounds.width).toBe(100);
            expect(bounds.height).toBe(30);
        });
    });

    describe("isPointInsideElement", () => {
        it("should return true for point inside element", () => {
            const element = mutateElement(createElement("rectangle", 0, 0) as RectangleElement, {
                width: 100,
                height: 100,
            });

            expect(isPointInsideElement({ x: 50, y: 50 }, element)).toBe(true);
        });

        it("should return false for point outside element", () => {
            const element = mutateElement(createElement("rectangle", 0, 0) as RectangleElement, {
                width: 100,
                height: 100,
            });

            expect(isPointInsideElement({ x: 150, y: 150 }, element)).toBe(false);
        });

        it("should account for threshold", () => {
            const element = mutateElement(createElement("rectangle", 0, 0) as RectangleElement, {
                width: 100,
                height: 100,
            });

            expect(isPointInsideElement({ x: 105, y: 50 }, element, 10)).toBe(true);
            expect(isPointInsideElement({ x: 115, y: 50 }, element, 10)).toBe(false);
        });
    });
});
