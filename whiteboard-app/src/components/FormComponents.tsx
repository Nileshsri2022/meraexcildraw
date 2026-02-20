import React from "react";
import { COLORS, LAYOUT, RADIUS, TYPOGRAPHY, TRANSITIONS } from "../constants/theme";

// ─── FormLabel ───────────────────────────────────────────────────────────────

export const FormLabel = ({ children, htmlFor }: { children: React.ReactNode; htmlFor?: string }) => (
    <label htmlFor={htmlFor} style={{
        display: "block",
        marginBottom: "6px",
        color: COLORS.textPrimary,
        fontSize: TYPOGRAPHY.fontSizeBase,
        fontWeight: 500,
    }}>
        {children}
    </label>
);

// ─── FormTextarea ────────────────────────────────────────────────────────────

export const FormTextarea = ({ value, onChange, placeholder }: {
    value: string;
    onChange: (val: string) => void;
    placeholder: string;
}) => (
    <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        style={{
            width: "100%",
            maxWidth: LAYOUT.formMaxWidth,
            minHeight: "70px",
            padding: "10px 12px",
            borderRadius: RADIUS.md + "px",
            border: `1px solid ${COLORS.borderDefault}`,
            backgroundColor: COLORS.bgSubtle,
            color: COLORS.textPrimary,
            fontSize: TYPOGRAPHY.fontSizeBase,
            lineHeight: "1.5",
            resize: "vertical",
            boxSizing: "border-box",
            outline: "none",
            fontFamily: "inherit",
            transition: TRANSITIONS.borderColor,
        }}
        onFocus={(e) => { e.currentTarget.style.borderColor = COLORS.accentPrimary; }}
        onBlur={(e) => { e.currentTarget.style.borderColor = COLORS.borderDefault; }}
    />
);

// ─── FormSelect ──────────────────────────────────────────────────────────────

export const FormSelect = ({ value, onChange, children }: {
    value: string;
    onChange: (val: string) => void;
    children: React.ReactNode;
}) => (
    <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        style={{
            width: "100%",
            maxWidth: LAYOUT.formMaxWidth,
            padding: "8px 12px",
            borderRadius: RADIUS.md + "px",
            border: `1px solid ${COLORS.borderDefault}`,
            backgroundColor: COLORS.bgSecondary,
            color: COLORS.textPrimary,
            fontSize: TYPOGRAPHY.fontSizeBase,
            cursor: "pointer",
            outline: "none",
            boxSizing: "border-box",
        }}
    >
        {children}
    </select>
);

// ─── FormSlider ──────────────────────────────────────────────────────────────

export const FormSlider = ({ label, value, onChange, min, max, step, accentColor = COLORS.accentPrimary, hint }: {
    label: string;
    value: number;
    onChange: (val: number) => void;
    min: number;
    max: number;
    step: number;
    accentColor?: string;
    hint?: string;
}) => (
    <div style={{ marginBottom: "12px" }}>
        <label style={{
            display: "flex",
            justifyContent: "space-between",
            marginBottom: "6px",
            color: COLORS.textPrimary,
            fontSize: TYPOGRAPHY.fontSizeMd,
            fontWeight: 500,
        }}>
            <span>{label}</span>
            <span style={{ color: accentColor }}>
                {value}
                {label.toLowerCase().includes("resolution") || label.toLowerCase().includes("height") || label.toLowerCase().includes("width") ? "px" : ""}
            </span>
        </label>
        <input
            type="range"
            min={min}
            max={max}
            step={step}
            value={value}
            onChange={(e) => onChange(Number(e.target.value))}
            style={{ width: "100%", maxWidth: LAYOUT.formMaxWidth, accentColor }}
        />
        {hint && <div style={{ fontSize: TYPOGRAPHY.fontSizeSm, color: COLORS.textSecondary, marginTop: "4px" }}>{hint}</div>}
    </div>
);

// ─── FormInput ───────────────────────────────────────────────────────────────

export const FormInput = ({ type = "text", value, onChange, disabled, ...rest }: {
    type?: string;
    value: string | number;
    onChange: (val: string) => void;
    disabled?: boolean;
    min?: number;
    max?: number;
    placeholder?: string;
}) => (
    <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        min={rest.min}
        max={rest.max}
        placeholder={rest.placeholder}
        style={{
            width: "100%",
            maxWidth: LAYOUT.formMaxWidth,
            padding: "8px 12px",
            borderRadius: RADIUS.md + "px",
            border: `1px solid ${COLORS.borderDefault}`,
            backgroundColor: disabled ? "rgba(255, 255, 255, 0.02)" : COLORS.bgSubtle,
            color: disabled ? COLORS.textMuted : COLORS.textPrimary,
            fontSize: TYPOGRAPHY.fontSizeBase,
            outline: "none",
            boxSizing: "border-box" as const,
            transition: TRANSITIONS.default,
            cursor: disabled ? "not-allowed" : "text",
        }}
    />
);

// ─── InfoBanner ──────────────────────────────────────────────────────────────

export const InfoBanner = ({ color, children }: { color: "indigo" | "amber"; children: React.ReactNode }) => {
    const palette = color === "amber"
        ? { bg: "rgba(234, 179, 8, 0.1)", border: "rgba(234, 179, 8, 0.2)", text: COLORS.warningText }
        : { bg: "rgba(99, 102, 241, 0.1)", border: "rgba(99, 102, 241, 0.2)", text: COLORS.accentPrimaryText };
    return (
        <div style={{
            padding: "10px 12px",
            borderRadius: RADIUS.md + "px",
            backgroundColor: palette.bg,
            border: `1px solid ${palette.border}`,
            marginBottom: "14px",
            fontSize: TYPOGRAPHY.fontSizeMd,
            color: palette.text,
            lineHeight: "1.5",
            maxWidth: LAYOUT.formMaxWidth,
        }}>
            {children}
        </div>
    );
};
