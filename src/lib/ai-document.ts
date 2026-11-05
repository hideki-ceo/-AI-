import "server-only";
import mammoth from "mammoth";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";

export const AI_DOCUMENT_MAX_BYTES = 10 * 1024 * 1024;
export const AI_DOCUMENT_MAX_TEXT_LENGTH = 30_000;

const FILE_TYPES = {
  ".pdf": { contentType: "application/pdf", acceptedTypes: ["application/pdf"] },
  ".docx": {
    contentType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    acceptedTypes: ["application/vnd.openxmlformats-officedocument.wordprocessingml.document"],
  },
  ".txt": { contentType: "text/plain", acceptedTypes: ["text/plain"] },
  ".md": { contentType: "text/markdown", acceptedTypes: ["text/markdown", "text/plain"] },
} as const;

export type ParsedAiDocument = {
  contentType: string;
  extension: string;
  extractedText: string;
};

function normalizeText(text: string): string {
  return text.replace(/\u0000/g, "").replace(/\r\n?/g, "\n").trim();
}

export async function parseAiDocument(
  fileName: string,
  declaredContentType: string,
  bytes: Buffer,
): Promise<ParsedAiDocument> {
  const extension = fileName.slice(fileName.lastIndexOf(".")).toLowerCase();
  const type = FILE_TYPES[extension as keyof typeof FILE_TYPES];
  if (!type) throw new Error("PDF、DOCX、TXT、Markdown形式のファイルを選択してください。");
  if (
    declaredContentType &&
    declaredContentType !== "application/octet-stream" &&
    !type.acceptedTypes.some((acceptedType) => acceptedType === declaredContentType)
  ) {
    throw new Error("ファイル形式とContent-Typeが一致しません。");
  }
  if (bytes.length === 0 || bytes.length > AI_DOCUMENT_MAX_BYTES) {
    throw new Error("ファイルは10MB以下にしてください。");
  }

  let extractedText = "";
  if (extension === ".pdf") {
    if (!bytes.subarray(0, 5).equals(Buffer.from("%PDF-"))) {
      throw new Error("有効なPDFファイルを選択してください。");
    }
    const pdf = await getDocument({
      data: new Uint8Array(bytes),
      isEvalSupported: false,
      useSystemFonts: true,
    }).promise;
    if (pdf.numPages > 100) {
      await pdf.destroy();
      throw new Error("PDFは100ページ以内にしてください。");
    }
    const pages: string[] = [];
    try {
      for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
        const page = await pdf.getPage(pageNumber);
        const content = await page.getTextContent();
        pages.push(content.items.map((item) => ("str" in item ? item.str : "")).join(" "));
        if (pages.join("\n").length > AI_DOCUMENT_MAX_TEXT_LENGTH) {
          throw new Error("抽出後の文章が長すぎます。資料を分割してください。");
        }
      }
    } finally {
      await pdf.destroy();
    }
    extractedText = pages.join("\n");
  } else if (extension === ".docx") {
    const result = await mammoth.extractRawText({ buffer: bytes });
    extractedText = result.value;
  } else {
    try {
      extractedText = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    } catch {
      throw new Error("TXT/MarkdownファイルはUTF-8形式にしてください。");
    }
  }

  extractedText = normalizeText(extractedText);
  if (!extractedText) {
    throw new Error("ファイルから文字を読み取れませんでした。スキャン画像のみのPDFは対応していません。");
  }
  if (extractedText.length > AI_DOCUMENT_MAX_TEXT_LENGTH) {
    throw new Error("抽出後の文章が30,000文字を超えています。資料を分割してください。");
  }

  return { contentType: type.contentType, extension: extension.slice(1), extractedText };
}
