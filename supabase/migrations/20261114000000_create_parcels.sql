-- Plots saved by each signed-in person. Only the owner can read or change their rows.
-- Applied to the Supabase project "yatirix" on 2026-11-14.
create table public.parcels (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  client_id text not null,
  name text,
  data jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, client_id),
  constraint data_is_object check (jsonb_typeof(data) = 'object'),
  constraint data_size check (pg_column_size(data) < 50000)
);

comment on table public.parcels is 'Yatiri X: plots saved by each user (location, crops, soil and water answers).';

create index parcels_user_id_idx on public.parcels (user_id);

alter table public.parcels enable row level security;

create policy "Owners can read their plots" on public.parcels
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "Owners can add their plots" on public.parcels
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "Owners can update their plots" on public.parcels
  for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "Owners can delete their plots" on public.parcels
  for delete to authenticated using ((select auth.uid()) = user_id);

create or replace function public.touch_updated_at() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger parcels_touch before update on public.parcels
  for each row execute function public.touch_updated_at();

revoke all on public.parcels from anon;
grant select, insert, update, delete on public.parcels to authenticated;
