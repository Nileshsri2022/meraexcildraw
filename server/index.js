import express from "express";
import { createServer } from "http";
import { Server } from "socket.io";
import cors from "cors";
import dotenv from "dotenv";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { aiRateLimiter } from "./lib/rateLimiter.js";
import aiRouter from "./routes/ai.js";
import { setupCollab } from "./routes/collab.js";
import { GROQ_API_KEY, GROQ_MODEL } from "./lib/aiClients.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config({ path: join(__dirname, ".env") });

// CORS: default is localhost dev origins only (never "*").
// Set ALLOWED_ORIGINS (comma-separated) to allow other origins in production.
const ALLOWED_ORIGINS = process.env.ALLOWED_ORIGINS
    ? process.env.ALLOWED_ORIGINS.split(",").map(s => s.trim())
    : ["http://localhost:3000", "http://localhost:5173"];
const corsOptions = ALLOWED_ORIGINS.includes("*")
    ? { origin: true }
    : { origin: ALLOWED_ORIGINS };

const app = express();
app.use(cors(corsOptions));
app.use(express.json({ limit: '10mb' }));

app.use("/api/ai", aiRateLimiter, aiRouter);

const httpServer = createServer(app);
const io = new Server(httpServer, {
    cors: {
        origin: ALLOWED_ORIGINS.includes("*") ? true : ALLOWED_ORIGINS,
        methods: ["GET", "POST"],
    },
});

// Track rooms and their users
const rooms = new Map();
setupCollab(io, rooms);

// Health check
app.get("/", (req, res) => {
    res.json({
        status: "ok",
        rooms: rooms.size,
        connections: io.engine.clientsCount,
        groqEnabled: !!GROQ_API_KEY,
        groqModel: GROQ_MODEL,
        hfEnabled: !!process.env.HF_TOKEN,
    });
});

const PORT = process.env.PORT || 3002;
httpServer.listen(PORT, () => {
    console.log(`\n🚀 Collab server running at http://localhost:${PORT}`);
    console.log(`🤖 Groq: ${!!GROQ_API_KEY ? GROQ_MODEL : "NOT CONFIGURED"}`);
    console.log(`🖼️ HF Spaces: ${!!process.env.HF_TOKEN ? "enabled" : "NOT CONFIGURED"}\n`);
});
