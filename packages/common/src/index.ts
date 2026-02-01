// Common utilities and constants

// Colors
export const COLORS = {
    white: "#ffffff",
    black: "#1e1e1e",
    gray: "#868e96",
    red: "#fa5252",
    pink: "#e64980",
    grape: "#be4bdb",
    violet: "#7950f2",
    indigo: "#4c6ef5",
    blue: "#228be6",
    cyan: "#15aabf",
    teal: "#12b886",
    green: "#40c057",
    lime: "#82c91e",
    yellow: "#fab005",
    orange: "#fd7e14",
    transparent: "transparent",
    // Element stroke colors (for property panel)
    elementStroke: [
        "#1e1e1e", "#e03131", "#2f9e44", "#1971c2", "#f08c00",
        "#6741d9", "#0c8599", "#e64980", "#868e96",
    ],
    // Element background colors (for property panel)
    elementBackground: [
        "#ffc9c9", "#b2f2bb", "#a5d8ff", "#ffec99",
        "#d0bfff", "#99e9f2", "#fcc2d7", "#ced4da",
    ],
} as const;

export type ColorName = keyof typeof COLORS;

// Default UI options
export const DEFAULT_UI_OPTIONS = {
    canvasActions: {
        changeViewBackgroundColor: true,
        clearCanvas: true,
        export: {
            saveFileToDisk: true,
        },
        loadScene: true,
        saveToActiveFile: true,
        toggleTheme: true,
        saveAsImage: true,
    },
    tools: {
        image: true,
    },
};

// Text constants
export const BOUND_TEXT_PADDING = 5;
export const DEFAULT_FONT_SIZE = 20;
export const DEFAULT_FONT_FAMILY = 1;

// Font families
export const FONT_FAMILY = {
    Virgil: 1,
    Helvetica: 2,
    Cascadia: 3,
};

// Functions
export const isTestEnv = () => typeof process !== "undefined" && process.env?.NODE_ENV === "test";
export const isDevEnv = () => typeof process !== "undefined" && process.env?.NODE_ENV === "development";
export const isProdEnv = () => typeof process !== "undefined" && process.env?.NODE_ENV === "production";

export const getFontFamilyString = ({ fontFamily }: { fontFamily: number }) => {
    switch (fontFamily) {
        case FONT_FAMILY.Virgil:
            return '"Virgil", "Segoe Print", "Bradley Hand", "Chilanka", "TSCu_Comic", "casual", cursive';
        case FONT_FAMILY.Helvetica:
            return '"Helvetica", "Arial", sans-serif';
        case FONT_FAMILY.Cascadia:
            return '"Cascadia Code", "Consolas", "Menlo", "Courier New", monospace';
        default:
            return '"Virgil", "Segoe Print", "Bradley Hand", "Chilanka", "TSCu_Comic", "casual", cursive';
    }
};

export const getFontString = ({
    fontSize,
    fontFamily,
}: {
    fontSize: number;
    fontFamily: number;
}) => {
    return `${fontSize}px ${getFontFamilyString({ fontFamily })}`;
};

export const normalizeEOL = (str: string) => {
    return str.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
};

// App state defaults
export const DEFAULT_APP_STATE = {
    zoom: 1,
    scrollX: 0,
    scrollY: 0,
    viewBackgroundColor: COLORS.white,
    theme: "light" as const,
    selectedTool: "rectangle" as const,
    currentItemStrokeColor: COLORS.black,
    currentItemBackgroundColor: COLORS.transparent,
    currentItemFillStyle: "solid" as const,
    currentItemStrokeWidth: 2,
    currentItemStrokeStyle: "solid" as const,
    currentItemRoughness: 1,
    currentItemOpacity: 100,
    currentItemFontFamily: DEFAULT_FONT_FAMILY,
    currentItemFontSize: DEFAULT_FONT_SIZE,
    currentItemTextAlign: "left" as const,
    currentItemRoundness: 0, // 0 = sharp, higher values = more rounded
    gridSize: null as number | null,
    showGrid: false,
};

export type Theme = "light" | "dark";
export type Tool =
    | "selection"
    | "rectangle"
    | "ellipse"
    | "diamond"
    | "line"
    | "arrow"
    | "text"
    | "freedraw"
    | "eraser"
    | "hand";

// Keyboard shortcuts
export const SHORTCUTS = {
    UNDO: "Ctrl+Z",
    REDO: "Ctrl+Y",
    CUT: "Ctrl+X",
    COPY: "Ctrl+C",
    PASTE: "Ctrl+V",
    DELETE: "Delete",
    SELECT_ALL: "Ctrl+A",
    DUPLICATE: "Ctrl+D",
    ZOOM_IN: "Ctrl++",
    ZOOM_OUT: "Ctrl+-",
    ZOOM_RESET: "Ctrl+0",
    ESCAPE: "Escape",
    // Tool shortcuts
    SELECTION: "1",
    RECTANGLE: "2",
    ELLIPSE: "3",
    DIAMOND: "4",
    ARROW: "5",
    LINE: "6",
    FREEDRAW: "7",
    TEXT: "8",
    ERASER: "9",
    HAND: "H",
} as const;

// Shallow equality check
export const isShallowEqual = <T extends Record<string, unknown>>(
    obj1: T,
    obj2: T
): boolean => {
    const keys1 = Object.keys(obj1);
    const keys2 = Object.keys(obj2);

    if (keys1.length !== keys2.length) {
        return false;
    }

    for (const key of keys1) {
        if (obj1[key] !== obj2[key]) {
            return false;
        }
    }

    return true;
};

// Debounce function
export const debounce = <T extends (...args: unknown[]) => unknown>(
    fn: T,
    delay: number
): ((...args: Parameters<T>) => void) => {
    let timeoutId: ReturnType<typeof setTimeout>;
    return (...args: Parameters<T>) => {
        clearTimeout(timeoutId);
        timeoutId = setTimeout(() => fn(...args), delay);
    };
};

// Throttle function
export const throttle = <T extends (...args: unknown[]) => unknown>(
    fn: T,
    limit: number
): ((...args: Parameters<T>) => void) => {
    let inThrottle = false;
    return (...args: Parameters<T>) => {
        if (!inThrottle) {
            fn(...args);
            inThrottle = true;
            setTimeout(() => (inThrottle = false), limit);
        }
    };
};

// Generate unique color for user in collaboration
export const getUserColor = (index: number): string => {
    const hue = (index * 137.508) % 360; // Golden angle approximation
    return `hsl(${hue}, 70%, 50%)`;
};

// Format bytes to human readable
export const formatBytes = (bytes: number): string => {
    if (bytes === 0) return "0 Bytes";
    const k = 1024;
    const sizes = ["Bytes", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
};

// Deep clone an object
export const deepClone = <T>(obj: T): T => {
    return JSON.parse(JSON.stringify(obj));
};
