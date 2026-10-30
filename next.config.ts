import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // pdfkit は内蔵フォントのデータを実行時に node_modules から読むため、バンドルしない
  serverExternalPackages: ["pdfkit"],
  // 宿泊者名簿 PDF 用の日本語フォントをデプロイに含める
  outputFileTracingIncludes: {
    "/api/reports/guest-register": ["./assets/fonts/**"],
  },
};

export default nextConfig;
