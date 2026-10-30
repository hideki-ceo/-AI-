import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";

// Stripe-Signature ヘッダー（t=...,v1=...）を検証する。5分より古いイベントは再送攻撃とみなして拒否する
export function verifyStripeSignature(
  payload: string,
  signatureHeader: string | null,
  secret: string | null | undefined,
): boolean {
  if (!secret || !signatureHeader) return false;
  const parts = signatureHeader.split(",").map((part) => part.split("=", 2));
  const timestamp = parts.find(([key]) => key === "t")?.[1];
  if (!timestamp || Math.abs(Date.now() / 1000 - Number(timestamp)) > 300) return false;
  const expected = createHmac("sha256", secret).update(`${timestamp}.${payload}`).digest();
  return parts
    .filter(([key]) => key === "v1")
    .some(([, value]) => {
      if (!value || !/^[0-9a-f]{64}$/i.test(value)) return false;
      const actual = Buffer.from(value, "hex");
      return actual.length === expected.length && timingSafeEqual(actual, expected);
    });
}

export type StripeEvent = {
  id: string;
  type: string;
  data: { object: Record<string, unknown> };
};

export function parseStripeEvent(rawBody: string): StripeEvent | null {
  try {
    const event = JSON.parse(rawBody) as StripeEvent;
    if (!event.id || !event.type || typeof event.data?.object !== "object" || event.data.object === null) {
      return null;
    }
    return event;
  } catch {
    return null;
  }
}
