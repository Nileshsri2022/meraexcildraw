import type { Socket } from "socket.io-client";
import type { OrderedExcalidrawElement } from "@excalidraw/excalidraw/element/types";
import type { SocketId } from "@excalidraw/excalidraw/types";
import throttle from "lodash.throttle";
import { WS_EVENTS, WS_SUBTYPES, CURSOR_SYNC_TIMEOUT } from "./constants";

export interface SocketUpdateData {
    type: string;
    payload: unknown;
}

export interface Collab {
    getSceneElementsIncludingDeleted: () => readonly OrderedExcalidrawElement[];
    setCollaborators: (sockets: SocketId[]) => void;
    getUsername: () => string;
    getSelectedElementIds: () => Record<string, true>;
}

class Portal {
    collab: Collab;
    socket: Socket | null = null;
    socketInitialized = false;
    roomId: string | null = null;
    broadcastedElementVersions: Map<string, number> = new Map();

    constructor(collab: Collab) {
        this.collab = collab;
    }

    open(socket: Socket, roomId: string) {
        this.socket = socket;
        this.roomId = roomId;

        // Initialize socket listeners
        this.socket.on("init-room", () => {
            if (this.socket) {
                this.socket.emit("join-room", this.roomId);
            }
        });

        this.socket.on("new-user", async () => {
            // Send current scene to new user
            this.broadcastScene(
                WS_SUBTYPES.INIT,
                this.collab.getSceneElementsIncludingDeleted(),
                true
            );
        });

        this.socket.on("room-user-change", (clients: SocketId[]) => {
            this.collab.setCollaborators(clients);
        });

        // Socket connected - join room
        this.socket.emit("join-room", this.roomId);
        this.socketInitialized = true;

        return socket;
    }

    close() {
        if (!this.socket) return;
        this.socket.close();
        this.socket = null;
        this.roomId = null;
        this.socketInitialized = false;
        this.broadcastedElementVersions = new Map();
    }

    isOpen() {
        return !!(this.socketInitialized && this.socket && this.roomId);
    }

    private _broadcastSocketData(data: SocketUpdateData, volatile = false) {
        if (this.isOpen()) {
            const json = JSON.stringify(data);
            this.socket?.emit(
                volatile ? WS_EVENTS.SERVER_VOLATILE : WS_EVENTS.SERVER,
                this.roomId,
                json,
                null // iv placeholder (no encryption for simplicity)
            );
        }
    }

    broadcastScene = async (
        updateType: typeof WS_SUBTYPES.INIT | typeof WS_SUBTYPES.UPDATE,
        elements: readonly OrderedExcalidrawElement[],
        syncAll: boolean
    ) => {
        const syncableElements = elements.filter((element) => {
            if (syncAll) return true;
            const prevVersion = this.broadcastedElementVersions.get(element.id);
            return !prevVersion || element.version > prevVersion;
        });

        const data = {
            type: updateType,
            payload: { elements: syncableElements },
        };

        for (const el of syncableElements) {
            this.broadcastedElementVersions.set(el.id, el.version);
        }

        this._broadcastSocketData(data);
    };

    broadcastMouseLocation = throttle(
        (payload: {
            pointer: { x: number; y: number; tool: "pointer" | "laser" };
            button: "down" | "up";
        }) => {
            if (this.socket?.id) {
                const data = {
                    type: WS_SUBTYPES.MOUSE_LOCATION,
                    payload: {
                        socketId: this.socket.id as SocketId,
                        pointer: payload.pointer,
                        button: payload.button || "up",
                        selectedElementIds: this.collab.getSelectedElementIds(),
                        username: this.collab.getUsername(),
                    },
                };
                this._broadcastSocketData(data, true);
            }
        },
        CURSOR_SYNC_TIMEOUT
    );
}

export default Portal;
