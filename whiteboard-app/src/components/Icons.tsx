import React from "react";

// Shared SVG props for consistent stroke-based icons
const IconProps = {
    fill: "none" as const,
    stroke: "currentColor",
    strokeWidth: 2,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
};

interface IconSizeProps {
    size?: number;
}

export const IconDiagram = ({ size = 16 }: IconSizeProps) => (
    <svg width={size} height={size} viewBox="0 0 24 24" {...IconProps}><rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /><path d="M14 17.5h7M17.5 14v7" /></svg>
);

export const IconImage = ({ size = 16 }: IconSizeProps) => (
    <svg width={size} height={size} viewBox="0 0 24 24" {...IconProps}><rect x="3" y="3" width="18" height="18" rx="2" /><circle cx="8.5" cy="8.5" r="1.5" /><path d="M21 15l-5-5L5 21" /></svg>
);

export const IconSketch = ({ size = 16 }: IconSizeProps) => (
    <svg width={size} height={size} viewBox="0 0 24 24" {...IconProps}><path d="M12 20h9" /><path d="M16.5 3.5a2.121 2.121 0 013 3L7 19l-4 1 1-4L16.5 3.5z" /></svg>
);

export const IconOCR = ({ size = 16 }: IconSizeProps) => (
    <svg width={size} height={size} viewBox="0 0 24 24" {...IconProps}><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" /><polyline points="14 2 14 8 20 8" /><line x1="16" y1="13" x2="8" y2="13" /><line x1="16" y1="17" x2="8" y2="17" /></svg>
);

export const IconTTS = ({ size = 16 }: IconSizeProps) => (
    <svg width={size} height={size} viewBox="0 0 24 24" {...IconProps}><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" /><path d="M15.54 8.46a5 5 0 010 7.07" /><path d="M19.07 4.93a10 10 0 010 14.14" /></svg>
);

export const IconSparkle = ({ size = 16 }: IconSizeProps) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" stroke="none"><path d="M12 2l2.4 7.2L22 12l-7.6 2.8L12 22l-2.4-7.2L2 12l7.6-2.8L12 2z" /></svg>
);

export const IconHistory = ({ size = 16 }: IconSizeProps) => (
    <svg width={size} height={size} viewBox="0 0 24 24" {...IconProps}><polyline points="12 8 12 12 14 14" /><path d="M3.05 11a9 9 0 1 0 .5-4M3 3v5h5" /></svg>
);
