/**
 * presentationExport — Export presentation frames as PDF or PPTX.
 *
 * Uses Excalidraw's built-in exportToBlob for high-quality rendering
 * of each frame region, then assembles into PDF (via jsPDF) or
 * PowerPoint (via pptxgenjs).
 */
import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";
import type { PresentationFrame } from "../types/presentation";

// ─── Constants ───────────────────────────────────────────────────────────────

const SLIDE_WIDTH_PX = 1920;
const SLIDE_HEIGHT_PX = 1080;

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Capture a frame region as a PNG data URL using html2canvas-based
 * screen capture of the Excalidraw canvas.
 */
async function captureFrameAsImage(
    api: ExcalidrawImperativeAPI,
    frame: PresentationFrame
): Promise<string> {
    // Approach: Zoom to the frame, then capture the visible canvas
    // We use Excalidraw's exportToBlob which renders elements to a blob
    const elements = api.getSceneElements();
    const files = api.getFiles();

    // Filter elements within the frame bounds
    const frameElements = elements.filter((el: any) => {
        if (el.isDeleted) return false;
        const cx = el.x + (el.width || 0) / 2;
        const cy = el.y + (el.height || 0) / 2;
        return (
            cx >= frame.x &&
            cx <= frame.x + frame.width &&
            cy >= frame.y &&
            cy <= frame.y + frame.height
        );
    });

    if (frameElements.length === 0) {
        // Return a blank slide
        const canvas = document.createElement("canvas");
        canvas.width = SLIDE_WIDTH_PX;
        canvas.height = SLIDE_HEIGHT_PX;
        const ctx = canvas.getContext("2d")!;
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, SLIDE_WIDTH_PX, SLIDE_HEIGHT_PX);
        ctx.fillStyle = "#999";
        ctx.font = "48px sans-serif";
        ctx.textAlign = "center";
        ctx.fillText(frame.label, SLIDE_WIDTH_PX / 2, SLIDE_HEIGHT_PX / 2);
        return canvas.toDataURL("image/png");
    }

    try {
        // Use Excalidraw's exportToBlob if available
        const { exportToBlob } = await import("@excalidraw/excalidraw");
        const blob = await exportToBlob({
            elements: frameElements,
            appState: {
                exportWithDarkMode: false,
                exportBackground: true,
                viewBackgroundColor: "#ffffff",
            } as any,
            files: files || {},
            getDimensions: () => ({
                width: SLIDE_WIDTH_PX,
                height: SLIDE_HEIGHT_PX,
                scale: 1,
            }),
        });

        return new Promise((resolve) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(reader.result as string);
            reader.readAsDataURL(blob);
        });
    } catch (err) {
        console.warn("[Export] exportToBlob failed, using fallback:", err);
        // Fallback: create a simple slide with text
        const canvas = document.createElement("canvas");
        canvas.width = SLIDE_WIDTH_PX;
        canvas.height = SLIDE_HEIGHT_PX;
        const ctx = canvas.getContext("2d")!;
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, SLIDE_WIDTH_PX, SLIDE_HEIGHT_PX);
        ctx.fillStyle = "#333";
        ctx.font = "36px sans-serif";
        ctx.textAlign = "center";
        ctx.fillText(frame.label, SLIDE_WIDTH_PX / 2, 80);

        // Draw element representations
        const texts = frameElements
            .filter((el: any) => el.text || el.originalText)
            .map((el: any) => el.text || el.originalText);

        ctx.font = "24px sans-serif";
        ctx.textAlign = "left";
        texts.forEach((text: string, i: number) => {
            const lines = text.split("\n").slice(0, 3);
            lines.forEach((line: string, j: number) => {
                ctx.fillText(line.substring(0, 80), 100, 160 + (i * 100) + (j * 30));
            });
        });

        return canvas.toDataURL("image/png");
    }
}

// ─── PDF Export ──────────────────────────────────────────────────────────────

export async function exportToPDF(
    api: ExcalidrawImperativeAPI,
    frames: PresentationFrame[]
): Promise<void> {
    const sortedFrames = [...frames].sort((a, b) => a.order - b.order);

    // Dynamically import jsPDF
    const { default: jsPDF } = await import("jspdf");
    const pdf = new jsPDF({
        orientation: "landscape",
        unit: "px",
        format: [SLIDE_WIDTH_PX, SLIDE_HEIGHT_PX],
    });

    for (let i = 0; i < sortedFrames.length; i++) {
        const frame = sortedFrames[i];

        if (i > 0) pdf.addPage();

        // Capture frame as image
        const imgDataUrl = await captureFrameAsImage(api, frame);

        // Add image to PDF page
        pdf.addImage(imgDataUrl, "PNG", 0, 0, SLIDE_WIDTH_PX, SLIDE_HEIGHT_PX);

        // Add slide label as overlay text
        pdf.setFontSize(14);
        pdf.setTextColor(150);
        pdf.text(`${i + 1}/${sortedFrames.length} — ${frame.label}`, 20, SLIDE_HEIGHT_PX - 20);
    }

    // Add speaker notes pages
    const framesWithNotes = sortedFrames.filter(f => f.speakerNotes);
    if (framesWithNotes.length > 0) {
        pdf.addPage();
        pdf.setFontSize(32);
        pdf.setTextColor(0);
        pdf.text("Speaker Notes", SLIDE_WIDTH_PX / 2, 60, { align: "center" });

        let yPos = 120;
        pdf.setFontSize(16);

        for (const frame of framesWithNotes) {
            if (yPos > SLIDE_HEIGHT_PX - 100) {
                pdf.addPage();
                yPos = 60;
            }

            pdf.setFontSize(20);
            pdf.setTextColor(50);
            pdf.text(frame.label, 40, yPos);
            yPos += 30;

            pdf.setFontSize(14);
            pdf.setTextColor(80);
            const notes = frame.speakerNotes || "";
            const lines = pdf.splitTextToSize(notes, SLIDE_WIDTH_PX - 80);
            pdf.text(lines, 40, yPos);
            yPos += lines.length * 18 + 30;
        }
    }

    pdf.save("presentation.pdf");
}

// ─── PPTX Export ─────────────────────────────────────────────────────────────

export async function exportToPPTX(
    api: ExcalidrawImperativeAPI,
    frames: PresentationFrame[]
): Promise<void> {
    const sortedFrames = [...frames].sort((a, b) => a.order - b.order);

    // Dynamically import pptxgenjs
    const PptxGenJS = (await import("pptxgenjs")).default;
    const pptx = new PptxGenJS();

    pptx.layout = "LAYOUT_WIDE"; // 13.33" x 7.5"
    pptx.title = "Whiteboard Presentation";

    for (let i = 0; i < sortedFrames.length; i++) {
        const frame = sortedFrames[i];
        const slide = pptx.addSlide();

        // Capture frame as image
        const imgDataUrl = await captureFrameAsImage(api, frame);

        // Add as background image
        slide.addImage({
            data: imgDataUrl,
            x: 0,
            y: 0,
            w: "100%",
            h: "100%",
        });

        // Add speaker notes if available
        if (frame.speakerNotes) {
            slide.addNotes(frame.speakerNotes);
        }
    }

    await pptx.writeFile({ fileName: "presentation.pptx" });
}
