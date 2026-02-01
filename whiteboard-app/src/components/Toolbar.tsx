import React from "react";
import { useAtom } from "jotai";
import { selectedToolAtom } from "@whiteboard/whiteboard";
import type { Tool } from "@whiteboard/common";

interface ToolButton {
    tool: Tool;
    icon: string;
    shortcut: string;
}

const tools: ToolButton[] = [
    { tool: "selection", icon: "👆", shortcut: "1" },
    { tool: "rectangle", icon: "▭", shortcut: "2" },
    { tool: "ellipse", icon: "○", shortcut: "3" },
    { tool: "diamond", icon: "◇", shortcut: "4" },
    { tool: "arrow", icon: "→", shortcut: "5" },
    { tool: "line", icon: "╱", shortcut: "6" },
    { tool: "freedraw", icon: "✏️", shortcut: "7" },
    { tool: "text", icon: "T", shortcut: "8" },
    { tool: "eraser", icon: "🧹", shortcut: "9" },
    { tool: "hand", icon: "✋", shortcut: "H" },
];

export const Toolbar: React.FC = () => {
    const [selectedTool, setSelectedTool] = useAtom(selectedToolAtom);

    return (
        <div className="toolbar">
            {tools.map(({ tool, icon, shortcut }) => (
                <button
                    key={tool}
                    className={`tooltip ${selectedTool === tool ? "active" : ""}`}
                    onClick={() => setSelectedTool(tool)}
                    data-tooltip={`${tool.charAt(0).toUpperCase() + tool.slice(1)} (${shortcut})`}
                    title={`${tool} (${shortcut})`}
                >
                    {icon}
                </button>
            ))}
        </div>
    );
};
