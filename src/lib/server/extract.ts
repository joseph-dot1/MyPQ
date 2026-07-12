// Text extraction for uploaded materials. PDF text layer via pdf-parse;
// images and scanned PDFs fall through to the OCR stub so a real OCR provider
// can be dropped in later without touching callers.

export type ExtractResult =
  | { status: "extracted"; chunks: string[] }
  | { status: "needs_ocr" }
  | { status: "failed" };

const CHUNK_TARGET = 1200; // characters per chunk

export async function extractText(buffer: Buffer, filename: string): Promise<ExtractResult> {
  const lower = filename.toLowerCase();
  if (/\.(png|jpe?g|webp|gif)$/.test(lower)) {
    return ocrStub();
  }
  if (!lower.endsWith(".pdf")) {
    // Plain text-ish files
    const text = buffer.toString("utf-8");
    if (text.trim().length < 40) return { status: "failed" };
    return { status: "extracted", chunks: chunkText(text) };
  }

  try {
    // pdf-parse's index.js runs debug code when required at module top level;
    // require the lib entry directly.
    const pdfParse = (await import("pdf-parse/lib/pdf-parse.js")).default as (
      b: Buffer
    ) => Promise<{ text: string }>;
    const parsed = await pdfParse(buffer);
    const text = (parsed.text || "").trim();
    if (text.length < 80) return ocrStub(); // likely a scan with no text layer
    return { status: "extracted", chunks: chunkText(text) };
  } catch {
    return { status: "failed" };
  }
}

// OCR stub — swap in a real provider (e.g. Google Vision) behind this
// function later; callers only see ExtractResult.
async function ocrStub(): Promise<ExtractResult> {
  return { status: "needs_ocr" };
}

export function chunkText(text: string): string[] {
  const paragraphs = text
    .split(/\n{2,}/)
    .map((p) => p.replace(/\s+/g, " ").trim())
    .filter((p) => p.length > 0);

  const chunks: string[] = [];
  let current = "";
  for (const p of paragraphs) {
    if (current && current.length + p.length > CHUNK_TARGET) {
      chunks.push(current);
      current = p;
    } else {
      current = current ? `${current}\n${p}` : p;
    }
  }
  if (current) chunks.push(current);
  return chunks;
}
