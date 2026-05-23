create table public.user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null unique,
  is_admin boolean default false not null,
  created_at timestamp with time zone default timezone('utc', now())
);

alter table public.user_roles enable row level security;

create policy "Users can read their own role" on public.user_roles
  for select using (auth.uid() = user_id);
