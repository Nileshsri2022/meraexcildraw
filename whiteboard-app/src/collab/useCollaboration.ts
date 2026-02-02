import { useEffect, useCallback, useRef, useState } from "react";
import { io, Socket } from "socket.io-client";
import { atom, useAtom } from "jotai";
import { reconcileElements } from "@excalidraw/excalidraw";
import type { ExcalidrawImperativeAPI, Collaborator, SocketId } from "@excalidraw/excalidraw/types";
import type { OrderedExcalidrawElement } from "@excalidraw/excalidraw/element/types";
import type { RemoteExcalidrawElement } from "@excalidraw/excalidraw/data/reconcile";
import Portal from "./Portal";
import { COLLAB_SERVER_URL, WS_SUBTYPES, SYNC_FULL_SCENE_INTERVAL_MS } from "./constants";

// Jotai atoms for collaboration state
export const isCollaboratingAtom = atom(false);
export const collaboratorsAtom = atom<Map<SocketId, Collaborator>>(new Map());
export const roomIdAtom = atom<string | null>(null);

// Generate random username
const generateUsername = () => {
    const adjectives = ["Happy", "Clever", "Swift", "Brave", "Calm"];
    const animals = ["Panda", "Eagle", "Tiger", "Dolphin", "Fox"];
    return `${adjectives[Math.floor(Math.random() * adjectives.length)]} ${animals[Math.floor(Math.random() * animals.length)]}`;
};

// Get room ID from URL hash
export const getRoomIdFromUrl = (): string | null => {
    const hash = window.location.hash.slice(1);
    const params = new URLSearchParams(hash);
    return params.get("room");
};

// Set room ID in URL hash
export const setRoomIdInUrl = (roomId: string) => {
    window.location.hash = `room=${roomId}`;
};

// Generate random room ID
export const generateRoomId = () => {
    return Math.random().toString(36).substring(2, 12);
};

interface UseCollaborationProps {
    excalidrawAPI: ExcalidrawImperativeAPI | null;
}

export function useCollaboration({ excalidrawAPI }: UseCollaborationProps) {
    const [isCollaborating, setIsCollaborating] = useAtom(isCollaboratingAtom);
    const [, setCollaboratorsState] = useAtom(collaboratorsAtom);
    const [roomId, setRoomId] = useAtom(roomIdAtom);
    const [username] = useState(generateUsername);

    const portalRef = useRef<Portal | null>(null);
    const socketRef = useRef<Socket | null>(null);
    const syncIntervalRef = useRef<number | null>(null);
    const hasAutoJoinedRef = useRef(false);
    const collaboratorsRef = useRef<Map<SocketId, Collaborator>>(new Map());

    // Set collaborators
    const setCollaborators = useCallback(
        (socketIds: SocketId[]) => {
            const newCollaborators = new Map<SocketId, Collaborator>();
            for (const id of socketIds) {
                const existing = collaboratorsRef.current.get(id);
                if (existing) {
                    newCollaborators.set(id, existing);
                } else {
                    newCollaborators.set(id, {
                        id,
                        username: `User ${id.slice(0, 4)}`,
                        color: {
                            background: `hsl(${Math.random() * 360}, 70%, 80%)`,
                            stroke: `hsl(${Math.random() * 360}, 70%, 50%)`,
                        },
                    });
                }
            }
            collaboratorsRef.current = newCollaborators;
            setCollaboratorsState(newCollaborators);
            excalidrawAPI?.updateScene({ collaborators: newCollaborators });
        },
        [excalidrawAPI, setCollaboratorsState]
    );

    // Start collaboration
    const startCollaboration = useCallback(
        (targetRoomId?: string) => {
            if (!excalidrawAPI) {
                console.log("❌ Cannot start: no excalidrawAPI");
                return;
            }

            // If already connected, skip
            if (portalRef.current?.isOpen()) {
                console.log("⚠️ Already connected, skipping");
                return;
            }

            // Priority: passed roomId > URL roomId > generate new
            const urlRoomId = getRoomIdFromUrl();
            const room = targetRoomId || urlRoomId || generateRoomId();

            console.log(`� JOINING room: ${room}`);

            setRoomIdInUrl(room);
            setRoomId(room);

            // Create socket connection
            const socket = io(COLLAB_SERVER_URL, {
                transports: ["websocket", "polling"],
            });
            socketRef.current = socket;

            // Create portal
            const portal = new Portal({
                getSceneElementsIncludingDeleted: () =>
                    excalidrawAPI.getSceneElementsIncludingDeleted() as OrderedExcalidrawElement[],
                setCollaborators,
                getUsername: () => username,
                getSelectedElementIds: () => excalidrawAPI.getAppState().selectedElementIds,
            });
            portalRef.current = portal;

            // Handle incoming messages
            socket.on("client-broadcast", (data: string) => {
                try {
                    const parsed = JSON.parse(data);

                    if (parsed.type === WS_SUBTYPES.INIT || parsed.type === WS_SUBTYPES.UPDATE) {
                        const remoteElements = parsed.payload.elements as RemoteExcalidrawElement[];
                        if (remoteElements?.length) {
                            console.log(`📥 Received ${remoteElements.length} elements`);
                            // Reconcile remote elements with local elements
                            const localElements = excalidrawAPI.getSceneElementsIncludingDeleted();
                            const appState = excalidrawAPI.getAppState();
                            const reconciledElements = reconcileElements(
                                localElements as OrderedExcalidrawElement[],
                                remoteElements,
                                appState
                            );
                            excalidrawAPI.updateScene({ elements: reconciledElements });
                        }
                    } else if (parsed.type === WS_SUBTYPES.MOUSE_LOCATION) {
                        const { socketId, pointer, button, username: remoteUsername } = parsed.payload;
                        const newCollaborators = new Map(collaboratorsRef.current);
                        newCollaborators.set(socketId as SocketId, {
                            id: socketId,
                            pointer,
                            button,
                            username: remoteUsername,
                            color: {
                                background: `hsl(${(socketId.charCodeAt(0) * 37) % 360}, 70%, 80%)`,
                                stroke: `hsl(${(socketId.charCodeAt(0) * 37) % 360}, 70%, 50%)`,
                            },
                        });
                        collaboratorsRef.current = newCollaborators;
                        setCollaboratorsState(newCollaborators);
                        excalidrawAPI.updateScene({ collaborators: newCollaborators });
                    }
                } catch (e) {
                    console.error("Failed to parse broadcast:", e);
                }
            });

            portal.open(socket, room);
            setIsCollaborating(true);

            // Periodic full sync
            syncIntervalRef.current = window.setInterval(() => {
                portal.broadcastScene(
                    WS_SUBTYPES.UPDATE,
                    excalidrawAPI.getSceneElementsIncludingDeleted() as OrderedExcalidrawElement[],
                    true
                );
            }, SYNC_FULL_SCENE_INTERVAL_MS);
        },
        [excalidrawAPI, username, setCollaborators, setCollaboratorsState, setIsCollaborating, setRoomId]
    );

    // Stop collaboration
    const stopCollaboration = useCallback(() => {
        if (syncIntervalRef.current) {
            clearInterval(syncIntervalRef.current);
            syncIntervalRef.current = null;
        }
        portalRef.current?.close();
        portalRef.current = null;
        socketRef.current = null;
        setIsCollaborating(false);
        setCollaboratorsState(new Map());
        collaboratorsRef.current = new Map();
        excalidrawAPI?.updateScene({ collaborators: new Map() });
        window.location.hash = "";
        hasAutoJoinedRef.current = false;
        console.log("🔴 Left collaboration");
    }, [excalidrawAPI, setIsCollaborating, setCollaboratorsState]);

    // Handle pointer updates
    const onPointerUpdate = useCallback(
        (payload: {
            pointer: { x: number; y: number; tool: "pointer" | "laser" };
            button: "down" | "up";
        }) => {
            portalRef.current?.broadcastMouseLocation(payload);
        },
        []
    );

    // Handle scene changes
    const onSceneChange = useCallback(
        (elements: readonly OrderedExcalidrawElement[]) => {
            const isOpen = portalRef.current?.isOpen();
            if (isOpen) {
                portalRef.current!.broadcastScene(WS_SUBTYPES.UPDATE, elements, false);
            } else {
                console.log(`⚠️ onSceneChange called but portal not open (isOpen: ${isOpen}, portal: ${!!portalRef.current})`);
            }
        },
        []
    );

    // Auto-join room from URL on mount (runs once)
    useEffect(() => {
        if (hasAutoJoinedRef.current) return;

        const roomFromUrl = getRoomIdFromUrl();
        if (roomFromUrl && excalidrawAPI) {
            hasAutoJoinedRef.current = true;
            console.log(`🔄 Auto-joining room: ${roomFromUrl}`);
            // Use setTimeout to ensure React is done with initial render
            setTimeout(() => {
                startCollaboration(roomFromUrl);
            }, 100);
        }
    }, [excalidrawAPI, startCollaboration]);

    // Cleanup on unmount
    useEffect(() => {
        return () => {
            if (portalRef.current) {
                portalRef.current.close();
            }
        };
    }, []);

    return {
        isCollaborating,
        roomId,
        username,
        startCollaboration,
        stopCollaboration,
        onPointerUpdate,
        onSceneChange,
    };
}
