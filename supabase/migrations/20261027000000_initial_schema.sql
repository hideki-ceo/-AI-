-- =====================================================================
-- Minpaku Report 初期スキーマ
-- spec.md §4 をベースに、以下を追加・変更している:
--   * CHECK 制約で role / reply_mode / status の値を固定
--   * 外部APIの秘密情報は property_secrets に分離（service_role のみアクセス可）
--   * Stripe 数量同期用に stripe_subscription_id / subscription_status を追加
--   * LINE Webhook の再送による二重処理防止 (line_webhook_event_id UNIQUE)
--   * RLS（オーナーは自分のデータのみ、admin は全件閲覧）
-- =====================================================================

-- ---------------------------------------------------------------------
-- 共通: updated_at 自動更新
-- ---------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------
-- 1. profiles
-- ---------------------------------------------------------------------
create table public.profiles (
  id                     uuid primary key references auth.users on delete cascade,
  email                  text not null,
  role                   text not null default 'owner' check (role in ('admin', 'owner')),
  -- true の場合 Stripe 決済・制限をバイパス（ソアリング合同会社アカウント）
  is_internal_free       boolean not null default false,
  stripe_customer_id     text unique,
  stripe_subscription_id text unique,
  -- Stripe Subscription.status をそのまま保持 ('active' | 'past_due' | 'canceled' ...)
  subscription_status    text,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now()
);

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

-- auth.users 作成時に profiles を自動作成
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, email)
  values (new.id, coalesce(new.email, ''));
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------
-- 2. properties
-- ---------------------------------------------------------------------
create table public.properties (
  id                 uuid primary key default gen_random_uuid(),
  user_id            uuid not null references public.profiles (id) on delete cascade,
  property_name      text not null,
  beds24_property_id text not null,
  reply_mode         text not null default 'approval' check (reply_mode in ('auto', 'approval')),
  -- ハウスルール・FAQ・アクセスマップ情報（AI プロンプトのコンテキスト）
  house_rules_text   text,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

create index properties_user_id_idx on public.properties (user_id);

create trigger properties_set_updated_at
  before update on public.properties
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------
-- 2b. property_secrets（1:1、サーバー側 service_role 専用）
-- ブラウザに配布される anon key から読めないよう、properties から分離。
-- ---------------------------------------------------------------------
create table public.property_secrets (
  property_id                    uuid primary key references public.properties (id) on delete cascade,
  -- Beds24 API V2: 招待コードから発行した refresh token を保存し、
  -- access token（24h 有効）はキャッシュとして保持する
  beds24_refresh_token           text not null,
  beds24_access_token            text,
  beds24_access_token_expires_at timestamptz,
  line_channel_access_token      text not null,
  line_channel_secret            text not null,
  updated_at                     timestamptz not null default now()
);

create trigger property_secrets_set_updated_at
  before update on public.property_secrets
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------
-- 3. chat_messages
-- ---------------------------------------------------------------------
create table public.chat_messages (
  id                    uuid primary key default gen_random_uuid(),
  property_id           uuid not null references public.properties (id) on delete cascade,
  line_user_id          text not null,
  -- LINE Webhook の再送対策（同一イベントを二重処理しない）
  line_webhook_event_id text unique,
  beds24_booking_id     text,
  guest_language        text,          -- 検出したゲストの言語 (例: 'en', 'zh-TW')
  incoming_message      text not null, -- ゲストからの受信文
  ai_reply_draft        text,          -- AIが作成した多言語返答案
  ai_reply_japanese     text,          -- 管理者確認用の日本語訳
  -- pending: 承認待ち / approved: 承認済み・送信待ち / sent: 送信済み
  -- rejected: 管理者が却下 / failed: AI生成または LINE 送信に失敗
  status                text not null default 'pending'
                          check (status in ('pending', 'approved', 'sent', 'rejected', 'failed')),
  error_message         text,
  approved_by           uuid references public.profiles (id) on delete set null,
  approved_at           timestamptz,
  sent_at               timestamptz,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

-- ダッシュボード一覧
create index chat_messages_property_created_idx
  on public.chat_messages (property_id, created_at desc);
-- AI に渡す会話履歴の取得
create index chat_messages_conversation_idx
  on public.chat_messages (property_id, line_user_id, created_at desc);
-- 承認待ちキュー
create index chat_messages_pending_idx
  on public.chat_messages (property_id) where status = 'pending';

create trigger chat_messages_set_updated_at
  before update on public.chat_messages
  for each row execute function public.set_updated_at();

-- =====================================================================
-- RLS
-- 書き込みの多くは Route Handler / Server Action から service_role で行う:
--   * properties の追加・削除（Stripe quantity 同期を必ず伴わせるため）
--   * chat_messages の作成（LINE Webhook）と送信処理
--   * profiles の role / is_internal_free / Stripe 項目の変更
-- =====================================================================

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles
    where id = (select auth.uid()) and role = 'admin'
  );
$$;

create or replace function public.owns_property(p_property_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.properties
    where id = p_property_id and user_id = (select auth.uid())
  );
$$;

alter table public.profiles         enable row level security;
alter table public.properties       enable row level security;
alter table public.property_secrets enable row level security;
alter table public.chat_messages    enable row level security;

-- profiles: 本人と admin のみ閲覧。更新は service_role のみ。
create policy "profiles: select own or admin"
  on public.profiles for select to authenticated
  using (id = (select auth.uid()) or public.is_admin());

-- properties: 閲覧・設定変更は本人。追加・削除は service_role のみ。
create policy "properties: select own or admin"
  on public.properties for select to authenticated
  using (user_id = (select auth.uid()) or public.is_admin());

create policy "properties: update own"
  on public.properties for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- property_secrets: ポリシーなし = anon / authenticated からは一切アクセス不可
revoke all on public.property_secrets from anon, authenticated;

-- chat_messages: 物件オーナーが閲覧・承認（下書き編集・ステータス変更）
create policy "chat_messages: select own property or admin"
  on public.chat_messages for select to authenticated
  using (public.owns_property(property_id) or public.is_admin());

create policy "chat_messages: update own property"
  on public.chat_messages for update to authenticated
  using (public.owns_property(property_id))
  with check (public.owns_property(property_id));

-- ダッシュボードで新着メッセージをリアルタイム表示する
alter publication supabase_realtime add table public.chat_messages;
