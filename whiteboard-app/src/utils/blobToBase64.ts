/**
 * Convert a Blob to a base64 string.
 *
 * Extracted from useVoiceRecorder/useVoiceCommand where it was
 * duplicated verbatim (P3.12 — code-refactoring: Duplicated Code).
 */
export async function blobToBase64(blob: Blob): Promise<string> {
    const buffer = await blob.arrayBuffer();
    return btoa(
        new Uint8Array(buffer).reduce((s, b) => s + String.fromCharCode(b), "")
    );
}
