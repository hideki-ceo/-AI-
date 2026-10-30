-- Guest registry, exemption-aware billing, private passport storage and lock delivery.

create table public.tenants (
  id uuid primary key references public.profiles (id) on delete cascade,
  name text not null,
  email text not null,
  is_free_tier boolean not null default false,
  free_reason text,
  stripe_customer_id text unique,
  stripe_subscription_id text unique,
  stripe_subscription_status text,
  created_at timestamptz not null default now()
);

insert into public.tenants (id, name, email, is_free_tier, stripe_customer_id, stripe_subscription_id, stripe_subscription_status)
select id, coalesce(nullif(email, ''), 'Tenant'), email, is_internal_free,
       stripe_customer_id, stripe_subscription_id, subscription_status
from public.profiles
on conflict (id) do nothing;

create or replace function public.create_tenant_for_profile()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.tenants (id, name, email, is_free_tier)
  values (new.id, coalesce(nullif(new.email, ''), 'Tenant'), new.email, new.is_internal_free)
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger profiles_create_tenant
  after insert on public.profiles
  for each row execute function public.create_tenant_for_profile();

alter table public.properties
  add column tenant_id uuid references public.tenants (id) on delete cascade,
  add column minpaku_registration_no text,
  add column name text,
  add column address text not null default '',
  add column is_exempt_from_billing boolean not null default false,
  add column management_contract_ref text;

update public.properties
set tenant_id = user_id, name = property_name
where tenant_id is null;

alter table public.properties alter column tenant_id set not null;
alter table public.properties alter column name set not null;
create index properties_tenant_id_idx on public.properties (tenant_id);

create table public.bookings (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  property_id uuid not null references public.properties (id) on delete cascade,
  beds24_booking_id text not null,
  source text,
  guest_name text not null default '',
  guest_email text,
  guest_phone text,
  guest_line_user_id text,
  check_in date not null,
  check_out date not null,
  num_guests integer not null check (num_guests between 1 and 10),
  is_paid boolean not null default false,
  is_guest_info_completed boolean not null default false,
  lock_code_sent boolean not null default false,
  lock_code_delivery_status text not null default 'pending'
    check (lock_code_delivery_status in ('pending', 'processing', 'sent', 'failed')),
  lock_code_delivery_error text,
  status text not null default 'confirmed',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (property_id, beds24_booking_id),
  check (check_out > check_in)
);

create index bookings_tenant_checkin_idx on public.bookings (tenant_id, check_in);
create index bookings_property_checkin_idx on public.bookings (property_id, check_in);
create trigger bookings_set_updated_at
  before update on public.bookings
  for each row execute function public.set_updated_at();

create table public.guest_members (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.bookings (id) on delete cascade,
  is_representative boolean not null default false,
  full_name text not null,
  address text not null,
  gender text not null,
  phone_number text not null,
  nationality text not null,
  passport_number text,
  passport_image_key text,
  is_guest_info_completed boolean not null default false,
  created_at timestamptz not null default now()
);

create unique index guest_members_one_representative_idx
  on public.guest_members (booking_id) where is_representative;
create index guest_members_booking_idx on public.guest_members (booking_id);

create table public.lead_inquiries (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  email text not null,
  company text,
  property_count integer,
  message text,
  created_at timestamptz not null default now()
);

create table public.stripe_webhook_events (
  id text primary key,
  processed_at timestamptz not null default now()
);

alter table public.tenants enable row level security;
alter table public.bookings enable row level security;
alter table public.guest_members enable row level security;
alter table public.lead_inquiries enable row level security;

create policy "tenants: select own or admin"
  on public.tenants for select to authenticated
  using (id = (select auth.uid()) or public.is_admin());

create policy "bookings: select own property or admin"
  on public.bookings for select to authenticated
  using (tenant_id = (select auth.uid()) or public.is_admin());

create policy "guest_members: select own booking or admin"
  on public.guest_members for select to authenticated
  using (
    public.is_admin() or exists (
      select 1 from public.bookings b
      where b.id = booking_id and b.tenant_id = (select auth.uid())
    )
  );

-- Owners may edit property details, but billing exemptions are admin-controlled.
create or replace function public.guard_property_billing_exemption()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is not null
    and (new.is_exempt_from_billing is distinct from old.is_exempt_from_billing
      or new.management_contract_ref is distinct from old.management_contract_ref)
    and not public.is_admin()
  then
    raise exception 'Only an admin can change billing exemptions';
  end if;
  return new;
end;
$$;

create trigger properties_guard_billing_exemption
  before update on public.properties
  for each row execute function public.guard_property_billing_exemption();

create or replace function public.submit_guest_registry(p_booking_id uuid, p_guests jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  booking_row public.bookings%rowtype;
  guest_count integer;
begin
  select * into booking_row
  from public.bookings
  where id = p_booking_id
  for update;

  if not found then
    raise exception 'Booking not found';
  end if;
  if booking_row.lock_code_sent then
    raise exception 'Guest registry cannot be changed after lock delivery';
  end if;
  if jsonb_typeof(p_guests) <> 'array' then
    raise exception 'Guest registry must be an array';
  end if;

  guest_count := jsonb_array_length(p_guests);
  if guest_count <> booking_row.num_guests then
    raise exception 'Guest count must match the booking';
  end if;
  if guest_count < 1 or guest_count > 10 then
    raise exception 'Guest count must be between 1 and 10';
  end if;

  delete from public.guest_members where booking_id = p_booking_id;
  insert into public.guest_members (
    booking_id, is_representative, full_name, address, gender, phone_number,
    nationality, passport_number, passport_image_key, is_guest_info_completed
  )
  select
    p_booking_id,
    (guest.ordinality = 1),
    guest.full_name,
    guest.address,
    guest.gender,
    guest.phone_number,
    guest.nationality,
    nullif(guest.passport_number, ''),
    nullif(guest.passport_image_key, ''),
    true
  from jsonb_to_recordset(p_guests) with ordinality as guest(
    full_name text, address text, gender text, phone_number text,
    nationality text, passport_number text, passport_image_key text, ordinality bigint
  )
  where length(trim(coalesce(guest.full_name, ''))) > 0
    and length(trim(coalesce(guest.address, ''))) > 0
    and length(trim(coalesce(guest.gender, ''))) > 0
    and length(trim(coalesce(guest.phone_number, ''))) > 0
    and length(trim(coalesce(guest.nationality, ''))) > 0;

  get diagnostics guest_count = row_count;
  if guest_count <> booking_row.num_guests then
    raise exception 'Every guest must provide all required details';
  end if;

  update public.bookings
  set is_guest_info_completed = true,
      lock_code_delivery_status = case
        when lock_code_delivery_status = 'failed' then 'pending'
        else lock_code_delivery_status
      end,
      lock_code_delivery_error = null
  where id = p_booking_id;
end;
$$;

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
      or (booking_row.is_paid and tenant.stripe_subscription_status = 'active')
    )
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

create or replace function public.finish_lock_delivery(p_booking_id uuid, p_error text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.bookings
  set lock_code_sent = (p_error is null),
      lock_code_delivery_status = case when p_error is null then 'sent' else 'failed' end,
      lock_code_delivery_error = left(p_error, 1000)
  where id = p_booking_id and lock_code_delivery_status = 'processing';
  if not found then
    raise exception 'Lock delivery is not in progress';
  end if;
end;
$$;

revoke all on function public.submit_guest_registry(uuid, jsonb) from public, anon, authenticated;
revoke all on function public.claim_lock_delivery(uuid) from public, anon, authenticated;
revoke all on function public.finish_lock_delivery(uuid, text) from public, anon, authenticated;
grant execute on function public.submit_guest_registry(uuid, jsonb) to service_role;
grant execute on function public.claim_lock_delivery(uuid) to service_role;
grant execute on function public.finish_lock_delivery(uuid, text) to service_role;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('passports', 'passports', false, 10485760, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
set public = false,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

-- No anon/authenticated storage policies: signed upload/download URLs are issued by authorized server routes.
