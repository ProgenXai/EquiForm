alter table public.user_tokens
  add column if not exists notify_updates boolean not null default false;
