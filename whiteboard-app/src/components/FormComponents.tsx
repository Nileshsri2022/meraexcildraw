import React from "react";

// ─── FormLabel ───────────────────────────────────────────────────────────────

export const FormLabel = ({ children, htmlFor }: { children: React.ReactNode; htmlFor?: string }) => (
    <label htmlFor={htmlFor} className="ai-label">
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
        className="ai-textarea"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        style={{ maxWidth: "480px" }}
    />
);

// ─── FormSelect ──────────────────────────────────────────────────────────────

export const FormSelect = ({ value, onChange, children }: {
    value: string;
    onChange: (val: string) => void;
    children: React.ReactNode;
}) => (
    <select
        className="ai-select"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        style={{ maxWidth: "480px" }}
    >
        {children}
    </select>
);

// ─── FormSlider ──────────────────────────────────────────────────────────────

export const FormSlider = ({ label, value, onChange, min, max, step, accentColor, hint }: {
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
        <label className="ai-label" style={{
            display: "flex",
            justifyContent: "space-between",
            textTransform: "none",
        }}>
            <span>{label}</span>
            <span style={{ color: accentColor || "var(--aurora-violet)" }}>
                {value}
                {label.toLowerCase().includes("resolution") || label.toLowerCase().includes("height") || label.toLowerCase().includes("width") ? "px" : ""}
            </span>
        </label>
        <input
            className="ai-slider"
            type="range"
            min={min}
            max={max}
            step={step}
            value={value}
            onChange={(e) => onChange(Number(e.target.value))}
            style={{ maxWidth: "480px", accentColor: accentColor || undefined }}
        />
        {hint && <div style={{ fontSize: "11px", color: "var(--text-muted)", marginTop: "4px" }}>{hint}</div>}
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
        className="ai-input"
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        min={rest.min}
        max={rest.max}
        placeholder={rest.placeholder}
        style={{
            maxWidth: "480px",
            opacity: disabled ? 0.5 : 1,
            cursor: disabled ? "not-allowed" : "text",
        }}
    />
);

// ─── InfoBanner ──────────────────────────────────────────────────────────────

export const InfoBanner = ({ color, children }: { color: "indigo" | "amber"; children: React.ReactNode }) => {
    const isAmber = color === "amber";
    return (
        <div className="ai-info" style={{
            maxWidth: "480px",
            background: isAmber ? "rgba(251, 191, 36, 0.06)" : undefined,
            borderColor: isAmber ? "rgba(251, 191, 36, 0.15)" : undefined,
            color: isAmber ? "var(--aurora-amber)" : undefined,
        }}>
            {children}
        </div>
    );
};
