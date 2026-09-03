-- Lumen — RAG Phase 1
-- Migration: auto-create a public.profiles row for every new auth user.
--
-- Every user-owned table's FK points at public.profiles(id). Without this
-- trigger a freshly signed-up user has no profile row, so the first
-- document/session/etc. insert fails the FK. This is the standard Supabase
-- bootstrap glue for the EXISTING auth system — not a new one.
--
-- SECURITY DEFINER so the insert succeeds regardless of the calling role;
-- `search_path = ''` forces fully-qualified names inside the function.

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, display_name, email)
  values (
    new.id,
    coalesce(
      nullif(new.raw_user_meta_data ->> 'display_name', ''),
      nullif(new.raw_user_meta_data ->> 'full_name', ''),
      split_part(coalesce(new.email, 'learner'), '@', 1)
    ),
    new.email
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Backfill any auth users that predate this trigger.
insert into public.profiles (id, display_name, email)
select
  u.id,
  coalesce(
    nullif(u.raw_user_meta_data ->> 'display_name', ''),
    split_part(coalesce(u.email, 'learner'), '@', 1)
  ),
  u.email
from auth.users u
on conflict (id) do nothing;
