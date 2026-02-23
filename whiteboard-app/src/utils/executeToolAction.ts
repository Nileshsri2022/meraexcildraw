/**
 * executeToolAction — Named tool executors for ChatPanel.
 *
 * Extracted from the 125-line inline switch/case inside ChatPanel's
 * useEffect (P2.2 — clean-code: Extract Method, reduce deep nesting).
 *
 * Each function takes the dependencies it needs explicitly rather than
 * relying on closure over the entire component scope.
 */
import { convertToExcalidrawElements } from "@excalidraw/excalidraw";
import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";
import type { ToolAction } from "../hooks/useCanvasChat";

// Return type for useAIGeneration (the parts we use)
interface AIGenActions {
    setPrompt: (prompt: string) => void;
    setStyle: (style: string) => void;
    generateDiagram: (prompt: string, style?: string) => Promise<void>;
    generateImage: (prompt: string) => Promise<void>;
    generateSketchImage: (prompt: string) => Promise<void>;
    captureCanvas: () => Promise<string | null>;
    performOcr: (prompt?: string, image?: string) => Promise<string | null>;
}

interface ToolContext {
    action: ToolAction;
    aiGen: AIGenActions;
    excalidrawAPI: ExcalidrawImperativeAPI | null;
    setToolStatus: (status: string | null) => void;
    appendAssistantMessage: (content: string) => void;
}

/** Execute diagram generation via the AI generation hook. */
async function executeDiagram({ action, aiGen, setToolStatus }: ToolContext): Promise<void> {
    setToolStatus("🧩 Generating diagram...");
    if (action.style) aiGen.setStyle(action.style);
    await aiGen.generateDiagram(action.prompt, action.style);
    setToolStatus("✅ Diagram created!");
}

/** Execute image generation via the AI generation hook. */
async function executeImage({ action, aiGen, setToolStatus }: ToolContext): Promise<void> {
    setToolStatus("🖼️ Generating image...");
    await aiGen.generateImage(action.prompt);
    setToolStatus("✅ Image created!");
}

/** Execute sketch-to-image conversion via the AI generation hook. */
async function executeSketch({ action, aiGen, setToolStatus }: ToolContext): Promise<void> {
    setToolStatus("✏️ Converting sketch...");
    await aiGen.generateSketchImage(action.prompt);
    setToolStatus("✅ Sketch converted!");
}

/** Execute OCR: capture canvas → extract text → place on canvas. */
async function executeOcr({
    action,
    aiGen,
    excalidrawAPI,
    setToolStatus,
    appendAssistantMessage,
}: ToolContext): Promise<void> {
    setToolStatus("📝 Capturing canvas for OCR...");
    const capturedImage = await aiGen.captureCanvas();
    if (!capturedImage) {
        setToolStatus("❌ No canvas content to capture");
        return;
    }

    setToolStatus("📝 Extracting text...");
    const ocrText = await aiGen.performOcr(action.prompt, capturedImage);
    if (!ocrText) {
        appendAssistantMessage(
            `❌ OCR failed — the service may be busy or timed out. Please try again.`
        );
        setToolStatus("❌ OCR failed");
        return;
    }

    // Place text on canvas inside a resizable container box
    if (excalidrawAPI) {
        try {
            placeOcrTextOnCanvas(excalidrawAPI, ocrText);
        } catch (canvasErr) {
            console.error("Failed to add OCR text to canvas:", canvasErr);
        }
    }
    setToolStatus("✅ Text added to canvas!");
}

/**
 * Place OCR text on the canvas inside a styled rectangle container.
 *
 * Positions the box to the right of existing content to avoid overlap.
 */
function placeOcrTextOnCanvas(
    api: ExcalidrawImperativeAPI,
    ocrText: string,
): void {
    const currentEls = api.getSceneElements() || [];

    // Position to the right of existing content
    let maxX = 100;
    let minY = 100;
    for (const el of currentEls) {
        if (!el.isDeleted) {
            const right = el.x + el.width;
            if (right > maxX) maxX = right;
            if (minY === 100 || el.y < minY) minY = el.y;
        }
    }

    // Word-wrap text to fit ~400px width at 16px font
    const BOX_WIDTH = 400;
    const CHARS_PER_LINE = Math.floor(BOX_WIDTH / 8.5);
    const words = ocrText.split(/\s+/);
    const lines: string[] = [];
    let currentLine = "";
    for (const word of words) {
        if (currentLine.length + word.length + 1 > CHARS_PER_LINE && currentLine) {
            lines.push(currentLine);
            currentLine = word;
        } else {
            currentLine = currentLine ? `${currentLine} ${word}` : word;
        }
    }
    if (currentLine) lines.push(currentLine);
    const wrappedText = lines.join("\n");

    // Create a rectangle container with the text as a label
    const LINE_HEIGHT = 22;
    const PADDING = 20;
    const boxHeight = Math.max(100, lines.length * LINE_HEIGHT + PADDING * 2);

    const containerElements = convertToExcalidrawElements([{
        type: "rectangle",
        x: maxX + 60,
        y: minY,
        width: BOX_WIDTH,
        height: boxHeight,
        strokeColor: "#495057",
        backgroundColor: "#ffffff",
        fillStyle: "solid",
        strokeWidth: 1,
        roundness: { type: 3 },
        label: {
            text: wrappedText,
            fontSize: 16,
            fontFamily: 1,
            textAlign: "left",
            verticalAlign: "top",
        },
    }]);

    api.updateScene({
        elements: [...currentEls, ...containerElements],
    });
    api.scrollToContent(containerElements, { fitToContent: true });
}

/**
 * Route a tool action to the appropriate executor.
 *
 * This replaces the 125-line inline switch/case in ChatPanel's useEffect.
 */
export async function executeToolAction(ctx: ToolContext): Promise<void> {
    ctx.aiGen.setPrompt(ctx.action.prompt);

    switch (ctx.action.tool) {
        case "diagram":
            await executeDiagram(ctx);
            break;
        case "image":
            await executeImage(ctx);
            break;
        case "sketch":
            await executeSketch(ctx);
            break;
        case "ocr":
            await executeOcr(ctx);
            break;
        case "tts":
            ctx.setToolStatus("🔊 TTS requested — open AI Tools > TTS tab");
            break;
        default:
            ctx.setToolStatus(null);
    }
}
