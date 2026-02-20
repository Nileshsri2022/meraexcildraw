import re

with open('whiteboard-app/src/components/AIToolsDialog.tsx', 'r', encoding='utf-8') as f:
    content = f.read()

# ═══ 1. Replace the dialog container + header + tabs section ═══
# From the dialog inner div through end of tabs div

old_section = '''            <div
                className="ai-dialog-scrollbar"
                style={{
                    backgroundColor: "#232329",
                    padding: "24px",
                    borderRadius: "14px",
                    width: "420px",
                    maxHeight: "90vh",
                    overflowY: "auto",
                    boxShadow: "0 16px 48px rgba(0, 0, 0, 0.5), 0 0 0 1px rgba(255, 255, 255, 0.08)",
                }}
                onClick={(e) => e.stopPropagation()}
            >
                {/* Header */}
                <div style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    marginBottom: "18px",
                }}>
                    <h2 style={{
                        margin: 0,
                        fontSize: "17px",
                        fontWeight: 600,
                        color: "#e4e4e7",
                        display: "flex",
                        alignItems: "center",
                        gap: "8px",
                    }}>
                        <span>\u2728</span> AI Tools
                    </h2>
                    <button
                        onClick={onClose}
                        style={{
                            width: "28px",
                            height: "28px",
                            borderRadius: "8px",
                            border: "1px solid rgba(255,255,255,0.1)",
                            backgroundColor: "transparent",
                            color: "#6b7280",
                            cursor: "pointer",
                            fontSize: "14px",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            transition: "all 0.2s ease",
                        }}
                        onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = "rgba(255,255,255,0.08)"; e.currentTarget.style.color = "#e4e4e7"; }}
                        onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = "transparent"; e.currentTarget.style.color = "#6b7280"; }}
                    >
                        \u2715
                    </button>
                </div>'''

new_section = '''            <div
                style={{
                    backgroundColor: "#232329",
                    borderRadius: "14px",
                    width: "620px",
                    maxHeight: "85vh",
                    display: "flex",
                    boxShadow: "0 16px 48px rgba(0, 0, 0, 0.5), 0 0 0 1px rgba(255, 255, 255, 0.08)",
                    overflow: "hidden",
                }}
                onClick={(e) => e.stopPropagation()}
            >
                {/* ─── Left Sidebar ─── */}
                <div style={{
                    width: "180px",
                    minWidth: "180px",
                    backgroundColor: "#1e1e24",
                    borderRight: "1px solid rgba(255, 255, 255, 0.08)",
                    padding: "16px 0",
                    display: "flex",
                    flexDirection: "column",
                }}>
                    <h2 style={{
                        margin: "0 0 16px 0",
                        padding: "0 16px",
                        fontSize: "15px",
                        fontWeight: 600,
                        color: "#e4e4e7",
                        display: "flex",
                        alignItems: "center",
                        gap: "8px",
                    }}>
                        <span>\u2728</span> AI Tools
                    </h2>

                    <nav style={{ display: "flex", flexDirection: "column", gap: "2px", padding: "0 8px" }}>
                        {([
                            { id: "diagram" as const, icon: "\U0001f4ca", label: "Diagram" },
                            { id: "image" as const,   icon: "\U0001f5bc\ufe0f", label: "Image" },
                            { id: "sketch" as const,  icon: "\u270f\ufe0f",  label: "Sketch" },
                            { id: "ocr" as const,     icon: "\U0001f4dd",  label: "OCR" },
                            { id: "tts" as const,     icon: "\U0001f50a",  label: "TTS" },
                        ]).map(tab => (
                            <button
                                key={tab.id}
                                onClick={() => { setActiveTab(tab.id); setError(null); }}
                                style={{
                                    display: "flex",
                                    alignItems: "center",
                                    gap: "10px",
                                    padding: "8px 12px",
                                    borderRadius: "8px",
                                    border: "none",
                                    backgroundColor: activeTab === tab.id ? "rgba(99, 102, 241, 0.15)" : "transparent",
                                    color: activeTab === tab.id ? "#a5b4fc" : "#9ca3af",
                                    cursor: "pointer",
                                    fontSize: "13px",
                                    fontWeight: activeTab === tab.id ? 600 : 400,
                                    transition: "all 0.15s ease",
                                    width: "100%",
                                    textAlign: "left" as const,
                                }}
                            >
                                <span style={{ fontSize: "16px" }}>{tab.icon}</span>
                                {tab.label}
                            </button>
                        ))}
                    </nav>
                </div>

                {/* ─── Right Content Panel ─── */}
                <div
                    className="ai-dialog-scrollbar"
                    style={{
                        flex: 1,
                        padding: "24px",
                        overflowY: "auto",
                        maxHeight: "85vh",
                    }}
                >
                    {/* Header row with close button */}
                    <div style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        marginBottom: "20px",
                    }}>
                        <h3 style={{
                            margin: 0,
                            fontSize: "16px",
                            fontWeight: 600,
                            color: "#e4e4e7",
                            textTransform: "capitalize" as const,
                        }}>
                            {activeTab === "ocr" ? "OCR" : activeTab === "tts" ? "Text to Speech" : activeTab}
                        </h3>
                        <button
                            onClick={onClose}
                            style={{
                                width: "28px",
                                height: "28px",
                                borderRadius: "8px",
                                border: "1px solid rgba(255,255,255,0.1)",
                                backgroundColor: "transparent",
                                color: "#6b7280",
                                cursor: "pointer",
                                fontSize: "14px",
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                                transition: "all 0.2s ease",
                            }}
                            onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = "rgba(255,255,255,0.08)"; e.currentTarget.style.color = "#e4e4e7"; }}
                            onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = "transparent"; e.currentTarget.style.color = "#6b7280"; }}
                        >
                            \u2715
                        </button>
                    </div>'''

if old_section in content:
    content = content.replace(old_section, new_section)
    print("[OK] Replaced dialog container + header")
else:
    print("[FAIL] Could not find old dialog section")

# ═══ 2. Remove the old horizontal tabs ═══
old_tabs_start = '''                {/* Tabs */}
                <div style={{ display: "flex", gap: "4px", marginBottom: "20px", padding: "4px", backgroundColor: "rgba(255,255,255,0.04)", borderRadius: "10px", border: "1px solid rgba(255, 255, 255, 0.08)" }}>'''

# Find and remove the entire old tabs block
tabs_start = content.find(old_tabs_start)
if tabs_start != -1:
    # Find the closing </div> for tabs
    tabs_end_marker = '                </div>\n'
    # Search for the closing div after tabs_start
    search_from = tabs_start + len(old_tabs_start)
    # Find ")).map" then find the closing </div> after it
    closing_div_pos = content.find('                </div>\n\n', search_from)
    if closing_div_pos != -1:
        # Remove from tabs_start to end of closing div + newline
        end_pos = closing_div_pos + len('                </div>\n\n')
        content = content[:tabs_start] + content[end_pos:]
        print("[OK] Removed old horizontal tabs")
    else:
        print("[FAIL] Could not find closing div for tabs")
else:
    print("[FAIL] Could not find old tabs block")

# ═══ 3. Fix the closing divs at the bottom ═══
# The old structure had 2 closing divs (dialog + overlay)
# New structure has 3 (content panel + sidebar wrapper + overlay)
old_closing = '''                </div>
            </div>
        </div>
    );
};'''

new_closing = '''                </div>
                </div>
            </div>
        </div>
    );
};'''

content = content.replace(old_closing, new_closing)
print("[OK] Fixed closing divs")

with open('whiteboard-app/src/components/AIToolsDialog.tsx', 'w', encoding='utf-8') as f:
    f.write(content)

print("\nDone! Sidebar layout applied.")
