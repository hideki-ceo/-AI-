-- =====================================================================
-- LINE ゲストと Beds24 予約の紐付け
--   * 予約確認メールのリンク（/l/{property_id}/{booking_id}）から開くと、
--     予約番号入りのメッセージが入力済みの状態で LINE トークが開く
--   * リンクを使わなかったゲストには予約番号の送信を求める
--   * どちらもゲストが送った予約番号を Beds24 で照合して紐付ける
-- =====================================================================

-- oaMessage URL（https://line.me/R/oaMessage/{basic_id}/?...）に使う LINE 公式アカウントの ID (@xxxx)。
-- 秘密情報ではない。未設定なら初回アクセス時に LINE API から取得して保存する。
alter table public.properties add column line_basic_id text;

create table public.line_guests (
  id                uuid primary key default gen_random_uuid(),
  property_id       uuid not null references public.properties (id) on delete cascade,
  line_user_id      text not null,
  beds24_booking_id text,
  -- AI のコンテキスト用に Beds24 予約の一部をキャッシュ（メール・電話番号などは保存しない）
  booking_snapshot  jsonb,
  booking_synced_at timestamptz,
  linked_at         timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  unique (property_id, line_user_id)
);

create index line_guests_booking_idx on public.line_guests (property_id, beds24_booking_id);

create trigger line_guests_set_updated_at
  before update on public.line_guests
  for each row execute function public.set_updated_at();

-- 書き込みは LINE Webhook から service_role で行う
alter table public.line_guests enable row level security;

create policy "line_guests: select own property or admin"
  on public.line_guests for select to authenticated
  using (public.owns_property(property_id) or public.is_admin());
