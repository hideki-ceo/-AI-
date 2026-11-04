import "server-only";
import { readFileSync } from "node:fs";
import path from "node:path";
import PDFDocument from "pdfkit";
import type { GuestRegister } from "@/lib/guest-register";

// Noto Sans JP / KR（SIL Open Font License、assets/fonts/OFL.txt）。PDF には使った文字だけがサブセット埋め込みされる。
// JP にはハングルがないため、ハングルを含むセルだけ KR で描く（KR も仮名・漢字・ラテン文字を含む）
const FONT_DIR = path.join(process.cwd(), "assets", "fonts");
const fontCache = new Map<string, Buffer>();
function loadFont(file: string): Buffer {
  let font = fontCache.get(file);
  if (!font) {
    font = readFileSync(path.join(FONT_DIR, file));
    fontCache.set(file, font);
  }
  return font;
}

const HANGUL_RE = /[ᄀ-ᇿ㄰-㆏ꥠ-꥿가-힯ힰ-퟿]/;
function fontFor(text: string): "jp" | "kr" {
  return HANGUL_RE.test(text) ? "kr" : "jp";
}

const MARGIN = 28;
const FONT_SIZE = 8;
const CELL_PADDING = 3;
const COLUMNS: Array<{ label: string; width: number; value: (row: GuestRegister["rows"][number]) => string }> = [
  { label: "予約番号", width: 62, value: (row) => row.beds24BookingId },
  { label: "チェックイン", width: 64, value: (row) => row.checkIn },
  { label: "チェックアウト", width: 64, value: (row) => row.checkOut },
  { label: "氏名", width: 92, value: (row) => row.fullName },
  { label: "住所", width: 202, value: (row) => row.address },
  { label: "性別", width: 36, value: (row) => row.gender },
  { label: "電話番号", width: 84, value: (row) => row.phoneNumber },
  { label: "国籍", width: 72, value: (row) => row.nationality },
  { label: "旅券番号", width: 110, value: (row) => row.passportNumber ?? "" },
];

export async function renderGuestRegisterPdf(register: GuestRegister): Promise<Buffer> {
  const jpFont = loadFont("NotoSansJP-Regular.ttf");
  // 既定フォント（Helvetica）を読み込まないよう、最初から日本語フォントを指定する
  const doc = new PDFDocument({
    size: "A4",
    layout: "landscape",
    margin: MARGIN,
    font: jpFont as unknown as string,
    bufferPages: true,
    info: {
      Title: `宿泊者名簿 ${register.property.name} ${register.year}年${register.month}月`,
      Producer: "Minpaku Report",
    },
  });
  const chunks: Buffer[] = [];
  doc.on("data", (chunk: Buffer) => chunks.push(chunk));
  const finished = new Promise<Buffer>((resolve, reject) => {
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
  });

  doc.registerFont("jp", jpFont);
  doc.registerFont("kr", loadFont("NotoSansKR-Regular.ttf"));
  const bottom = doc.page.height - MARGIN - 16;
  const tableWidth = COLUMNS.reduce((sum, column) => sum + column.width, 0);

  doc.fontSize(14).text(`宿泊者名簿（${register.year}年${register.month}月チェックイン分）`, MARGIN, MARGIN);
  doc.moveDown(0.3).fontSize(9);
  doc.font(fontFor(register.property.name)).text(`物件名: ${register.property.name}`);
  if (register.property.address) doc.font(fontFor(register.property.address)).text(`所在地: ${register.property.address}`);
  doc.font("jp").text(`届出番号: ${register.property.minpakuRegistrationNo ?? "未登録"}`);
  doc.text(
    `作成日時: ${new Date().toLocaleString("ja-JP", { timeZone: "Asia/Tokyo" })}　宿泊者数: ${register.rows.length}名`,
  );
  doc.moveDown(0.6);

  function rowHeight(values: string[]): number {
    doc.fontSize(FONT_SIZE);
    const heights = values.map((value, index) =>
      doc.font(fontFor(value)).heightOfString(value || " ", { width: COLUMNS[index].width - CELL_PADDING * 2 }),
    );
    return Math.max(...heights) + CELL_PADDING * 2;
  }

  function drawRow(values: string[], y: number, height: number, header: boolean) {
    let x = MARGIN;
    if (header) doc.rect(MARGIN, y, tableWidth, height).fill("#f1f5f9").fillColor("#000000");
    doc.fontSize(FONT_SIZE).lineWidth(0.5).strokeColor("#94a3b8");
    values.forEach((value, index) => {
      const width = COLUMNS[index].width;
      doc.rect(x, y, width, height).stroke();
      doc.font(fontFor(value)).text(value, x + CELL_PADDING, y + CELL_PADDING, { width: width - CELL_PADDING * 2 });
      x += width;
    });
  }

  const headerValues = COLUMNS.map((column) => column.label);
  const headerHeight = rowHeight(headerValues);
  let y = doc.y;
  drawRow(headerValues, y, headerHeight, true);
  y += headerHeight;

  if (!register.rows.length) {
    doc.font("jp").fontSize(9).text("対象期間の宿泊者はいません。", MARGIN, y + 8);
  }
  for (const row of register.rows) {
    const values = COLUMNS.map((column) => column.value(row));
    const height = rowHeight(values);
    if (y + height > bottom) {
      doc.addPage();
      y = MARGIN;
      drawRow(headerValues, y, headerHeight, true);
      y += headerHeight;
    }
    drawRow(values, y, height, false);
    y += height;
  }

  const range = doc.bufferedPageRange();
  for (let index = 0; index < range.count; index += 1) {
    doc.switchToPage(range.start + index);
    // 下余白に書くと自動で改ページされるため、ページ番号を書く間だけ余白を外す
    doc.page.margins.bottom = 0;
    doc
      .font("jp")
      .fontSize(8)
      .fillColor("#475569")
      .text(`${index + 1} / ${range.count}`, MARGIN, doc.page.height - MARGIN - 8, {
        width: doc.page.width - MARGIN * 2,
        align: "right",
        lineBreak: false,
      });
  }
  doc.end();
  return finished;
}
