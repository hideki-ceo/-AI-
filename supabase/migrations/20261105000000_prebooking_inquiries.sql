alter table public.properties
  add column prebooking_rules_text text;

create table public.property_ai_documents (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references public.properties (id) on delete cascade,
  file_name text not null,
  storage_key text not null unique,
  content_type text not null,
  size_bytes integer not null check (size_bytes between 1 and 10485760),
  extracted_text text not null,
  created_at timestamptz not null default now()
);

create index property_ai_documents_property_created_idx
  on public.property_ai_documents (property_id, created_at);

alter table public.property_ai_documents enable row level security;
revoke all on public.property_ai_documents from anon, authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'property-ai-documents',
  'property-ai-documents',
  false,
  10485760,
  array[
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'text/plain',
    'text/markdown'
  ]
)
on conflict (id) do update
set public = false,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

-- Only authenticated server routes using service_role can access these private files.
