import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // pdfkit は内蔵フォントのデータを実行時に node_modules から読むため、バンドルしない
  serverExternalPackages: ["pdfkit"],
  // 宿泊者名簿 PDF 用の日本語フォントをデプロイに含める
  outputFileTracingIncludes: {
    "/api/reports/guest-register": ["./assets/fonts/**"],
  },
  async rewrites() {
    return [
      { source: "/api/admin/passports/:guestId", destination: "/api/admin/passports?guestId=:guestId" },
      { source: "/api/guest-registry/:bookingId", destination: "/api/guest-registry?bookingId=:bookingId" },
      { source: "/api/guest-registry/:bookingId/upload", destination: "/api/guest-registry/upload?bookingId=:bookingId" },
      { source: "/api/webhooks/line/:propertyId", destination: "/api/webhooks/line?propertyId=:propertyId" },
      { source: "/api/webhooks/beds24/:propertyId", destination: "/api/webhooks/beds24?propertyId=:propertyId" },
      { source: "/api/webhooks/stripe-direct/:propertyId", destination: "/api/webhooks/stripe-direct?propertyId=:propertyId" },
      { source: "/l/:propertyId/:bookingId", destination: "/l?propertyId=:propertyId&bookingId=:bookingId" },
      { source: "/guest/:bookingId", destination: "/guest?bookingId=:bookingId" },
    ];
  },
};

export default nextConfig;
