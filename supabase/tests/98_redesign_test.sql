-- Database-level tests for the redesign rules: fee tiers, admin safeguards,
-- owner admin bootstrap, wishlist link visibility and Hayve Store verification.
\set ON_ERROR_STOP on
\set QUIET on

create or replace function pg_temp.act_as(u text, aal text default 'aal1') returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', u, false);
  perform set_config('request.jwt.claim.aal', aal, false);
end $$;
create table pg_temp.r (test text, ok boolean);
grant all on pg_temp.r to authenticated;

-- Fees: tiers, and never lower for a higher price --------------------------------
insert into pg_temp.r values
  ('fee 50.00 = 2.50', public.marketplace_fee(5000) = 250),
  ('fee 50.01 = 2.50 (4% floor)', public.marketplace_fee(5001) = 250),
  ('fee 250.00 = 10.00', public.marketplace_fee(25000) = 1000),
  ('fee 260.00 = 10.00', public.marketplace_fee(26000) = 1000),
  ('fee 1000.00 = 30.00', public.marketplace_fee(100000) = 3000),
  ('fee 1200.00 = 30.00', public.marketplace_fee(120000) = 3000),
  ('fee monotonic 1..2000 euro', (select bool_and(public.marketplace_fee(p + 100) >= public.marketplace_fee(p)) from generate_series(100, 200000, 100) p));

-- Owner admin bootstrap -----------------------------------------------------------
insert into auth.users values ('00000000-0000-0000-0000-0000000000f1', 'ROJYARZAKHOLI@gmail.com'), ('00000000-0000-0000-0000-0000000000f2', 'someone@test');
insert into public.profiles (id, username, display_name) values ('00000000-0000-0000-0000-0000000000f1', 'owner', 'Owner'), ('00000000-0000-0000-0000-0000000000f2', 'someone', 'Some One');
insert into pg_temp.r select 'owner email gets admin role', exists (select 1 from public.user_roles where user_id = '00000000-0000-0000-0000-0000000000f1' and role = 'admin');
insert into pg_temp.r select 'other sign-ups do not', not exists (select 1 from public.user_roles where user_id = '00000000-0000-0000-0000-0000000000f2' and role = 'admin');

set role authenticated;
-- Admin needs a second factor -----------------------------------------------------
select pg_temp.act_as('00000000-0000-0000-0000-0000000000f1', 'aal1');
insert into pg_temp.r select 'admin without 2FA is not admin', not public.is_admin();
select pg_temp.act_as('00000000-0000-0000-0000-0000000000f1', 'aal2');
insert into pg_temp.r select 'admin with 2FA is admin', public.is_admin();

-- Only admins can add admins -----------------------------------------------------
select pg_temp.act_as('00000000-0000-0000-0000-0000000000f2', 'aal2');
do $$ begin
  insert into public.user_roles (user_id, role) values ('00000000-0000-0000-0000-0000000000f2', 'admin');
  insert into pg_temp.r values ('non-admin cannot self-grant admin', false);
exception when others then insert into pg_temp.r values ('non-admin cannot self-grant admin', true); end $$;
select pg_temp.act_as('00000000-0000-0000-0000-0000000000f1', 'aal2');
insert into public.user_roles (user_id, role) values ('00000000-0000-0000-0000-0000000000f2', 'admin');
insert into pg_temp.r select 'admin can add an admin', exists (select 1 from public.user_roles where user_id = '00000000-0000-0000-0000-0000000000f2' and role = 'admin');
delete from public.user_roles where user_id = '00000000-0000-0000-0000-0000000000f2' and role = 'admin';

-- Only admins change fees ----------------------------------------------------------
select pg_temp.act_as('00000000-0000-0000-0000-0000000000f2', 'aal2');
update public.app_settings set fee_tiers = '[{"upTo":null,"rate":0}]';
insert into pg_temp.r select 'non-admin cannot change fees', public.marketplace_fee(5000) = 250;

-- Wishlist visibility via link token ---------------------------------------------
reset role;
update public.profiles set wishlist_visibility = 'link' where username = 'recipient';
set role authenticated;
select pg_temp.act_as('00000000-0000-0000-0000-00000000000d');
insert into pg_temp.r select 'link wishlist hidden without token', (select count(*) = 0 from public.wishlist_for('recipient'));
insert into pg_temp.r select 'link wishlist visible with token', (select count(*) = 1 from public.wishlist_for('recipient', (select wishlist_token from public.profiles where username = 'recipient')));
insert into pg_temp.r select 'wrong token rejected', (select count(*) = 0 from public.wishlist_for('recipient', 'nope'));
reset role;
update public.profiles set wishlist_visibility = 'public' where username = 'recipient';

-- Hayve Store verification -----------------------------------------------------------
set role authenticated;
select pg_temp.act_as('00000000-0000-0000-0000-0000000000f2', 'aal1');
insert into public.businesses (owner_id, legal_name, trading_name, category, country, registration_number, vat_number, address, owner_id_checked)
  values ('00000000-0000-0000-0000-0000000000f2', 'Some Store B.V.', 'Some Store', 'retail', 'Netherlands', '12345678', 'NL123456789B01', '{"line1":"Damrak 1","city":"Amsterdam","postcode":"1012 LG"}', true);
insert into pg_temp.r select 'new business starts pending', (select status = 'pending' from public.businesses where owner_id = '00000000-0000-0000-0000-0000000000f2');
do $$ begin
  update public.businesses set status = 'verified' where owner_id = '00000000-0000-0000-0000-0000000000f2';
  insert into pg_temp.r values ('owner cannot self-verify', false);
exception when others then insert into pg_temp.r values ('owner cannot self-verify', true); end $$;
select pg_temp.act_as('00000000-0000-0000-0000-0000000000f1', 'aal2');
update public.businesses set status = 'rejected', rejection_reason = 'KVK number does not match the legal name' where owner_id = '00000000-0000-0000-0000-0000000000f2';
insert into pg_temp.r select 'admin can reject with reason', (select status = 'rejected' and reviewed_by = '00000000-0000-0000-0000-0000000000f1' from public.businesses where owner_id = '00000000-0000-0000-0000-0000000000f2');
select pg_temp.act_as('00000000-0000-0000-0000-0000000000f2', 'aal1');
update public.businesses set registration_number = '87654321' where owner_id = '00000000-0000-0000-0000-0000000000f2';
insert into pg_temp.r select 'resubmission goes back to pending', (select status = 'pending' and rejection_reason is null from public.businesses where owner_id = '00000000-0000-0000-0000-0000000000f2');
reset role;

\set QUIET off
select test, case when ok then 'PASS' else 'FAIL' end as result from pg_temp.r;
do $$ begin
  if exists (select 1 from pg_temp.r where not ok) then raise exception 'Redesign database tests failed'; end if;
end $$;
select 'ALL REDESIGN DATABASE TESTS PASSED' as summary;
