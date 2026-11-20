-- Database tests for Tap to Pay, the Hayve Card and Wave Back boosts.
\set ON_ERROR_STOP on
\set QUIET on
create or replace function pg_temp.act_as(u text, aal text default 'aal1') returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', u, false);
  perform set_config('request.jwt.claim.aal', aal, false);
end $$;
create table pg_temp.r (test text, ok boolean);
grant all on pg_temp.r to authenticated;

insert into auth.users values ('00000000-0000-0000-0000-0000000000e1', 'shop@test'), ('00000000-0000-0000-0000-0000000000e2', 'other@test');
insert into public.profiles (id, username, display_name) values ('00000000-0000-0000-0000-0000000000e1', 'shopkeeper', 'Shop Keeper'), ('00000000-0000-0000-0000-0000000000e2', 'otherone', 'Other One');

insert into pg_temp.r values ('receiver fee is 2.5%', public.tap_receiver_fee(2400) = 60);

set role authenticated;
select pg_temp.act_as('00000000-0000-0000-0000-0000000000e1');
insert into public.tap_payments (receiver_id, amount_cents, fee_cents, note) values ('00000000-0000-0000-0000-0000000000e1', 2400, 60, 'Concert tickets');
insert into pg_temp.r select 'receiver can create a charge', (select count(*) = 1 from public.tap_payments);
do $$ begin
  insert into public.tap_payments (receiver_id, amount_cents, fee_cents) values ('00000000-0000-0000-0000-0000000000e1', 2400, 0);
  insert into pg_temp.r values ('fee must match settings', false);
exception when others then insert into pg_temp.r values ('fee must match settings', true); end $$;
do $$ begin
  update public.tap_payments set status = 'pending' where receiver_id = '00000000-0000-0000-0000-0000000000e1';
  insert into pg_temp.r values ('receiver cannot mark paid', false);
exception when others then insert into pg_temp.r values ('receiver cannot mark paid', true); end $$;
update public.tap_payments set status = 'cancelled' where receiver_id = '00000000-0000-0000-0000-0000000000e1';
insert into pg_temp.r select 'receiver can cancel', (select status = 'cancelled' from public.tap_payments limit 1);
select pg_temp.act_as('00000000-0000-0000-0000-0000000000e2');
insert into pg_temp.r select 'others cannot see the payment', (select count(*) = 0 from public.tap_payments);

-- Cards (issued by the privileged issuer connection)
reset role;
insert into public.cards (user_id, issuer_ref, last4, exp_month, exp_year) values ('00000000-0000-0000-0000-0000000000e1', 'ic_test_1', '4417', 11, 2030);
set role authenticated;
select pg_temp.act_as('00000000-0000-0000-0000-0000000000e1');
update public.cards set status = 'frozen', blocks = '{"online":true,"contactless":false,"gambling":true}';
insert into pg_temp.r select 'owner can freeze and change controls', (select status = 'frozen' and (blocks ->> 'online')::boolean from public.cards);
do $$ begin
  update public.cards set last4 = '0000';
  insert into pg_temp.r values ('owner cannot change issuer fields', false);
exception when others then insert into pg_temp.r values ('owner cannot change issuer fields', true); end $$;
do $$ begin
  update public.cards set limits = '{"dailyCents":900000,"monthlyCents":1000}';
  insert into pg_temp.r values ('limits must be consistent', false);
exception when others then insert into pg_temp.r values ('limits must be consistent', true); end $$;
select pg_temp.act_as('00000000-0000-0000-0000-0000000000e2');
insert into pg_temp.r select 'others cannot see the card', (select count(*) = 0 from public.cards);
insert into pg_temp.r select 'no column can hold a full card number', not exists (select 1 from information_schema.columns where table_name = 'cards' and column_name ~ '(pan|number|cvc|cvv)');

-- Boosts: admins only
do $$ begin
  insert into public.wave_back_boosts (merchant, rate, ends_at, created_by) values ('Napoli Forno', 0.05, now() + interval '7 days', '00000000-0000-0000-0000-0000000000e2');
  insert into pg_temp.r values ('non-admin cannot create boosts', false);
exception when others then insert into pg_temp.r values ('non-admin cannot create boosts', true); end $$;
reset role;

\set QUIET off
select test, case when ok then 'PASS' else 'FAIL' end as result from pg_temp.r;
do $$ begin
  if exists (select 1 from pg_temp.r where not ok) then raise exception 'Payments database tests failed'; end if;
end $$;
select 'ALL PAYMENTS DATABASE TESTS PASSED' as summary;
