// Collaboration constants
export const COLLAB_SERVER_URL = import.meta.env.VITE_SERVER_URL || "http://localhost:3002";

export const WS_EVENTS = {
    SERVER_VOLATILE: "server-volatile-broadcast",
    SERVER: "server-broadcast",
    USER_FOLLOW_CHANGE: "user-follow",
} as const;

export const WS_SUBTYPES = {
    INIT: "SCENE_INIT",
    UPDATE: "SCENE_UPDATE",
    MOUSE_LOCATION: "MOUSE_LOCATION",
    IDLE_STATUS: "IDLE_STATUS",
} as const;

export const SYNC_FULL_SCENE_INTERVAL_MS = 20000;
export const CURSOR_SYNC_TIMEOUT = 33; // ~30fps
