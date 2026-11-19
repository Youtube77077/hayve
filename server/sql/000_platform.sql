-- Platform layer for running the Hayve schema on DigitalOcean Managed PostgreSQL
-- (instead of Supabase). Provides the same auth.uid() contract the migrations use.
-- Applied once, before supabase/migrations/*.sql, by `npm run migrate`.
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
end $$;
-- The API's login role must be able to switch into these roles per transaction.
grant anon, authenticated to current_user;

create schema if not exists auth;
create table if not exists auth.users (
  id uuid primary key default gen_random_uuid(),
  email text not null unique check (email = lower(email)),
  -- argon2id hash produced by the API. Never a plain password.
  password_hash text,
  email_verified_at timestamptz,
  totp_secret text,
  totp_pending_secret text,
  totp_enabled_at timestamptz,
  session_version integer not null default 1,
  failed_logins integer not null default 0,
  locked_until timestamptz,
  deleted_at timestamptz,
  created_at timestamptz not null default now()
);
create table if not exists auth.email_tokens (
  token_hash text primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  purpose text not null check (purpose in ('verify_email', 'reset_password')),
  expires_at timestamptz not null,
  used_at timestamptz
);
create or replace function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;
revoke all on all tables in schema auth from anon, authenticated;
grant usage on schema auth to anon, authenticated;
grant execute on function auth.uid() to anon, authenticated;
