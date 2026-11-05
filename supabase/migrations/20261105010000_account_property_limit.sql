create or replace function public.enforce_account_property_limit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  property_count integer;
begin
  perform pg_advisory_xact_lock(hashtext(new.tenant_id::text));
  select count(*) into property_count
  from public.properties
  where tenant_id = new.tenant_id;

  if property_count >= 5 then
    raise exception 'A maximum of 5 properties is supported'
      using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger properties_enforce_account_property_limit
  before insert on public.properties
  for each row execute function public.enforce_account_property_limit();
