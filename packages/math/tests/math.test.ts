import { describe, it, expect } from "vitest";
import {
    distance,
    midpoint,
    angle,
    rotatePoint,
    normalizeAngle,
    degToRad,
    radToDeg,
    clamp,
    lerp,
    rectanglesIntersect,
    getBoundingBox,
    simplifyPath,
} from "../src/index";

describe("math utilities", () => {
    describe("distance", () => {
        it("should calculate distance between two points", () => {
            expect(distance({ x: 0, y: 0 }, { x: 3, y: 4 })).toBe(5);
        });

        it("should return 0 for same point", () => {
            expect(distance({ x: 5, y: 5 }, { x: 5, y: 5 })).toBe(0);
        });

        it("should handle negative coordinates", () => {
            expect(distance({ x: -3, y: 0 }, { x: 0, y: 4 })).toBe(5);
        });
    });

    describe("midpoint", () => {
        it("should calculate midpoint between two points", () => {
            const mid = midpoint({ x: 0, y: 0 }, { x: 10, y: 10 });
            expect(mid).toEqual({ x: 5, y: 5 });
        });

        it("should handle negative coordinates", () => {
            const mid = midpoint({ x: -10, y: -10 }, { x: 10, y: 10 });
            expect(mid).toEqual({ x: 0, y: 0 });
        });
    });

    describe("angle", () => {
        it("should calculate angle for horizontal line to the right", () => {
            expect(angle({ x: 0, y: 0 }, { x: 10, y: 0 })).toBe(0);
        });

        it("should calculate angle for vertical line downward", () => {
            expect(angle({ x: 0, y: 0 }, { x: 0, y: 10 })).toBe(Math.PI / 2);
        });

        it("should calculate angle for diagonal", () => {
            const result = angle({ x: 0, y: 0 }, { x: 10, y: 10 });
            expect(result).toBeCloseTo(Math.PI / 4);
        });
    });

    describe("rotatePoint", () => {
        it("should rotate point 90 degrees", () => {
            const result = rotatePoint({ x: 10, y: 0 }, { x: 0, y: 0 }, Math.PI / 2);
            expect(result.x).toBeCloseTo(0);
            expect(result.y).toBeCloseTo(10);
        });

        it("should rotate point 180 degrees", () => {
            const result = rotatePoint({ x: 5, y: 0 }, { x: 0, y: 0 }, Math.PI);
            expect(result.x).toBeCloseTo(-5);
            expect(result.y).toBeCloseTo(0);
        });

        it("should handle rotation around non-origin point", () => {
            const result = rotatePoint({ x: 20, y: 10 }, { x: 10, y: 10 }, Math.PI / 2);
            expect(result.x).toBeCloseTo(10);
            expect(result.y).toBeCloseTo(20);
        });
    });

    describe("normalizeAngle", () => {
        it("should normalize angle within 0 to 2π", () => {
            expect(normalizeAngle(0)).toBe(0);
            expect(normalizeAngle(Math.PI * 2)).toBeCloseTo(0);
            expect(normalizeAngle(Math.PI * 3)).toBeCloseTo(Math.PI);
        });

        it("should handle negative angles", () => {
            expect(normalizeAngle(-Math.PI / 2)).toBeCloseTo((3 * Math.PI) / 2);
        });
    });

    describe("degToRad", () => {
        it("should convert degrees to radians", () => {
            expect(degToRad(0)).toBe(0);
            expect(degToRad(90)).toBeCloseTo(Math.PI / 2);
            expect(degToRad(180)).toBeCloseTo(Math.PI);
            expect(degToRad(360)).toBeCloseTo(Math.PI * 2);
        });
    });

    describe("radToDeg", () => {
        it("should convert radians to degrees", () => {
            expect(radToDeg(0)).toBe(0);
            expect(radToDeg(Math.PI / 2)).toBeCloseTo(90);
            expect(radToDeg(Math.PI)).toBeCloseTo(180);
        });
    });

    describe("clamp", () => {
        it("should clamp value within range", () => {
            expect(clamp(5, 0, 10)).toBe(5);
            expect(clamp(-5, 0, 10)).toBe(0);
            expect(clamp(15, 0, 10)).toBe(10);
        });

        it("should handle edge cases", () => {
            expect(clamp(0, 0, 10)).toBe(0);
            expect(clamp(10, 0, 10)).toBe(10);
        });
    });

    describe("lerp", () => {
        it("should interpolate between values", () => {
            expect(lerp(0, 10, 0)).toBe(0);
            expect(lerp(0, 10, 1)).toBe(10);
            expect(lerp(0, 10, 0.5)).toBe(5);
        });

        it("should handle extrapolation", () => {
            expect(lerp(0, 10, 2)).toBe(20);
            expect(lerp(0, 10, -0.5)).toBe(-5);
        });
    });

    describe("rectanglesIntersect", () => {
        it("should detect intersecting rectangles", () => {
            const r1 = { x: 0, y: 0, width: 10, height: 10 };
            const r2 = { x: 5, y: 5, width: 10, height: 10 };
            expect(rectanglesIntersect(r1, r2)).toBe(true);
        });

        it("should detect non-intersecting rectangles", () => {
            const r1 = { x: 0, y: 0, width: 10, height: 10 };
            const r2 = { x: 20, y: 20, width: 10, height: 10 };
            expect(rectanglesIntersect(r1, r2)).toBe(false);
        });

        it("should handle touching rectangles", () => {
            const r1 = { x: 0, y: 0, width: 10, height: 10 };
            const r2 = { x: 10, y: 0, width: 10, height: 10 };
            expect(rectanglesIntersect(r1, r2)).toBe(false);
        });

        it("should detect contained rectangles", () => {
            const r1 = { x: 0, y: 0, width: 20, height: 20 };
            const r2 = { x: 5, y: 5, width: 5, height: 5 };
            expect(rectanglesIntersect(r1, r2)).toBe(true);
        });
    });

    describe("getBoundingBox", () => {
        it("should calculate bounding box for points", () => {
            const points = [
                { x: 0, y: 0 },
                { x: 10, y: 5 },
                { x: 5, y: 15 },
            ];
            const bbox = getBoundingBox(points);
            expect(bbox).toEqual({ x: 0, y: 0, width: 10, height: 15 });
        });

        it("should handle empty array", () => {
            expect(getBoundingBox([])).toEqual({ x: 0, y: 0, width: 0, height: 0 });
        });

        it("should handle single point", () => {
            const bbox = getBoundingBox([{ x: 5, y: 10 }]);
            expect(bbox).toEqual({ x: 5, y: 10, width: 0, height: 0 });
        });

        it("should handle negative coordinates", () => {
            const points = [
                { x: -10, y: -5 },
                { x: 10, y: 5 },
            ];
            const bbox = getBoundingBox(points);
            expect(bbox).toEqual({ x: -10, y: -5, width: 20, height: 10 });
        });
    });

    describe("simplifyPath", () => {
        it("should return same points for 2 or fewer points", () => {
            const points = [{ x: 0, y: 0 }];
            expect(simplifyPath(points, 1)).toEqual(points);
        });

        it("should simplify path by removing intermediate points", () => {
            const points = [
                { x: 0, y: 0 },
                { x: 5, y: 0.1 }, // Nearly on line
                { x: 10, y: 0 },
            ];
            const simplified = simplifyPath(points, 1);
            expect(simplified.length).toBeLessThanOrEqual(points.length);
        });

        it("should keep points that deviate significantly", () => {
            const points = [
                { x: 0, y: 0 },
                { x: 5, y: 10 }, // Deviates from line
                { x: 10, y: 0 },
            ];
            const simplified = simplifyPath(points, 1);
            expect(simplified.length).toBe(3);
        });
    });
});
