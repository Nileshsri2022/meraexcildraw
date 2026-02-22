import express from "express";
import { createServer } from "http";
import { Server } from "socket.io";
import cors from "cors";
import dotenv from "dotenv";
import { InferenceClient } from "@huggingface/inference";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { ElevenLabsClient } from "@elevenlabs/elevenlabs-js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config({ path: join(__dirname, ".env") });

const app = express();
app.use(cors());
app.use(express.json({ limit: '50mb' })); // Increased limit for base64 images

const httpServer = createServer(app);
const io = new Server(httpServer, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"],
    },
});

// Initialize Hugging Face Inference
const hf = new InferenceClient(process.env.HF_TOKEN || "");
const MODEL = "moonshotai/Kimi-K2-Instruct";

// Track rooms and their users
const rooms = new Map();

// ==== AI Diagram Generation Endpoint ====
app.post("/api/ai/generate-diagram", async (req, res) => {
    try {
        const { prompt, style = "flowchart" } = req.body;

        if (!prompt) {
            return res.status(400).json({ error: "Prompt is required" });
        }

        if (!process.env.HF_TOKEN) {
            return res.status(500).json({ error: "HF_TOKEN not configured" });
        }

        // Create a prompt for diagram generation
        // All diagrams use Mermaid format - mindmap uses graph LR for visual difference
        const diagramType = style === "mindmap" ? "graph LR" :
            style === "flowchart" ? "graph TD" :
                style === "sequence" ? "sequenceDiagram" :
                    style === "class" ? "classDiagram" : "graph TD";

        // Get example for the specific diagram type
        const examples = {
            "graph LR": `graph LR
    Root((Main Topic)) --> A[Branch 1]
    Root --> B[Branch 2]
    Root --> C[Branch 3]
    A --> A1[Sub-topic 1]
    A --> A2[Sub-topic 2]
    B --> B1[Sub-topic 3]`,
            "graph TD": `graph TD
    A[Start] --> B[Step 1]
    B --> C{Decision}
    C -->|Yes| D[Action 1]
    C -->|No| E[Action 2]
    D --> F[End]
    E --> F`,
            "sequenceDiagram": `sequenceDiagram
    participant User
    participant Server
    participant Database
    User->>Server: Request
    Server->>Database: Query
    Database-->>Server: Response
    Server-->>User: Result`,
            "classDiagram": `classDiagram
    class User {
        +String name
        +String email
        +login()
    }
    class Order {
        +Int id
        +Date date
        +process()
    }
    User "1" --> "*" Order`
        };

        const example = examples[diagramType] || examples["graph TD"];

        const systemPrompt = `Generate ONLY valid Mermaid code. No explanations.

TYPE: ${diagramType}

EXAMPLE:
${example}

REQUEST: ${prompt}

OUTPUT (Mermaid code only):`;

        console.log(`[AI] Generating diagram with ${MODEL}...`);

        let mermaidCode = "";

        // Use chat completion (conversational task)
        const response = await hf.chatCompletion({
            model: MODEL,
            messages: [
                {
                    role: "system",
                    content: "You are a diagram expert. Generate ONLY Mermaid code, no explanations."
                },
                {
                    role: "user",
                    content: systemPrompt
                }
            ],
            max_tokens: 500,
            temperature: 0.7,
        });

        mermaidCode = response.choices[0]?.message?.content?.trim() || "";

        console.log(`[AI] Raw response:\n${mermaidCode.substring(0, 500)}`);

        // Clean up the response - remove think tags and code blocks
        let diagramCode = mermaidCode
            .replace(/<think>[\s\S]*?<\/think>/g, "")
            .replace(/```mermaid\n?/g, "")
            .replace(/```\n?/g, "")
            .trim();

        // Extract just the Mermaid code if there's extra text
        const mermaidMatch = diagramCode.match(/(graph\s+(?:TD|LR|TB|RL|BT)[\s\S]+?)(?:\n\n|$)/i) ||
            diagramCode.match(/(sequenceDiagram[\s\S]+?)(?:\n\n|$)/i) ||
            diagramCode.match(/(classDiagram[\s\S]+?)(?:\n\n|$)/i) ||
            diagramCode.match(/(flowchart\s+(?:TD|LR|TB|RL|BT)[\s\S]+?)(?:\n\n|$)/i);

        if (mermaidMatch) {
            diagramCode = mermaidMatch[1].trim();
        }

        console.log(`[AI] Generated Mermaid diagram for: "${prompt}"`);
        console.log(`[AI] Code:\n${diagramCode}`);

        // Validate that we got valid code
        if (!diagramCode || diagramCode.length < 10) {
            console.log(`[AI] Response was empty or too short, using fallback`);
            diagramCode = `graph TD
    A[${prompt}] --> B[Process]
    B --> C[Output]`;
        }

        res.json({
            success: true,
            format: "mermaid",
            code: diagramCode,
            mermaid: diagramCode,
            prompt: prompt,
        });
    } catch (error) {
        console.error("[AI] Error generating diagram:", error);
        res.status(500).json({
            error: "Failed to generate diagram",
            message: error.message,
        });
    }
});

// ==== AI Image Generation Endpoint ====
// Primary: Z-Image-Turbo (fast turbo model)
// Fallback: FLUX.1-dev (high quality, slower)
const IMAGE_SPACE = process.env.IMAGE_SPACE || "mrfakename/Z-Image-Turbo";
const FALLBACK_IMAGE_SPACE = process.env.FALLBACK_IMAGE_SPACE || "black-forest-labs/FLUX.1-dev";

/**
 * Try generating an image with Z-Image-Turbo (fast, ~9 steps).
 * Returns { imageUrl, seedUsed } or throws on failure.
 */
async function generateWithZImageTurbo(Client, prompt, width, height, steps, seed, randomizeSeed) {
    console.log(`[AI Image] Trying primary: Z-Image-Turbo...`);
    const client = await Client.connect(IMAGE_SPACE, {
        hf_token: process.env.HF_TOKEN || undefined,
    });

    const result = await client.predict("/generate_image", {
        prompt, height, width,
        num_inference_steps: steps,
        seed, randomize_seed: randomizeSeed,
    });

    const imageInfo = result.data?.[0];
    const seedUsed = result.data?.[1];
    const imageUrl = imageInfo?.url || imageInfo;

    if (!imageUrl || typeof imageUrl !== "string") {
        throw new Error("Could not extract image URL from Z-Image-Turbo result");
    }

    return { imageUrl, seedUsed };
}

/**
 * Try generating an image with FLUX.1-dev (high quality, ~28 steps).
 * Returns { imageUrl, seedUsed } or throws on failure.
 */
async function generateWithFluxDev(Client, prompt, width, height, steps, seed, randomizeSeed) {
    console.log(`[AI Image] Trying fallback: FLUX.1-dev...`);
    const client = await Client.connect(FALLBACK_IMAGE_SPACE, {
        hf_token: process.env.HF_TOKEN || undefined,
    });

    // FLUX.1-dev uses /infer endpoint with guidance_scale
    // It needs more steps for quality (28 default vs 9 for turbo)
    const fluxSteps = Math.max(steps, 28);
    const result = await client.predict("/infer", {
        prompt,
        seed,
        randomize_seed: randomizeSeed,
        width,
        height,
        guidance_scale: 3.5,
        num_inference_steps: fluxSteps,
    });

    // FLUX.1-dev returns: [dict(path, url, size, ...), seed]
    const imageInfo = result.data?.[0];
    const seedUsed = result.data?.[1];
    const imageUrl = imageInfo?.url || imageInfo?.path || imageInfo;

    if (!imageUrl || typeof imageUrl !== "string") {
        throw new Error("Could not extract image URL from FLUX.1-dev result");
    }

    return { imageUrl, seedUsed };
}

app.post("/api/ai/generate-image", async (req, res) => {
    try {
        const {
            prompt,
            width = 1024,
            height = 1024,
            num_inference_steps = 9,
            seed = 42,
            randomize_seed = true,
        } = req.body;

        if (!prompt) {
            return res.status(400).json({ error: "Prompt is required" });
        }

        console.log(`[AI Image] Prompt: "${prompt}"`);
        console.log(`[AI Image] Settings: ${width}x${height}, steps=${num_inference_steps}, seed=${seed}, randomize=${randomize_seed}`);

        const { Client } = await import("@gradio/client");

        let imageUrl, seedUsed, modelUsed;

        // Try primary model first, fall back to FLUX.1-dev on failure
        try {
            const primary = await generateWithZImageTurbo(Client, prompt, width, height, num_inference_steps, seed, randomize_seed);
            imageUrl = primary.imageUrl;
            seedUsed = primary.seedUsed;
            modelUsed = "Z-Image-Turbo";
        } catch (primaryError) {
            console.warn(`[AI Image] Primary model failed: ${primaryError.message}`);
            console.log(`[AI Image] Falling back to FLUX.1-dev...`);

            const fallback = await generateWithFluxDev(Client, prompt, width, height, num_inference_steps, seed, randomize_seed);
            imageUrl = fallback.imageUrl;
            seedUsed = fallback.seedUsed;
            modelUsed = "FLUX.1-dev";
        }

        console.log(`[AI Image] ${modelUsed} returned URL, fetching image...`);

        // Fetch the generated image and convert to base64 data URL
        const imageResponse = await fetch(imageUrl);
        if (!imageResponse.ok) {
            throw new Error(`Failed to fetch generated image: ${imageResponse.status}`);
        }

        const arrayBuffer = await imageResponse.arrayBuffer();
        const base64 = Buffer.from(arrayBuffer).toString("base64");
        const contentType = imageResponse.headers.get("content-type") || "image/png";
        const dataUrl = `data:${contentType};base64,${base64}`;

        console.log(`[AI Image] ✅ Successfully generated image via ${modelUsed} (${Math.round(base64.length / 1024)} KB)`);

        res.json({
            success: true,
            imageUrl: dataUrl,
            width: width,
            height: height,
            seed: seedUsed,
            prompt: prompt,
            model: modelUsed,
        });
    } catch (error) {
        console.error("[AI Image] All models failed:", error);
        res.status(500).json({
            error: "Failed to generate image",
            message: error.message,
        });
    }
});

// ==== ControlNet v1.1 Sketch-to-Image Endpoint ====
const CONTROLNET_SPACE = process.env.CONTROLNET_SPACE || "hysts/ControlNet-v1-1";

app.post("/api/ai/sketch-to-image", async (req, res) => {
    try {
        const {
            prompt,
            imageBase64,
            width = 512,
            height = 512,
            pipeline = "scribble",
            image_resolution = 512,
            num_steps = 20,
            guidance_scale = 9,
            seed = 0,
            preprocessor_name = "HED",
        } = req.body;

        // Validate the pipeline
        const VALID_PIPELINES = ["scribble", "canny", "softedge", "lineart", "depth", "normal", "mlsd", "segmentation"];
        const selectedPipeline = VALID_PIPELINES.includes(pipeline) ? pipeline : "scribble";

        if (!prompt) {
            return res.status(400).json({ error: "Prompt is required" });
        }

        if (!imageBase64) {
            return res.status(400).json({ error: "Sketch image is required" });
        }

        console.log(`[AI Sketch] Generating image with ControlNet /${selectedPipeline}...`);
        console.log(`[AI Sketch] Prompt: "${prompt}"`);
        console.log(`[AI Sketch] Settings: resolution=${image_resolution}, steps=${num_steps}, guidance=${guidance_scale}, seed=${seed}, preprocessor=${preprocessor_name}`);

        // Convert base64 to a Blob for the Gradio client
        const base64Data = imageBase64.replace(/^data:image\/\w+;base64,/, "");
        const buffer = Buffer.from(base64Data, "base64");
        const sketchBlob = new Blob([buffer], { type: "image/png" });

        // Connect to the ControlNet v1.1 Gradio Space
        const { Client } = await import("@gradio/client");
        const client = await Client.connect(CONTROLNET_SPACE, {
            hf_token: process.env.HF_TOKEN || undefined,
        });

        // Call the selected pipeline endpoint with all parameters
        const endpoint = `/${selectedPipeline}`;
        const result = await client.predict(endpoint, {
            image: sketchBlob,
            prompt: prompt,
            additional_prompt: "best quality, extremely detailed",
            negative_prompt: "longbody, lowres, bad anatomy, bad hands, missing fingers, extra digit, fewer digits, cropped, worst quality, low quality",
            num_images: 1,
            image_resolution: image_resolution,
            preprocess_resolution: 512,
            num_steps: num_steps,
            guidance_scale: guidance_scale,
            seed: seed,
            preprocessor_name: preprocessor_name,
        });

        // Log the full result structure so we can debug extraction
        console.log(`[AI Sketch] ControlNet returned result. data length: ${result.data?.length}`);
        for (let i = 0; i < (result.data?.length || 0); i++) {
            const item = result.data[i];
            if (Array.isArray(item)) {
                console.log(`[AI Sketch]   data[${i}]: array of ${item.length} items`);
                item.forEach((sub, j) => {
                    const url = sub?.image?.url || sub?.url || (typeof sub === 'string' ? sub : '?');
                    console.log(`[AI Sketch]     [${j}]: ${typeof sub === 'object' ? JSON.stringify(Object.keys(sub || {})) : typeof sub} → ${String(url).substring(0, 80)}`);
                });
            } else if (item && typeof item === 'object') {
                const url = item?.image?.url || item?.url || '?';
                console.log(`[AI Sketch]   data[${i}]: object keys=${JSON.stringify(Object.keys(item))} → ${String(url).substring(0, 80)}`);
            } else {
                console.log(`[AI Sketch]   data[${i}]: ${typeof item} = ${String(item).substring(0, 80)}`);
            }
        }

        // ControlNet /scribble returns:
        //   data[0] = gallery array: [preprocessed_scribble, ...generated_images]
        //   OR data[0] = gallery, data[1] = preprocessed image separately
        // We want the GENERATED image, not the preprocessed scribble.

        let imageUrl = null;

        const gallery = result.data?.[0];
        if (Array.isArray(gallery) && gallery.length > 0) {
            // Gallery with multiple items: last item(s) are generated, first is usually the preprocessed
            // Take the LAST image in the gallery (the generated result)
            const generatedItem = gallery.length > 1 ? gallery[gallery.length - 1] : gallery[0];
            imageUrl = generatedItem?.image?.url || generatedItem?.url || generatedItem;
        } else if (gallery && typeof gallery === 'object') {
            // Single gallery item (as object, not array)
            imageUrl = gallery?.image?.url || gallery?.url || gallery;
        }

        // If data[1] exists and looks like an image, it might be the generated result
        // (some Gradio spaces put the preprocessed in data[0] and generated in data[1])
        if (result.data?.length > 1) {
            const altResult = result.data[1];
            if (Array.isArray(altResult) && altResult.length > 0) {
                // data[1] is also a gallery - use its last item
                const altItem = altResult[altResult.length - 1];
                const altUrl = altItem?.image?.url || altItem?.url || altItem;
                if (altUrl && typeof altUrl === 'string' && altUrl.includes('/')) {
                    console.log(`[AI Sketch] Found alternative result in data[1]`);
                    imageUrl = altUrl;
                }
            } else if (altResult && typeof altResult === 'object') {
                const altUrl = altResult?.image?.url || altResult?.url;
                if (altUrl && typeof altUrl === 'string') {
                    console.log(`[AI Sketch] Found alternative result in data[1] (object)`);
                    imageUrl = altUrl;
                }
            }
        }

        if (!imageUrl || typeof imageUrl !== "string") {
            console.error("[AI Sketch] Could not extract image URL. Full result:", JSON.stringify(result.data));
            throw new Error("Could not extract image URL from ControlNet result");
        }

        // Fetch the generated image and convert to base64 data URL
        console.log(`[AI Sketch] Fetching generated image from: ${imageUrl.substring(0, 120)}...`);
        const imageResponse = await fetch(imageUrl);
        if (!imageResponse.ok) {
            throw new Error(`Failed to fetch generated image: ${imageResponse.status}`);
        }

        const arrayBuffer = await imageResponse.arrayBuffer();
        const base64 = Buffer.from(arrayBuffer).toString("base64");
        const contentType = imageResponse.headers.get("content-type") || "image/png";
        const dataUrl = `data:${contentType};base64,${base64}`;

        console.log(`[AI Sketch] Successfully generated image (${Math.round(base64.length / 1024)} KB)`);

        res.json({
            success: true,
            imageUrl: dataUrl,
            width: image_resolution,
            height: image_resolution,
            prompt,
        });
    } catch (error) {
        console.error("[AI Sketch] Error generating image from sketch:", error);
        res.status(500).json({
            error: "Failed to generate image from sketch",
            message: error.message,
        });
    }
});

// ==== PaddleOCR-VL OCR Endpoint ====
const PADDLEOCR_SERVER = process.env.PADDLEOCR_SERVER_URL;
const PADDLEOCR_TOKEN = process.env.PADDLEOCR_ACCESS_TOKEN;

app.post("/api/ai/ocr", async (req, res) => {
    try {
        const { imageBase64 } = req.body;

        if (!imageBase64) {
            return res.status(400).json({ error: "Image data required" });
        }

        if (!PADDLEOCR_SERVER || !PADDLEOCR_TOKEN) {
            return res.status(500).json({ error: "PaddleOCR not configured" });
        }

        console.log(`[OCR] Processing image with PaddleOCR-VL...`);

        // Remove data URL prefix if present
        const base64Data = imageBase64.replace(/^data:image\/\w+;base64,/, "");

        // Call PaddleOCR-VL API (layout-parsing endpoint)
        const response = await fetch(`${PADDLEOCR_SERVER}/layout-parsing`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `token ${PADDLEOCR_TOKEN}`,
            },
            body: JSON.stringify({
                file: base64Data,
                fileType: 1, // 1 = image
                useLayoutDetection: false,
            }),
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error(`[OCR] API Error: ${response.status} - ${errorText}`);
            throw new Error(`PaddleOCR API error: ${response.status}`);
        }

        const data = await response.json();

        console.log(`[OCR] Full Response:`);
        console.log(JSON.stringify(data, null, 2));

        // Extract text from layout-parsing response
        // Path: result.layoutParsingResults[0].markdown.text
        let text = '';

        if (data.result?.layoutParsingResults?.[0]?.markdown?.text) {
            text = data.result.layoutParsingResults[0].markdown.text;
        } else if (data.result?.layoutParsingResults?.[0]?.prunedResult?.parsing_res_list?.[0]?.block_content) {
            text = data.result.layoutParsingResults[0].prunedResult.parsing_res_list[0].block_content;
        } else if (data.result?.markdown) {
            text = data.result.markdown;
        } else {
            text = "No text could be extracted";
        }

        console.log(`[OCR] Extracted ${text.length} characters`);

        res.json({
            success: true,
            text: text,
        });
    } catch (error) {
        console.error("[OCR] Error:", error);
        res.status(500).json({
            error: "Failed to process OCR",
            message: error.message,
        });
    }
});

// ==== ElevenLabs Speech-to-Text Endpoint ====
const elevenlabs = process.env.ELEVENLABS_API_KEY
    ? new ElevenLabsClient({ apiKey: process.env.ELEVENLABS_API_KEY })
    : null;

app.post("/api/ai/speech-to-text", async (req, res) => {
    try {
        const { audioBase64 } = req.body;

        if (!audioBase64) {
            return res.status(400).json({ error: "Audio data required" });
        }

        if (!elevenlabs) {
            return res.status(500).json({ error: "ElevenLabs not configured" });
        }

        console.log(`[Speech-to-Text] Processing audio with ElevenLabs...`);

        // Remove data URL prefix if present
        const base64Data = audioBase64.replace(/^data:audio\/\w+;base64,/, "");

        // Convert base64 to Buffer and create Blob
        const audioBuffer = Buffer.from(base64Data, "base64");
        const audioBlob = new Blob([audioBuffer], { type: 'audio/webm' });

        console.log(`[Speech-to-Text] Sending ${audioBuffer.length} bytes to ElevenLabs Scribe...`);

        // Call ElevenLabs Speech-to-Text API
        const transcription = await elevenlabs.speechToText.convert({
            file: audioBlob,
            modelId: "scribe_v2",
            languageCode: "en", // English, can be changed or auto-detected
        });

        if (!transcription || !transcription.text) {
            console.log(`[Speech-to-Text] Result:`, transcription);
            return res.status(500).json({ error: "No transcription returned" });
        }

        console.log(`[Speech-to-Text] Transcribed: "${transcription.text.substring(0, 100)}..."`);

        res.json({
            success: true,
            text: transcription.text,
        });
    } catch (error) {
        console.error("[Speech-to-Text] Error:", error);
        res.status(500).json({
            error: "Failed to transcribe audio",
            message: error.message,
        });
    }
});

// ==== AI Voice Command — Intent Classification ====
app.post("/api/ai/voice-command", async (req, res) => {
    try {
        const { transcript } = req.body;

        if (!transcript || !transcript.trim()) {
            return res.status(400).json({ error: "Transcript is required" });
        }

        if (!process.env.HF_TOKEN) {
            return res.status(500).json({ error: "HF_TOKEN not configured" });
        }

        console.log(`[Voice Command] Classifying: "${transcript}"`);

        const classifyPrompt = `You are a voice command classifier for a whiteboard drawing application.

The application has these AI tools:
1. "image" — Generate an image from a text description. Use when the user wants to create, draw, generate, or make a picture/photo/illustration/image from scratch (no existing sketch needed).
2. "diagram" — Generate a diagram (flowchart, sequence, class, mindmap). Use when the user wants to create a diagram, flowchart, chart, mind map, or any structured visual.
3. "sketch" — Convert a hand-drawn sketch on the canvas into a realistic image using ControlNet. Use when the user mentions their sketch, drawing, or doodle on the canvas and wants to transform/convert/enhance it into a real image.
4. "tts" — Text to speech. Use when the user wants to hear something spoken aloud, read text, or convert text to audio.
5. "ocr" — Extract text from an image on the canvas. Use when the user wants to read, extract, or recognize text from the canvas.

Given the user's voice command, respond with ONLY a JSON object (no markdown, no explanation):
{
  "tool": "image" | "diagram" | "sketch" | "tts" | "ocr",
  "prompt": "the cleaned prompt to pass to the tool (remove command words like 'draw', 'create', 'generate', 'make')",
  "style": "flowchart" | "sequence" | "class" | "mindmap" (only if tool is "diagram", pick the best type based on the request)
}

Examples:
- "draw an apple" → {"tool":"image","prompt":"an apple"}
- "generate a picture of a sunset" → {"tool":"image","prompt":"a sunset"}
- "create a flowchart for login flow" → {"tool":"diagram","prompt":"login flow","style":"flowchart"}
- "make a sequence diagram for API calls" → {"tool":"diagram","prompt":"API calls","style":"sequence"}
- "convert my sketch to a real image of a cat" → {"tool":"sketch","prompt":"a cat"}
- "transform this drawing into a realistic house" → {"tool":"sketch","prompt":"a realistic house"}
- "turn my doodle into a landscape" → {"tool":"sketch","prompt":"a landscape"}
- "enhance my sketch" → {"tool":"sketch","prompt":"enhanced realistic version"}
- "read the text on screen" → {"tool":"ocr","prompt":""}
- "say hello world" → {"tool":"tts","prompt":"hello world"}
- "draw a class diagram for a shopping cart system" → {"tool":"diagram","prompt":"shopping cart system","style":"class"}
- "create a mind map about machine learning" → {"tool":"diagram","prompt":"machine learning","style":"mindmap"}
- "generate an image of a cyberpunk city" → {"tool":"image","prompt":"a cyberpunk city"}

IMPORTANT: Respond with ONLY the JSON, nothing else.`;

        const response = await hf.chatCompletion({
            model: MODEL,
            messages: [
                { role: "system", content: classifyPrompt },
                { role: "user", content: transcript.trim() },
            ],
            max_tokens: 200,
            temperature: 0.1,
        });

        let rawContent = response.choices[0]?.message?.content?.trim() || "";

        // Clean up — remove think tags and markdown code blocks
        rawContent = rawContent
            .replace(/<think>[\s\S]*?<\/think>/g, "")
            .replace(/```json\n?/g, "")
            .replace(/```\n?/g, "")
            .trim();

        console.log(`[Voice Command] Raw classification: ${rawContent}`);

        let classification;
        try {
            classification = JSON.parse(rawContent);
        } catch {
            console.error(`[Voice Command] Failed to parse JSON: ${rawContent}`);
            // Fallback: keyword-based classification
            const lower = transcript.toLowerCase();
            if (lower.includes("diagram") || lower.includes("flowchart") || lower.includes("chart") || lower.includes("mind map")) {
                classification = { tool: "diagram", prompt: transcript, style: "flowchart" };
            } else if (lower.includes("sketch") || lower.includes("doodle") || lower.includes("convert my drawing") || lower.includes("transform") || lower.includes("enhance my")) {
                classification = { tool: "sketch", prompt: transcript };
            } else if (lower.includes("read") || lower.includes("extract") || lower.includes("ocr") || lower.includes("recognize")) {
                classification = { tool: "ocr", prompt: "" };
            } else if (lower.includes("speak") || lower.includes("say") || lower.includes("read aloud") || lower.includes("text to speech")) {
                classification = { tool: "tts", prompt: transcript };
            } else {
                classification = { tool: "image", prompt: transcript };
            }
        }

        // Validate tool
        const validTools = ["image", "diagram", "sketch", "tts", "ocr"];
        if (!validTools.includes(classification.tool)) {
            classification.tool = "image";
        }

        console.log(`[Voice Command] Result: tool=${classification.tool}, prompt="${classification.prompt}", style=${classification.style || "n/a"}`);

        res.json({
            success: true,
            tool: classification.tool,
            prompt: classification.prompt || "",
            style: classification.style || "flowchart",
        });
    } catch (error) {
        console.error("[Voice Command] Error:", error);
        res.status(500).json({
            error: "Failed to classify voice command",
            message: error.message,
        });
    }
});

// ==== ElevenLabs Get Voices Endpoint ====
app.get("/api/ai/voices", async (req, res) => {
    try {
        if (!elevenlabs) {
            return res.status(500).json({ error: "ElevenLabs not configured" });
        }

        console.log("[Voices] Fetching available voices...");

        // Call ElevenLabs Voices API - GET /v2/voices
        const response = await elevenlabs.voices.getAll();

        // Map voices to simpler format
        const voices = response.voices.map(voice => ({
            id: voice.voiceId || voice.voice_id,
            name: voice.name,
            category: voice.category || "generated",
            labels: voice.labels || {},
        }));

        console.log(`[Voices] Found ${voices.length} voices`);

        res.json({
            success: true,
            voices: voices,
        });
    } catch (error) {
        console.error("[Voices] Error:", error);
        res.status(500).json({
            error: "Failed to fetch voices",
            message: error.message,
        });
    }
});

// ==== ElevenLabs Text-to-Speech Endpoint ====
app.post("/api/ai/text-to-speech", async (req, res) => {
    try {
        const { text, voiceId = "21m00Tcm4TlvDq8ikWAM" } = req.body; // Default: Rachel voice

        if (!text) {
            return res.status(400).json({ error: "Text is required" });
        }

        if (!elevenlabs) {
            return res.status(500).json({ error: "ElevenLabs not configured" });
        }

        console.log(`[Text-to-Speech] Converting ${text.length} chars to speech...`);

        // Call ElevenLabs TTS Streaming API
        const audioStream = await elevenlabs.textToSpeech.stream(voiceId, {
            text: text,
            modelId: "eleven_multilingual_v2",
            outputFormat: "mp3_44100_128",
        });

        // Convert stream to buffer
        const chunks = [];
        for await (const chunk of audioStream) {
            chunks.push(chunk);
        }
        const audioBuffer = Buffer.concat(chunks);

        console.log(`[Text-to-Speech] Generated ${audioBuffer.length} bytes of audio`);

        // Return as base64
        const audioBase64 = audioBuffer.toString("base64");

        res.json({
            success: true,
            audio: `data:audio/mpeg;base64,${audioBase64}`,
        });
    } catch (error) {
        console.error("[Text-to-Speech] Error:", error);
        res.status(500).json({
            error: "Failed to convert text to speech",
            message: error.message,
        });
    }
});

// ==== Collaboration Socket Events ====
io.on("connection", (socket) => {
    console.log(`[${new Date().toISOString()}] User connected: ${socket.id}`);

    // Join a room
    socket.on("join-room", (roomId) => {
        socket.join(roomId);
        socket.roomId = roomId;

        // Track users in room
        if (!rooms.has(roomId)) {
            rooms.set(roomId, new Set());
        }
        rooms.get(roomId).add(socket.id);

        // Notify all users in room about the change
        const userIds = Array.from(rooms.get(roomId));
        io.to(roomId).emit("room-user-change", userIds);

        console.log(`[${new Date().toISOString()}] User ${socket.id} joined room: ${roomId} (${userIds.length} users)`);

        // Request scene from existing users
        socket.to(roomId).emit("new-user", socket.id);
    });

    // Broadcast scene updates (reliable)
    socket.on("server-broadcast", (roomId, encryptedData, iv) => {
        socket.to(roomId).emit("client-broadcast", encryptedData, iv);
    });

    // Broadcast volatile updates (cursor positions - can be dropped)
    socket.on("server-volatile-broadcast", (roomId, encryptedData, iv) => {
        socket.volatile.to(roomId).emit("client-broadcast", encryptedData, iv);
    });

    // Handle user follow changes
    socket.on("user-follow", (payload) => {
        if (socket.roomId) {
            io.to(socket.roomId).emit("user-follow", payload);
        }
    });

    // Handle disconnect
    socket.on("disconnect", () => {
        console.log(`[${new Date().toISOString()}] User disconnected: ${socket.id}`);

        if (socket.roomId && rooms.has(socket.roomId)) {
            rooms.get(socket.roomId).delete(socket.id);

            // Notify remaining users
            const userIds = Array.from(rooms.get(socket.roomId));
            io.to(socket.roomId).emit("room-user-change", userIds);

            // Clean up empty rooms
            if (userIds.length === 0) {
                rooms.delete(socket.roomId);
                console.log(`[${new Date().toISOString()}] Room ${socket.roomId} deleted (empty)`);
            }
        }
    });
});

// Health check
app.get("/", (req, res) => {
    res.json({
        status: "ok",
        rooms: rooms.size,
        connections: io.engine.clientsCount,
        aiEnabled: !!process.env.HF_TOKEN,
        model: MODEL,
    });
});

const PORT = process.env.PORT || 3002;
httpServer.listen(PORT, () => {
    console.log(`\n🚀 Collab server running at http://localhost:${PORT}`);
    console.log(`🤖 AI enabled: ${!!process.env.HF_TOKEN}`);
    console.log(`📦 Model: ${MODEL}\n`);
});
