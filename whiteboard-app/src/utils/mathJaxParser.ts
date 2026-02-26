// Production-ready OCR → Math → Text (minimal, industry-standard)
import katex from "katex";

/**
 * Convert OCR LaTeX to readable text using KaTeX parser
 * KaTeX handles all parsing internally - no custom logic needed
 */
export function ocrMathToText(latex: string): string {
    // 1️⃣ KaTeX parses & renders math (AST handled internally)
    const html = katex.renderToString(latex, {
        throwOnError: false,
        strict: false,
    });

    // 2️⃣ DOM extraction (linearized math text)
    const container = document.createElement("div");
    container.innerHTML = html;

    // 3️⃣ Approximate readable text
    return (container.textContent || "")
        .replace(/\s+/g, " ")
        .trim();
}

/**
 * Normalize LaTeX before KaTeX (handles OCR noise)
 * MathJax would do this, but basic normalization works for most cases
 */
export function normalizeLatex(latex: string): string {
    return latex
        .replace(/\s\$\s/g, " $")  // Fix spaced delimiters
        .replace(/\$\s+/g, "$")
        .replace(/\s+\$/g, "$");
}

/**
 * Process full OCR result (may contain multiple math blocks + text)
 */
export function extractTextFromOCR(ocrResult: string): string {
    let text = normalizeLatex(ocrResult);

    // Process each math block with KaTeX
    text = text.replace(/\$\$([^$]+)\$\$/g, (_, math) => ocrMathToText(math));
    text = text.replace(/\$([^$]+)\$/g, (_, math) => ocrMathToText(math));

    return text.split('\n').map(l => l.trim()).filter(l => l).join('\n');
}

// Aliases for compatibility
export const normalizeLatexWithMathJax = normalizeLatex;
export const extractTextFromOCRWithMathJax = extractTextFromOCR;
