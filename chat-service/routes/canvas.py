"""
routes/canvas.py — Canvas context, session clear, and session delete endpoints.
"""
from __future__ import annotations

from fastapi import APIRouter

from models import CanvasContextRequest, ClearRequest
from sessions import get_or_create_session, get_session, delete_session as _delete_session

router = APIRouter()


@router.post("/chat/context")
async def update_canvas_context(req: CanvasContextRequest):
    """Update the canvas context so the AI knows what's on the board.

    Builds a rich, structured description that lets the AI understand:
    - What elements exist and their types/colors
    - Where elements are spatially (top, middle, bottom areas)
    - Which elements are currently selected (for "this"/"that" references)
    - Which elements are images (for sketch/OCR operations)
    """
    session = get_or_create_session(req.session_id)

    if req.description:
        session.canvas_context = req.description
    elif req.elements:
        elements = req.elements[:50]  # Cap at 50 to bound CPU time

        # Build type counts
        type_counts: dict[str, int] = {}
        for el in elements:
            el_type = el.get("type", "unknown")
            type_counts[el_type] = type_counts.get(el_type, 0) + 1

        counts_str = ", ".join(f"{count} {t}(s)" for t, count in type_counts.items())

        # Find canvas bounds for spatial grouping
        all_y = [el.get("y", 0) for el in elements]
        min_y, max_y = min(all_y), max(all_y)
        y_range = max_y - min_y if max_y > min_y else 1
        third = y_range / 3

        # Build detailed element descriptions
        element_parts: list[str] = []
        selected_parts: list[str] = []
        image_parts: list[str] = []

        for i, el in enumerate(elements):
            el_type = el.get("type", "unknown")
            text = el.get("text", "").strip()
            x, y = el.get("x", 0), el.get("y", 0)
            w, h = el.get("width", 0), el.get("height", 0)
            stroke = el.get("strokeColor", "")
            bg = el.get("backgroundColor", "")
            is_selected = el.get("isSelected", False)
            file_id = el.get("fileId")

            # Spatial position
            rel_y = y - min_y
            if rel_y < third:
                position = "top area"
            elif rel_y < 2 * third:
                position = "middle area"
            else:
                position = "bottom area"

            # Color description
            color_desc = ""
            if bg and bg != "transparent":
                color_desc = f", bg={bg}"
            elif stroke and stroke != "#1e1e1e" and stroke != "transparent":
                color_desc = f", color={stroke}"

            # Build element line
            desc = f"  [{i+1}] {el_type}"
            if text:
                desc += f' "{text[:60]}"'
            desc += f" — {position} ({x},{y} {w}x{h}){color_desc}"
            if is_selected:
                desc += " ★SELECTED"

            element_parts.append(desc)

            # Track selected elements
            if is_selected:
                sel_desc = f"{el_type}"
                if text:
                    sel_desc += f' "{text[:40]}"'
                sel_desc += f" at {position}"
                if color_desc:
                    sel_desc += color_desc
                selected_parts.append(sel_desc)

            # Track images
            if el_type == "image" or file_id:
                img_desc = f"Image at {position} ({w}x{h})"
                if is_selected:
                    img_desc += " ★SELECTED"
                image_parts.append(img_desc)

        # Compose the full context
        ctx_lines = [
            f"The whiteboard has {len(req.elements)} element(s): {counts_str}.",
            "",
            "Elements on canvas:",
            *element_parts,
        ]

        if selected_parts:
            ctx_lines.extend([
                "",
                f"★ Currently SELECTED by the user: {', '.join(selected_parts)}",
                "(When the user says 'this', 'that', 'it', they likely mean the selected element(s).)",
            ])

        if image_parts:
            ctx_lines.extend([
                "",
                f"Images on canvas: {'; '.join(image_parts)}",
                "(These can be used for OCR or sketch-to-image operations.)",
            ])

        session.canvas_context = "\n".join(ctx_lines)
    else:
        session.canvas_context = "The whiteboard is currently completely empty."

    return {"status": "ok", "context_length": len(session.canvas_context)}


@router.post("/chat/clear")
async def clear_session(req: ClearRequest):
    """Clear conversation history and canvas context for a session."""
    session = get_session(req.session_id)
    if session:
        session.messages = []
        session.canvas_context = "The whiteboard is currently completely empty."
        return {"status": "ok", "message": "Session cleared"}
    return {"status": "ok", "message": "Session not found (already clean)"}


@router.delete("/chat/session/{session_id}")
async def delete_session_endpoint(session_id: str):
    """Delete an entire session."""
    _delete_session(session_id)
    return {"status": "ok"}
