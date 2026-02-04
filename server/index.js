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
// Using Stable Diffusion XL
const IMAGE_MODEL = "stabilityai/stable-diffusion-xl-base-1.0";

app.post("/api/ai/generate-image", async (req, res) => {
    try {
        const { prompt, width = 512, height = 512 } = req.body;

        if (!prompt) {
            return res.status(400).json({ error: "Prompt is required" });
        }

        if (!process.env.HF_TOKEN) {
            return res.status(500).json({ error: "HF_TOKEN not configured" });
        }

        console.log(`[AI Image] Generating image with ${IMAGE_MODEL}...`);
        console.log(`[AI Image] Prompt: "${prompt}"`);

        // Generate image using Stable Diffusion (free tier)
        const imageBlob = await hf.textToImage({
            model: IMAGE_MODEL,
            inputs: prompt,
            provider: "hf-inference",
        });

        // Convert blob to base64
        const arrayBuffer = await imageBlob.arrayBuffer();
        const base64 = Buffer.from(arrayBuffer).toString("base64");
        const dataUrl = `data:image/png;base64,${base64}`;

        console.log(`[AI Image] Successfully generated image (${base64.length} bytes)`);

        res.json({
            success: true,
            imageUrl: dataUrl,
            width: width,
            height: height,
            prompt: prompt,
        });
    } catch (error) {
        console.error("[AI Image] Error generating image:", error);
        res.status(500).json({
            error: "Failed to generate image",
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
