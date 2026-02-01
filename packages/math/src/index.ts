// Math utilities for whiteboard operations

export interface Point {
    x: number;
    y: number;
}

export interface Vector {
    x: number;
    y: number;
}

// Distance between two points
export const distance = (p1: Point, p2: Point): number => {
    return Math.sqrt(Math.pow(p2.x - p1.x, 2) + Math.pow(p2.y - p1.y, 2));
};

// Midpoint between two points
export const midpoint = (p1: Point, p2: Point): Point => {
    return {
        x: (p1.x + p2.x) / 2,
        y: (p1.y + p2.y) / 2,
    };
};

// Angle between two points in radians
export const angle = (p1: Point, p2: Point): number => {
    return Math.atan2(p2.y - p1.y, p2.x - p1.x);
};

// Rotate a point around an origin
export const rotatePoint = (
    point: Point,
    origin: Point,
    angleRad: number
): Point => {
    const cos = Math.cos(angleRad);
    const sin = Math.sin(angleRad);
    const dx = point.x - origin.x;
    const dy = point.y - origin.y;
    return {
        x: origin.x + dx * cos - dy * sin,
        y: origin.y + dx * sin + dy * cos,
    };
};

// Normalize an angle to [0, 2π)
export const normalizeAngle = (angle: number): number => {
    const TAU = Math.PI * 2;
    return ((angle % TAU) + TAU) % TAU;
};

// Convert degrees to radians
export const degToRad = (deg: number): number => {
    return (deg * Math.PI) / 180;
};

// Convert radians to degrees
export const radToDeg = (rad: number): number => {
    return (rad * 180) / Math.PI;
};

// Clamp a value between min and max
export const clamp = (value: number, min: number, max: number): number => {
    return Math.min(Math.max(value, min), max);
};

// Linear interpolation
export const lerp = (a: number, b: number, t: number): number => {
    return a + (b - a) * t;
};

// Check if two rectangles intersect
export const rectanglesIntersect = (
    r1: { x: number; y: number; width: number; height: number },
    r2: { x: number; y: number; width: number; height: number }
): boolean => {
    return (
        r1.x < r2.x + r2.width &&
        r1.x + r1.width > r2.x &&
        r1.y < r2.y + r2.height &&
        r1.y + r1.height > r2.y
    );
};

// Get bounding box of multiple points
export const getBoundingBox = (
    points: readonly Point[]
): { x: number; y: number; width: number; height: number } => {
    if (points.length === 0) {
        return { x: 0, y: 0, width: 0, height: 0 };
    }

    let minX = Infinity,
        minY = Infinity,
        maxX = -Infinity,
        maxY = -Infinity;

    for (const point of points) {
        minX = Math.min(minX, point.x);
        minY = Math.min(minY, point.y);
        maxX = Math.max(maxX, point.x);
        maxY = Math.max(maxY, point.y);
    }

    return {
        x: minX,
        y: minY,
        width: maxX - minX,
        height: maxY - minY,
    };
};

// Simplify a path using Ramer-Douglas-Peucker algorithm
export const simplifyPath = (
    points: readonly Point[],
    tolerance: number
): Point[] => {
    if (points.length <= 2) {
        return [...points];
    }

    const sqTolerance = tolerance * tolerance;

    const getSqDist = (p1: Point, p2: Point): number => {
        const dx = p1.x - p2.x;
        const dy = p1.y - p2.y;
        return dx * dx + dy * dy;
    };

    const getSqSegDist = (p: Point, p1: Point, p2: Point): number => {
        let x = p1.x,
            y = p1.y;
        let dx = p2.x - x,
            dy = p2.y - y;

        if (dx !== 0 || dy !== 0) {
            const t = ((p.x - x) * dx + (p.y - y) * dy) / (dx * dx + dy * dy);
            if (t > 1) {
                x = p2.x;
                y = p2.y;
            } else if (t > 0) {
                x += dx * t;
                y += dy * t;
            }
        }

        dx = p.x - x;
        dy = p.y - y;
        return dx * dx + dy * dy;
    };

    const simplifyDPStep = (
        points: readonly Point[],
        first: number,
        last: number,
        sqTolerance: number,
        simplified: Point[]
    ): void => {
        let maxSqDist = sqTolerance;
        let index = 0;

        for (let i = first + 1; i < last; i++) {
            const sqDist = getSqSegDist(points[i], points[first], points[last]);
            if (sqDist > maxSqDist) {
                index = i;
                maxSqDist = sqDist;
            }
        }

        if (maxSqDist > sqTolerance) {
            if (index - first > 1) {
                simplifyDPStep(points, first, index, sqTolerance, simplified);
            }
            simplified.push(points[index]);
            if (last - index > 1) {
                simplifyDPStep(points, index, last, sqTolerance, simplified);
            }
        }
    };

    const last = points.length - 1;
    const simplified: Point[] = [points[0]];
    simplifyDPStep(points, 0, last, sqTolerance, simplified);
    simplified.push(points[last]);

    return simplified;
};
