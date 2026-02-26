// ─── Design Tokens ───────────────────────────────────────────────────────────
// Replaces magic numbers/colors scattered throughout the codebase.

export const COLORS = {
    // Backgrounds
    bgPrimary: "#232329",
    bgSecondary: "#2d2d35",
    bgSidebar: "#1c1c22",
    bgOverlay: "rgba(0, 0, 0, 0.6)",
    bgHover: "rgba(255, 255, 255, 0.08)",
    bgSubtle: "rgba(255, 255, 255, 0.05)",
    bgSubtlest: "rgba(255, 255, 255, 0.03)",

    // Text
    textPrimary: "#e4e4e7",
    textSecondary: "#9ca3af",
    textMuted: "#6b7280",

    // Borders
    borderDefault: "rgba(255, 255, 255, 0.15)",
    borderSubtle: "rgba(255, 255, 255, 0.08)",
    borderSubtlest: "rgba(255, 255, 255, 0.06)",
    borderDivider: "rgba(255, 255, 255, 0.07)",

    // Accent
    accentPrimary: "#6366f1",
    accentPrimaryHover: "#818cf8",
    accentPrimaryBg: "rgba(99, 102, 241, 0.15)",
    accentPrimaryText: "#a5b4fc",

    // Functional
    errorText: "#f87171",
    errorBg: "rgba(239, 68, 68, 0.1)",
    errorBorder: "rgba(239, 68, 68, 0.3)",
    successText: "#34d399",
    successBg: "rgba(16, 185, 129, 0.15)",
    warningText: "#fbbf24",

    // AI History type colors
    typeDiagram: "#818cf8",
    typeImage: "#34d399",
    typeSketch: "#f472b6",
    typeOcr: "#fbbf24",
    typeTts: "#60a5fa",
} as const;

export const SPACING = {
    xs: 2,
    sm: 4,
    md: 8,
    lg: 12,
    xl: 16,
    xxl: 24,
    xxxl: 32,
} as const;

export const RADIUS = {
    sm: 4,
    md: 8,
    lg: 10,
    xl: 14,
    pill: 20,
} as const;

export const Z_INDEX = {
    dialog: 9999,
    dropdown: 1000,
} as const;

export const TYPOGRAPHY = {
    fontSizeXs: "10px",
    fontSizeSm: "11px",
    fontSizeMd: "12px",
    fontSizeBase: "13px",
    fontSizeLg: "14px",
} as const;

export const LAYOUT = {
    /** Max width for form elements inside the dialog */
    formMaxWidth: "480px",
    /** Max width for the history panel */
    historyMaxWidth: "560px",
    /** Dialog dimensions */
    dialogWidth: "min(680px, 90vw)",
    dialogHeight: "min(520px, 80vh)",
    /** Sidebar width */
    sidebarWidth: "175px",
} as const;

export const TRANSITIONS = {
    fast: "all 0.15s ease",
    default: "all 0.2s ease",
    borderColor: "border-color 0.2s ease",
} as const;
