/**
 * CollabPresenceBar — Shows active collaborators as a floating avatar bar.
 *
 * Reads the Jotai collaboratorsAtom + isCollaboratingAtom:
 *   - Renders only when collaborating
 *   - Shows each user's avatar (first letter) with their assigned color
 *   - Tooltip on hover shows the username
 *   - "You" badge on the local user
 *
 * Positioned as a fixed bar in the bottom-right above the footer.
 */
import React, { useMemo, memo } from "react";
import { useAtomValue } from "jotai";
import { isCollaboratingAtom, collaboratorsAtom } from "../collab/useCollaboration";
import type { SocketId, Collaborator } from "@excalidraw/excalidraw/types";

interface CollabPresenceBarProps {
    /** The local user's display name (from useCollaboration) */
    username: string;
}

/** Single avatar circle */
const Avatar = memo(({ collaborator, isYou }: { collaborator: Collaborator; isYou: boolean }) => {
    const initial = (collaborator.username || "?").charAt(0).toUpperCase();
    const bgColor = collaborator.color?.background || "hsl(220, 70%, 80%)";
    const strokeColor = collaborator.color?.stroke || "hsl(220, 70%, 50%)";

    return (
        <div
            className={`presence-avatar${isYou ? " presence-avatar--you" : ""}${collaborator.pointer ? " presence-avatar--active" : ""}`}
            style={{
                "--avatar-bg": bgColor,
                "--avatar-stroke": strokeColor,
            } as React.CSSProperties}
            title={isYou ? `${collaborator.username} (You)` : collaborator.username || "Unknown"}
        >
            <span className="presence-avatar__initial">{initial}</span>
            {isYou && <span className="presence-avatar__badge">You</span>}
            {collaborator.pointer && !isYou && (
                <span className="presence-avatar__dot" />
            )}
        </div>
    );
});
Avatar.displayName = "Avatar";

export const CollabPresenceBar: React.FC<CollabPresenceBarProps> = memo(({ username }) => {
    const isCollaborating = useAtomValue(isCollaboratingAtom);
    const collaborators = useAtomValue(collaboratorsAtom);

    // Build a sorted list: "You" first, then others alphabetically
    const avatarList = useMemo(() => {
        if (!collaborators.size) return [];

        const list: { id: SocketId; collaborator: Collaborator; isYou: boolean }[] = [];

        collaborators.forEach((collab, id) => {
            const isYou = collab.username === username ||
                collab.username === `User ${(id as string).slice(0, 4)}`;
            list.push({ id, collaborator: collab, isYou });
        });

        // Sort: you first, then alphabetical
        list.sort((a, b) => {
            if (a.isYou && !b.isYou) return -1;
            if (!a.isYou && b.isYou) return 1;
            return (a.collaborator.username || "").localeCompare(b.collaborator.username || "");
        });

        return list;
    }, [collaborators, username]);

    if (!isCollaborating || avatarList.length === 0) return null;

    return (
        <div className="presence-bar">
            <div className="presence-bar__avatars">
                {avatarList.map(({ id, collaborator, isYou }) => (
                    <Avatar key={id as string} collaborator={collaborator} isYou={isYou} />
                ))}
            </div>
            <span className="presence-bar__count">
                {avatarList.length} online
            </span>
        </div>
    );
});
CollabPresenceBar.displayName = "CollabPresenceBar";

export default CollabPresenceBar;
