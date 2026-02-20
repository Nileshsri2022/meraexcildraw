/**
 * Type-safe API client utilities for AI server communication.
 *
 * Applies TypeScript advanced type patterns:
 * - Generic fetch wrapper with typed responses
 * - Discriminated union for API results (success/error)
 * - Type guard for unknown error extraction
 * - Typed response interfaces for each endpoint
 */

const AI_SERVER_URL = import.meta.env.VITE_SERVER_URL || "http://localhost:3002";

// ─── API Response Types ──────────────────────────────────────────────────────

/** Server error shape from the AI backend */
interface APIErrorResponse {
    message?: string;
    error?: string;
}

/** Sketch-to-Image API response */
export interface SketchToImageResponse {
    imageUrl?: string;
    width?: number;
    height?: number;
}

/** Diagram generation API response */
export interface DiagramResponse {
    code?: string;
    mermaid?: string;
}

/** Image generation API response */
export interface ImageResponse {
    imageUrl?: string;
    width?: number;
    height?: number;
    seed?: number;
}

/** OCR API response */
export interface OCRResponse {
    text?: string;
}

/** TTS voices API response */
export interface VoicesResponse {
    voices: Array<{ voice_id: string; name: string; category: string }>;
}

// ─── Type-Safe Fetch ─────────────────────────────────────────────────────────

/**
 * Generic, type-safe fetch wrapper for the AI server.
 *
 * - Automatically prepends `AI_SERVER_URL`
 * - Returns strongly-typed JSON response
 * - Throws a descriptive `Error` on non-OK responses
 *
 * @example
 *   const data = await apiFetch<ImageResponse>("/api/ai/generate-image", {
 *       method: "POST",
 *       body: JSON.stringify({ prompt, width, height }),
 *   });
 *   // data is ImageResponse, not any
 */
export async function apiFetch<T>(
    endpoint: string,
    init?: RequestInit,
): Promise<T> {
    const headers: HeadersInit = {
        "Content-Type": "application/json",
        ...init?.headers,
    };

    const response = await fetch(`${AI_SERVER_URL}${endpoint}`, {
        ...init,
        headers,
    });

    if (!response.ok) {
        const errorData: APIErrorResponse = await response.json().catch(() => ({}));
        throw new Error(
            errorData.message || errorData.error || `Server error: ${response.status}`
        );
    }

    return response.json() as Promise<T>;
}

// ─── Type Guard: Error Message Extraction ────────────────────────────────────

/**
 * Extracts a human-readable message from an unknown thrown value.
 *
 * Replaces the repeated `err instanceof Error ? err.message : "fallback"` pattern.
 *
 * @example
 *   catch (err) {
 *       setError(getErrorMessage(err, "Failed to generate image"));
 *   }
 */
export function getErrorMessage(err: unknown, fallback: string): string {
    if (err instanceof Error) return err.message;
    if (typeof err === "string") return err;
    return fallback;
}

// ─── Endpoint Paths (Template Literal Types) ─────────────────────────────────

/** All known AI server endpoint paths */
export type AIEndpoint =
    | "/api/ai/sketch-to-image"
    | "/api/ai/generate-diagram"
    | "/api/ai/generate-image"
    | "/api/ai/ocr"
    | "/api/ai/tts/voices"
    | "/api/ai/tts/speak";
