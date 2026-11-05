import { randomUUID } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { AI_DOCUMENT_MAX_BYTES, parseAiDocument } from "@/lib/ai-document";
import { authorizeProperty } from "@/lib/authorize-property";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_DOCUMENTS_PER_PROPERTY = 10;

type RouteContext = { params: Promise<{ propertyId: string }> };

async function getAuthorizedProperty(propertyId: string) {
  const authorization = await authorizeProperty(propertyId);
  if (!authorization.userId) {
    return { response: NextResponse.json({ error: "ログインしてください。" }, { status: 401 }) };
  }
  if (!authorization.property) {
    return { response: NextResponse.json({ error: "この物件を編集する権限がありません。" }, { status: 403 }) };
  }
  return { property: authorization.property };
}

export async function GET(_request: NextRequest, { params }: RouteContext) {
  const { propertyId } = await params;
  if (!UUID_RE.test(propertyId)) return NextResponse.json({ error: "物件が見つかりません。" }, { status: 404 });

  try {
    const authorization = await getAuthorizedProperty(propertyId);
    if (authorization.response) return authorization.response;
    const { data, error } = await createAdminClient()
      .from("property_ai_documents")
      .select("id, file_name, size_bytes, created_at")
      .eq("property_id", propertyId)
      .order("created_at", { ascending: true });
    if (error) {
      console.error("AI document list failed", propertyId, error);
      return NextResponse.json({ error: "アップロード資料を読み込めませんでした。" }, { status: 500 });
    }
    return NextResponse.json({ documents: data });
  } catch (error) {
    console.error("AI document authorization failed", propertyId, error);
    return NextResponse.json({ error: "物件の権限を確認できませんでした。" }, { status: 500 });
  }
}

export async function POST(request: NextRequest, { params }: RouteContext) {
  const { propertyId } = await params;
  if (!UUID_RE.test(propertyId)) return NextResponse.json({ error: "物件が見つかりません。" }, { status: 404 });

  try {
    const authorization = await getAuthorizedProperty(propertyId);
    if (authorization.response) return authorization.response;

    let form: FormData;
    try {
      form = await request.formData();
    } catch {
      return NextResponse.json({ error: "アップロードファイルを読み取れませんでした。" }, { status: 400 });
    }
    const file = form.get("file");
    if (!(file instanceof File) || !file.name) {
      return NextResponse.json({ error: "アップロードするファイルを選択してください。" }, { status: 400 });
    }
    if (file.size === 0 || file.size > AI_DOCUMENT_MAX_BYTES) {
      return NextResponse.json({ error: "ファイルは10MB以下にしてください。" }, { status: 400 });
    }

    const admin = createAdminClient();
    const { count, error: countError } = await admin
      .from("property_ai_documents")
      .select("id", { count: "exact", head: true })
      .eq("property_id", propertyId);
    if (countError) {
      console.error("AI document count failed", propertyId, countError);
      return NextResponse.json({ error: "アップロード資料数を確認できませんでした。" }, { status: 500 });
    }
    if ((count ?? 0) >= MAX_DOCUMENTS_PER_PROPERTY) {
      return NextResponse.json({ error: "1物件あたりの資料は10件までです。" }, { status: 409 });
    }

    let parsed;
    const bytes = Buffer.from(await file.arrayBuffer());
    try {
      parsed = await parseAiDocument(file.name, file.type, bytes);
    } catch (error) {
      return NextResponse.json(
        { error: error instanceof Error ? error.message : "ファイルを読み取れませんでした。" },
        { status: 400 },
      );
    }

    const safeFileName = file.name.replace(/[\\/\u0000-\u001f]/g, "_").slice(0, 200);
    const storageKey = `${propertyId}/${randomUUID()}.${parsed.extension}`;
    const { error: uploadError } = await admin.storage
      .from("property-ai-documents")
      .upload(storageKey, bytes, { contentType: parsed.contentType, upsert: false });
    if (uploadError) {
      console.error("AI document upload failed", propertyId, uploadError);
      return NextResponse.json({ error: "資料を保存できませんでした。" }, { status: 500 });
    }

    const { data, error: insertError } = await admin
      .from("property_ai_documents")
      .insert({
        property_id: propertyId,
        file_name: safeFileName,
        storage_key: storageKey,
        content_type: parsed.contentType,
        size_bytes: file.size,
        extracted_text: parsed.extractedText,
      })
      .select("id, file_name, size_bytes, created_at")
      .single();
    if (insertError) {
      const { error: cleanupError } = await admin.storage
        .from("property-ai-documents")
        .remove([storageKey]);
      if (cleanupError) console.error("AI document cleanup failed", storageKey, cleanupError);
      console.error("AI document metadata save failed", propertyId, insertError);
      return NextResponse.json({ error: "資料情報を保存できませんでした。" }, { status: 500 });
    }
    return NextResponse.json({ document: data }, { status: 201 });
  } catch (error) {
    console.error("AI document upload failed", propertyId, error);
    return NextResponse.json({ error: "資料をアップロードできませんでした。" }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest, { params }: RouteContext) {
  const { propertyId } = await params;
  if (!UUID_RE.test(propertyId)) return NextResponse.json({ error: "物件が見つかりません。" }, { status: 404 });

  try {
    const authorization = await getAuthorizedProperty(propertyId);
    if (authorization.response) return authorization.response;

    let body: { documentId?: unknown };
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "リクエストが不正です。" }, { status: 400 });
    }
    const documentId = typeof body.documentId === "string" ? body.documentId : "";
    if (!UUID_RE.test(documentId)) return NextResponse.json({ error: "資料が見つかりません。" }, { status: 404 });

    const admin = createAdminClient();
    const { data: document, error: lookupError } = await admin
      .from("property_ai_documents")
      .select("id, storage_key")
      .eq("property_id", propertyId)
      .eq("id", documentId)
      .maybeSingle();
    if (lookupError) {
      console.error("AI document lookup failed", propertyId, lookupError);
      return NextResponse.json({ error: "資料を確認できませんでした。" }, { status: 500 });
    }
    if (!document) return NextResponse.json({ error: "資料が見つかりません。" }, { status: 404 });

    const { error: removeError } = await admin.storage
      .from("property-ai-documents")
      .remove([document.storage_key]);
    if (removeError) {
      console.error("AI document storage removal failed", document.storage_key, removeError);
      return NextResponse.json({ error: "資料ファイルを削除できませんでした。" }, { status: 500 });
    }
    const { error: deleteError } = await admin
      .from("property_ai_documents")
      .delete()
      .eq("property_id", propertyId)
      .eq("id", documentId);
    if (deleteError) {
      console.error("AI document metadata deletion failed", documentId, deleteError);
      return NextResponse.json({ error: "資料情報を削除できませんでした。" }, { status: 500 });
    }
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("AI document deletion failed", propertyId, error);
    return NextResponse.json({ error: "資料を削除できませんでした。" }, { status: 500 });
  }
}
