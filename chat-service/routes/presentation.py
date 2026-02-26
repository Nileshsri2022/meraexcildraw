"""
routes/presentation.py — AI Presentation Mode endpoints.

Provides auto-framing (spatial clustering + semantic analysis)
and speaker notes generation for the AI Presentation Mode.
"""
from __future__ import annotations

import json
import traceback
from fastapi import APIRouter
from pydantic import BaseModel, Field

from config import canvas_llm, fallback_canvas_llm

router = APIRouter(prefix="/presentation", tags=["presentation"])


# ─── Request/Response Models ─────────────────────────────────────────────────

class ElementSummary(BaseModel):
    id: str
    type: str
    x: float = 0
    y: float = 0
    width: float = 0
    height: float = 0
    text: str | None = None
    strokeColor: str | None = None
    backgroundColor: str | None = None


class AutoFrameRequest(BaseModel):
    elements: list[ElementSummary]


class FrameResult(BaseModel):
    label: str
    x: float
    y: float
    width: float
    height: float
    elementIds: list[str] = Field(default_factory=list)
    speakerNotes: str | None = None


class AutoFrameResponse(BaseModel):
    frames: list[FrameResult]


class FrameElements(BaseModel):
    label: str
    elements: list[ElementSummary]


class SpeakerNotesRequest(BaseModel):
    frames: list[FrameElements]


class SpeakerNoteItem(BaseModel):
    frameLabel: str
    speakerNotes: str


class SpeakerNotesResponse(BaseModel):
    notes: list[SpeakerNoteItem]


# ─── Helpers ─────────────────────────────────────────────────────────────────

def _get_llm():
    """Return the best available LLM."""
    return canvas_llm or fallback_canvas_llm


def _spatial_cluster(elements: list[ElementSummary], max_clusters: int = 8) -> list[list[ElementSummary]]:
    """
    Simple spatial clustering using a grid-based approach.
    Groups nearby elements into clusters for auto-framing.
    """
    if not elements:
        return []

    # Find bounding box of all elements
    all_x = [e.x for e in elements]
    all_y = [e.y for e in elements]
    all_r = [e.x + e.width for e in elements]
    all_b = [e.y + e.height for e in elements]

    min_x, max_x = min(all_x), max(all_r)
    min_y, max_y = min(all_y), max(all_b)

    total_w = max_x - min_x
    total_h = max_y - min_y

    if total_w < 200 and total_h < 200:
        # Everything is close together — one cluster
        return [elements]

    # Determine grid size based on element spread
    # Aim for clusters that form natural slide-sized regions
    slide_w = max(960, total_w / max_clusters)
    slide_h = max(540, total_h / max_clusters)

    # Assign elements to grid cells
    cells: dict[tuple[int, int], list[ElementSummary]] = {}
    for el in elements:
        cx = el.x + el.width / 2
        cy = el.y + el.height / 2
        col = int((cx - min_x) / slide_w)
        row = int((cy - min_y) / slide_h)
        key = (row, col)
        if key not in cells:
            cells[key] = []
        cells[key].append(el)

    # Sort clusters by position (top-to-bottom, left-to-right)
    sorted_keys = sorted(cells.keys())
    return [cells[k] for k in sorted_keys]


def _cluster_bounds(cluster: list[ElementSummary], padding: int = 60):
    """Compute bounding box around a cluster with padding."""
    min_x = min(e.x for e in cluster) - padding
    min_y = min(e.y for e in cluster) - padding
    max_x = max(e.x + e.width for e in cluster) + padding
    max_y = max(e.y + e.height for e in cluster) + padding

    # Enforce minimum slide dimensions
    w = max(max_x - min_x, 400)
    h = max(max_y - min_y, 300)

    return min_x, min_y, w, h


# ─── Auto-Frame Endpoint ─────────────────────────────────────────────────────

@router.post("/auto-frame", response_model=AutoFrameResponse)
async def auto_frame(req: AutoFrameRequest):
    """
    Auto-generate presentation frames from canvas elements.

    Strategy:
    1. Spatial clustering groups nearby elements
    2. AI enhances: names slides, writes optional notes, may refine groupings
    """
    elements = req.elements
    if not elements:
        return AutoFrameResponse(frames=[])

    # Step 1: Spatial clustering
    clusters = _spatial_cluster(elements)

    # Step 2: Build initial frames from clusters
    initial_frames = []
    for i, cluster in enumerate(clusters):
        x, y, w, h = _cluster_bounds(cluster)
        texts = [e.text for e in cluster if e.text]
        types = list(set(e.type for e in cluster))
        element_ids = [e.id for e in cluster]

        initial_frames.append({
            "index": i,
            "x": x,
            "y": y,
            "width": w,
            "height": h,
            "element_count": len(cluster),
            "types": types,
            "texts": texts[:5],  # Cap text previews
            "elementIds": element_ids,
        })

    # Step 3: Use AI to generate meaningful labels and optional notes
    llm = _get_llm()
    if llm:
        try:
            prompt = f"""You are analyzing a whiteboard canvas that has been spatially clustered into {len(initial_frames)} groups.
For each group, generate a concise, meaningful slide title (2-5 words) and a brief speaker note (1-2 sentences).

Groups:
{json.dumps(initial_frames, indent=2)}

Respond with ONLY a JSON array where each item has:
- "label": slide title (string)
- "speakerNotes": brief speaker note (string)

Example: [{{"label": "Project Overview", "speakerNotes": "This slide introduces the main project goals and timeline."}}]"""

            response = llm.invoke(prompt)
            content = response.content if hasattr(response, "content") else str(response)

            # Parse JSON from response
            # Try to extract JSON array from the response
            json_start = content.find("[")
            json_end = content.rfind("]") + 1
            if json_start >= 0 and json_end > json_start:
                ai_labels = json.loads(content[json_start:json_end])
            else:
                ai_labels = []

            # Merge AI labels with spatial data
            frames = []
            for i, frame_data in enumerate(initial_frames):
                label = f"Slide {i + 1}"
                notes = None
                if i < len(ai_labels):
                    label = ai_labels[i].get("label", label)
                    notes = ai_labels[i].get("speakerNotes")

                frames.append(FrameResult(
                    label=label,
                    x=frame_data["x"],
                    y=frame_data["y"],
                    width=frame_data["width"],
                    height=frame_data["height"],
                    elementIds=frame_data["elementIds"],
                    speakerNotes=notes,
                ))

            return AutoFrameResponse(frames=frames)

        except Exception as e:
            print(f"[Presentation] AI labeling failed, using defaults: {e}")
            traceback.print_exc()

    # Fallback: use default labels without AI
    frames = []
    for i, frame_data in enumerate(initial_frames):
        frames.append(FrameResult(
            label=f"Slide {i + 1}",
            x=frame_data["x"],
            y=frame_data["y"],
            width=frame_data["width"],
            height=frame_data["height"],
            elementIds=frame_data["elementIds"],
        ))

    return AutoFrameResponse(frames=frames)


# ─── Speaker Notes Endpoint ──────────────────────────────────────────────────

@router.post("/speaker-notes", response_model=SpeakerNotesResponse)
async def generate_speaker_notes(req: SpeakerNotesRequest):
    """
    Generate speaker notes for each slide frame based on its elements.
    """
    if not req.frames:
        return SpeakerNotesResponse(notes=[])

    llm = _get_llm()
    if not llm:
        # No LLM available — return generic notes
        return SpeakerNotesResponse(
            notes=[
                SpeakerNoteItem(
                    frameLabel=f.label,
                    speakerNotes=f"This slide covers: {f.label}"
                )
                for f in req.frames
            ]
        )

    # Build a rich description of each frame's contents
    frame_descriptions = []
    for frame in req.frames:
        texts = [e.text for e in frame.elements if e.text]
        types = list(set(e.type for e in frame.elements))
        desc = {
            "label": frame.label,
            "element_count": len(frame.elements),
            "element_types": types,
            "text_content": texts[:10],
        }
        frame_descriptions.append(desc)

    prompt = f"""You are a presentation coach. Generate professional speaker notes for each slide.
Each note should be 2-4 sentences that help the presenter explain the slide content naturally.

Slides:
{json.dumps(frame_descriptions, indent=2)}

Respond with ONLY a JSON array where each item has:
- "frameLabel": the slide label (string)
- "speakerNotes": the speaker notes (string, 2-4 sentences)

Be specific to the actual content shown on each slide."""

    try:
        response = llm.invoke(prompt)
        content = response.content if hasattr(response, "content") else str(response)

        json_start = content.find("[")
        json_end = content.rfind("]") + 1
        if json_start >= 0 and json_end > json_start:
            notes_data = json.loads(content[json_start:json_end])
        else:
            notes_data = []

        notes = []
        for i, frame in enumerate(req.frames):
            note_text = f"This slide covers: {frame.label}"
            if i < len(notes_data):
                note_text = notes_data[i].get("speakerNotes", note_text)
            notes.append(SpeakerNoteItem(
                frameLabel=frame.label,
                speakerNotes=note_text,
            ))

        return SpeakerNotesResponse(notes=notes)

    except Exception as e:
        print(f"[Presentation] Speaker notes generation failed: {e}")
        traceback.print_exc()
        return SpeakerNotesResponse(
            notes=[
                SpeakerNoteItem(
                    frameLabel=f.label,
                    speakerNotes=f"This slide covers: {f.label}"
                )
                for f in req.frames
            ]
        )
