import { NextResponse, type NextRequest } from "next/server";
import { authorizeProperty } from "@/lib/authorize-property";
import { loadGuestRegister } from "@/lib/guest-register";
import { renderGuestRegisterPdf } from "@/lib/guest-register-pdf";

export const runtime = "nodejs";

function csvCell(value: string | null | undefined): string {
  const safe = (value ?? "").replace(/^[=+\-@\t\r]/, "'");
  return `"${safe.replace(/"/g, '""')}"`;
}

export async function GET(request: NextRequest) {
  const propertyId = request.nextUrl.searchParams.get("propertyId") ?? "";
  const year = Number(request.nextUrl.searchParams.get("year"));
  const month = Number(request.nextUrl.searchParams.get("month"));
  const format = request.nextUrl.searchParams.get("format") ?? "csv";
  if (!/^[0-9a-f-]{36}$/i.test(propertyId) || !Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) {
    return NextResponse.json({ error: "propertyId, year and month are required" }, { status: 400 });
  }
  if (format !== "csv" && format !== "pdf") {
    return NextResponse.json({ error: "format must be csv or pdf" }, { status: 400 });
  }
  const authorization = await authorizeProperty(propertyId);
  if (!authorization.userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!authorization.property) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  let register;
  try {
    register = await loadGuestRegister(propertyId, year, month);
  } catch (error) {
    console.error("Guest register report query failed", error);
    return NextResponse.json({ error: "Unable to create guest register" }, { status: 500 });
  }
  const filename = `guest-register-${year}-${String(month).padStart(2, "0")}`;

  if (format === "pdf") {
    let pdf: Buffer;
    try {
      pdf = await renderGuestRegisterPdf(register);
    } catch (error) {
      console.error("Guest register PDF rendering failed", error);
      return NextResponse.json({ error: "Unable to render guest register PDF" }, { status: 500 });
    }
    return new NextResponse(new Uint8Array(pdf), {
      headers: {
        "Content-Type": "application/pdf",
        // inline: ブラウザで開いてそのまま印刷できるようにする
        "Content-Disposition": `inline; filename="${filename}.pdf"`,
        "Cache-Control": "private, no-store",
      },
    });
  }

  const rows = [
    ["物件名", "予約番号", "チェックイン", "チェックアウト", "氏名", "住所", "性別", "電話番号", "国籍", "パスポート番号"],
    ...register.rows.map((row) => [
      register.property.name,
      row.beds24BookingId,
      row.checkIn,
      row.checkOut,
      row.fullName,
      row.address,
      row.gender,
      row.phoneNumber,
      row.nationality,
      row.passportNumber,
    ]),
  ];
  const csv = `﻿${rows.map((row) => row.map((value) => csvCell(value)).join(",")).join("\r\n")}`;
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}.csv"`,
      "Cache-Control": "private, no-store",
    },
  });
}
