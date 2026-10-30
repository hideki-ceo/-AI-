// Node.js 22 未満にはグローバルの WebSocket がなく、supabase-js（realtime-js）がクライアント作成時に例外を投げる。
// CLI スクリプトの先頭で import して ws で補う（Next.js のアプリ本体では不要）
import WebSocket from "ws";

if (typeof globalThis.WebSocket === "undefined") {
  globalThis.WebSocket = WebSocket as unknown as typeof globalThis.WebSocket;
}
