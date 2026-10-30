-- 宿泊代金の支払い判定を月額サブスクリプションから切り離す。
--   * is_paid はゲストの宿泊代金の支払い完了を表す
--     - beds24:        Beds24 の請求項目で支払い額が請求額に達した
--     - stripe_direct: オーナー独自サイトでの予約代金が、オーナーの Stripe で支払われた
--   * 鍵番号の送信条件 = サービス利用可（無料 / 課金免除 / サブスク active）
--                        かつ 宿泊代金の支払い済み かつ 名簿 100% 提出

alter table public.bookings
  add column payment_source text check (payment_source in ('beds24', 'stripe_direct')),
  add column paid_at timestamptz;

-- これまでの is_paid は月額料金の支払いから一括設定していたため、宿泊代金の判定としては使えない。
-- 鍵番号送信前の予約はリセットし、次の Beds24 / Stripe Webhook で改めて判定する。
update public.bookings
set is_paid = false
where payment_source is null and not lock_code_sent;

-- オーナー独自サイト用の Stripe Webhook 署名シークレット（物件ごと、オーナーの Stripe アカウントで発行）
alter table public.property_secrets
  add column stripe_direct_webhook_secret text;

create or replace function public.claim_lock_delivery(p_booking_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  booking_row public.bookings%rowtype;
  allowed boolean;
begin
  select * into booking_row
  from public.bookings
  where id = p_booking_id
  for update;
  if not found then return false; end if;

  select
    (
      tenant.is_free_tier
      or profile.is_internal_free
      or property.is_exempt_from_billing
      or tenant.stripe_subscription_status = 'active'
    )
    and booking_row.is_paid
    and booking_row.is_guest_info_completed
    and (
      select count(*) = booking_row.num_guests
        and bool_and(member.is_guest_info_completed)
      from public.guest_members member
      where member.booking_id = booking_row.id
    )
    and booking_row.status not in ('cancelled', 'canceled', 'black', 'deleted')
    and not booking_row.lock_code_sent
    and (
      booking_row.lock_code_delivery_status in ('pending', 'failed')
      or (
        booking_row.lock_code_delivery_status = 'processing'
        and booking_row.updated_at < now() - interval '10 minutes'
      )
    )
  into allowed
  from public.tenants tenant
  join public.profiles profile on profile.id = tenant.id
  join public.properties property on property.id = booking_row.property_id
  where tenant.id = booking_row.tenant_id;

  if coalesce(allowed, false) then
    update public.bookings
    set lock_code_delivery_status = 'processing', lock_code_delivery_error = null
    where id = p_booking_id;
    return true;
  end if;
  return false;
end;
$$;

revoke all on function public.claim_lock_delivery(uuid) from public, anon, authenticated;
grant execute on function public.claim_lock_delivery(uuid) to service_role;
