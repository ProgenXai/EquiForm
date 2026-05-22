create table if not exists public.email_captures (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  created_at timestamptz not null default now()
);

create index if not exists email_captures_created_at_idx
  on public.email_captures (created_at desc);
