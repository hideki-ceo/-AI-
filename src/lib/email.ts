import "server-only";

export async function sendTransactionalEmail(input: {
  idempotencyKey: string;
  to: string;
  subject: string;
  text: string;
}) {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.LOCK_CODE_EMAIL_FROM;
  if (!apiKey || !from) throw new Error("RESEND_API_KEY and LOCK_CODE_EMAIL_FROM are required");
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "Idempotency-Key": input.idempotencyKey,
    },
    body: JSON.stringify({ from, to: [input.to], subject: input.subject, text: input.text }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) {
    throw new Error(`Transactional email delivery failed: ${response.status} ${await response.text()}`);
  }
}
