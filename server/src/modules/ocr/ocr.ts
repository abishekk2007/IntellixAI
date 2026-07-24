import { recognize } from "tesseract.js";

export interface OCRProvider { extractText(image: Buffer | Uint8Array): Promise<string>; }

export class TesseractOCRProvider implements OCRProvider {
  async extractText(image: Buffer | Uint8Array) {
    const result = await recognize(Buffer.from(image), "eng", { logger: () => undefined });
    return result.data.text;
  }
}
