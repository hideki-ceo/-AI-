-- 鍵番号は、支払いと名簿が揃っていても、チェックインの1週間（7日）前より早くは送らない（予約経路を問わない）。
-- 1週間前の時点で揃っていれば当日の定期実行（/api/cron/lock-delivery）で、
-- それ以降に揃った場合は名簿の提出時・支払い確認時に送る。
-- 20261028020000 の OTA 予約だけの5週間前の制限は、これに置き換える。

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
    and (now() at time zone 'Asia/Tokyo')::date >= booking_row.check_in - 7
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
