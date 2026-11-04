import { ImageResponse } from "next/og";
import { SITE_NAME } from "@/components/lp/site";

// 既定フォントに日本語グリフがないため、画像内の文言は英語にしている
export const alt = "Minpaku Report - Vacation rental reporting and guest registry";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          padding: "80px",
          background: "linear-gradient(135deg, #d9650f 0%, #b8520c 100%)",
          color: "white",
        }}
      >
        <div style={{ fontSize: 30, opacity: 0.8, letterSpacing: 4 }}>AI GUEST MESSAGING FOR MINPAKU</div>
        <div style={{ fontSize: 84, fontWeight: 700, marginTop: 20 }}>{SITE_NAME}</div>
        <div style={{ fontSize: 40, marginTop: 28, opacity: 0.9 }}>
          Beds24 x LINE x Gemini — 24/7 multilingual auto-replies
        </div>
      </div>
    ),
    size,
  );
}
