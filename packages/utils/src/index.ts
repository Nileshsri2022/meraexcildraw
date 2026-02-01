// Utility functions for whiteboard

// Export to PNG
export const exportToPng = async (
    canvas: HTMLCanvasElement
): Promise<Blob | null> => {
    return new Promise((resolve) => {
        canvas.toBlob((blob) => resolve(blob), "image/png");
    });
};

// Export to SVG (simplified version)
export const exportToSvg = (
    elements: unknown[],
    options: { width: number; height: number }
): string => {
    // Simplified SVG export
    let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${options.width}" height="${options.height}">`;
    // Add elements to SVG...
    svg += "</svg>";
    return svg;
};

// Download a file
export const downloadFile = (
    data: Blob | string,
    filename: string
): void => {
    const url = typeof data === "string" ? data : URL.createObjectURL(data);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    link.click();
    if (typeof data !== "string") {
        URL.revokeObjectURL(url);
    }
};

// Copy to clipboard
export const copyToClipboard = async (text: string): Promise<boolean> => {
    try {
        await navigator.clipboard.writeText(text);
        return true;
    } catch {
        return false;
    }
};

// Generate shareable link
export const generateShareableLink = (
    elements: unknown[],
    baseUrl = window.location.origin
): string => {
    const data = JSON.stringify(elements);
    const encoded = btoa(encodeURIComponent(data));
    return `${baseUrl}/#data=${encoded}`;
};

// Parse shareable link
export const parseShareableLink = (url: string): unknown[] | null => {
    try {
        const hash = new URL(url).hash;
        const dataMatch = hash.match(/#data=(.+)/);
        if (!dataMatch) return null;
        const decoded = decodeURIComponent(atob(dataMatch[1]));
        return JSON.parse(decoded);
    } catch {
        return null;
    }
};

// Local storage helpers
export const storage = {
    get: <T>(key: string, defaultValue: T): T => {
        try {
            const item = localStorage.getItem(key);
            return item ? JSON.parse(item) : defaultValue;
        } catch {
            return defaultValue;
        }
    },
    set: <T>(key: string, value: T): void => {
        try {
            localStorage.setItem(key, JSON.stringify(value));
        } catch {
            console.warn("Failed to save to localStorage");
        }
    },
    remove: (key: string): void => {
        try {
            localStorage.removeItem(key);
        } catch {
            // Ignore
        }
    },
};

// IndexedDB for larger data
export const indexedDB = {
    open: (name: string, version = 1): Promise<IDBDatabase> => {
        return new Promise((resolve, reject) => {
            const request = window.indexedDB.open(name, version);
            request.onerror = () => reject(request.error);
            request.onsuccess = () => resolve(request.result);
            request.onupgradeneeded = (event) => {
                const db = (event.target as IDBOpenDBRequest).result;
                if (!db.objectStoreNames.contains("data")) {
                    db.createObjectStore("data", { keyPath: "id" });
                }
            };
        });
    },
};

// Detect browser capabilities
export const capabilities = {
    supportsClipboard: () => "clipboard" in navigator,
    supportsIndexedDB: () => "indexedDB" in window,
    supportsServiceWorker: () => "serviceWorker" in navigator,
    isOffline: () => !navigator.onLine,
    isTouchDevice: () => "ontouchstart" in window,
};
