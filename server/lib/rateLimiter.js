// Dependency-free, in-memory AI rate limiter (was in server/index.js).
// 60 requests / minute / IP, applied only to /api/ai/* routes in index.js.
// ─── AI rate limiter (dependency-free, in-memory) ─────────────────────────
// Track 1 P0: 60 requests / minute / IP, applied only to /api/ai/* routes
// (all AI endpoints found in this file live under /api/ai/: generate-diagram,
// generate-image, sketch-to-image, ocr, speech-to-text, voice-command, voices,
// text-to-speech). No new npm dependency added; server/package.json untouched.
// NOTE: in-memory state resets on restart and is per-process (not shared
// across instances); sufficient for this single-process server.
const AI_RATE_LIMIT_WINDOW_MS = 60 * 1000;
const AI_RATE_LIMIT_MAX = 60;
const aiRateLimitStore = new Map(); // ip -> { count, resetTime }
function aiRateLimiter(req, res, next) {
    const ip = req.ip || req.socket?.remoteAddress || "unknown";
    const now = Date.now();
    let entry = aiRateLimitStore.get(ip);
    if (!entry || now >= entry.resetTime) {
        entry = { count: 0, resetTime: now + AI_RATE_LIMIT_WINDOW_MS };
        aiRateLimitStore.set(ip, entry);
    }
    // Opportunistic cleanup so the map cannot grow unboundedly.
    if (aiRateLimitStore.size > 10000) {
        for (const [key, value] of aiRateLimitStore) {
            if (now >= value.resetTime) aiRateLimitStore.delete(key);
        }
    }
    entry.count += 1;
    if (entry.count > AI_RATE_LIMIT_MAX) {
        const retryAfter = Math.ceil((entry.resetTime - now) / 1000);
        res.set("Retry-After", String(retryAfter));
        return res.status(429).json({
            error: "Too many AI requests. Please wait and try again.",
            retryAfterSeconds: retryAfter,
        });
    }
    next();
}

export { aiRateLimiter };
