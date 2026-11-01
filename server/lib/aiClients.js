import { InferenceClient } from "@huggingface/inference";

// Shared AI clients/helpers, extracted verbatim from server/index.js during
// the server split (B). No behaviour change: same env vars, same defaults,
// same function bodies. Routes import from here instead of inlining them.
const hf = new InferenceClient(process.env.HF_TOKEN || "");

// Groq API for LLM tasks (diagram generation, voice commands)
const GROQ_API_KEY = process.env.GROQ_API_KEY || "";
const GROQ_MODEL = process.env.GROQ_MODEL || "llama-3.3-70b-versatile";
const GROQ_BASE_URL = "https://api.groq.com/openai/v1";

/**
 * Call Groq's OpenAI-compatible chat completions API.
 * Returns the assistant's message content string.
 */
async function groqChat(messages, { maxTokens = 500, temperature = 0.7 } = {}) {
    const response = await fetch(`${GROQ_BASE_URL}/chat/completions`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${GROQ_API_KEY}`,
        },
        body: JSON.stringify({
            model: GROQ_MODEL,
            messages,
            max_tokens: maxTokens,
            temperature,
        }),
    });

    if (!response.ok) {
        const err = await response.text();
        throw new Error(`Groq API error ${response.status}: ${err}`);
    }

    const data = await response.json();
    return data.choices?.[0]?.message?.content?.trim() || "";
}


// Complexity keywords — if any match, the LLM gets a richer prompt + more tokens
const COMPLEX_KEYWORDS = [
    "architecture", "system design", "microservice", "infrastructure",
    "deployment", "pipeline", "ci/cd", "database schema", "network",
    "multi-tier", "distributed", "cloud", "kubernetes", "docker",
    "api gateway", "load balancer", "authentication flow", "oauth",
    "event driven", "messaging", "queue", "pub/sub", "workflow",
];

function detectComplexity(prompt) {
    const lower = prompt.toLowerCase();
    return COMPLEX_KEYWORDS.some(kw => lower.includes(kw)) || lower.length > 100;
}


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


export { hf, GROQ_API_KEY, GROQ_MODEL, GROQ_BASE_URL, groqChat, detectComplexity, generateWithZImageTurbo, generateWithFluxDev, IMAGE_SPACE, FALLBACK_IMAGE_SPACE };
