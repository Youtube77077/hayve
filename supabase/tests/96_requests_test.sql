-- Database tests for payment requests, connected cards/banks and ride dispatch.
\set ON_ERROR_STOP on
\set QUIET on
create or replace function pg_temp.act_as(u text, aal text default 'aal1') returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', u, false);
  perform set_config('request.jwt.claim.aal', aal, false);
end $$;
create table pg_temp.r (test text, ok boolean);
grant all on pg_temp.r to authenticated, anon;

insert into auth.users values ('00000000-0000-0000-0000-0000000000d1', 'req@test'), ('00000000-0000-0000-0000-0000000000d2', 'payer@test');
insert into public.profiles (id, username, display_name) values ('00000000-0000-0000-0000-0000000000d1', 'requester', 'Rojyar Test'), ('00000000-0000-0000-0000-0000000000d2', 'payerone', 'Payer One');

insert into pg_temp.r values ('business fee is 1.2% + €0.20', public.request_business_fee(10000) = 140);
insert into pg_temp.r values ('ride commission is 15%', public.ride_hayve_cents(2000) = 300);

set role authenticated;
select pg_temp.act_as('00000000-0000-0000-0000-0000000000d1');
insert into public.pay_requests (requester_id, kind, title, amount_cents, expires_at) values ('00000000-0000-0000-0000-0000000000d1', 'personal', 'Dinner', 2500, now() + interval '14 days');
insert into pg_temp.r select 'requester creates a link with a random token', (select char_length(id) = 32 from public.pay_requests limit 1);
do $$ begin
  insert into public.pay_requests (requester_id, kind, title, amount_cents, expires_at, business) values ('00000000-0000-0000-0000-0000000000d1', 'business', 'Invoice', 2500, now() + interval '1 day', '{"invoiceNumber":"1"}');
  insert into pg_temp.r values ('business requests need a verified business', false);
exception when others then insert into pg_temp.r values ('business requests need a verified business', true); end $$;
do $$ begin
  update public.pay_requests set amount_cents = 1;
  insert into pg_temp.r values ('amount cannot change after sharing', false);
exception when others then insert into pg_temp.r values ('amount cannot change after sharing', true); end $$;
do $$ begin
  insert into public.pay_request_payments (request_id, payer_name, method, method_label, amount_cents, status) select id, 'Me', 'bank', 'ING', 2500, 'paid' from public.pay_requests limit 1;
  insert into pg_temp.r values ('nobody can write a payment directly', false);
exception when others then insert into pg_temp.r values ('nobody can write a payment directly', true); end $$;

select pg_temp.act_as('00000000-0000-0000-0000-0000000000d2');
insert into pg_temp.r select 'others cannot list requests', (select count(*) = 0 from public.pay_requests);
reset role;
select id as token from public.pay_requests limit 1 \gset
set role anon;
insert into pg_temp.r select 'anyone with the link sees the public view', (select count(*) = 1 and min(status) = 'pending' and min(requester_name) = 'Rojyar Test' from public.pay_request_public(:'token'));
insert into pg_temp.r select 'a wrong token shows nothing', (select count(*) = 0 from public.pay_request_public('not-a-real-token'));
reset role;

-- Payment by the provider closes a single-use link.
insert into public.pay_request_payments (request_id, payer_name, method, method_label, amount_cents, status) select id, 'Guest', 'bank', 'iDEAL | Wero · ING', 2500, 'paid' from public.pay_requests limit 1;
insert into pg_temp.r select 'paid single-use link shows as paid', (select status = 'paid' from public.pay_request_public((select id from public.pay_requests limit 1)));
insert into pg_temp.r select 'new profiles default to the United States in dollars', (select country = 'US' and currency = 'USD' from public.profiles where id = '00000000-0000-0000-0000-0000000000d1');
insert into pg_temp.r select 'links carry a currency', (select currency = 'USD' from public.pay_requests limit 1);
insert into pg_temp.r select 'business IDs are not limited to Dutch KVK numbers', not exists (select 1 from pg_constraint where conname = 'businesses_kvk');
insert into pg_temp.r select 'payments table has no card number column', not exists (select 1 from information_schema.columns where table_name in ('pay_request_payments', 'payment_methods') and column_name ~ '(pan|number|cvc|cvv)');

-- Ride dispatch: drivers see only rides offered to them; nobody edits fares or payouts.
insert into auth.users values ('00000000-0000-0000-0000-0000000000d3', 'driver@test');
insert into public.rides (id, rider_id, pickup, dropoff, category, price_cents, distance_km, duration_min, status, offer)
values ('00000000-0000-0000-0000-00000000aa01', '00000000-0000-0000-0000-0000000000d1', '{}', '{}', 'go', 2000, 4.2, 14, 'requested', '{"driverId":"00000000-0000-0000-0000-0000000000d2"}');
set role authenticated;
select pg_temp.act_as('00000000-0000-0000-0000-0000000000d3');
insert into pg_temp.r select 'a driver not offered the ride cannot see it', (select count(*) = 0 from public.rides);
select pg_temp.act_as('00000000-0000-0000-0000-0000000000d2');
insert into pg_temp.r select 'the offered driver sees it', (select count(*) = 1 from public.rides);
select pg_temp.act_as('00000000-0000-0000-0000-0000000000d1');
do $$ begin
  update public.rides set payout = '{"driverCents":2000,"hayveCents":0}';
exception when others then null; end $$;
do $$ begin
  update public.rides set offer = '{"driverId":"00000000-0000-0000-0000-0000000000d3"}';
exception when others then null; end $$;
reset role;
insert into pg_temp.r select 'rider cannot set the payout', (select payout is null from public.rides where id = '00000000-0000-0000-0000-00000000aa01');
insert into pg_temp.r select 'rider cannot choose the driver offer', (select offer ->> 'driverId' = '00000000-0000-0000-0000-0000000000d2' from public.rides where id = '00000000-0000-0000-0000-00000000aa01');
-- Even with an update policy, the guard rejects dispatch changes from app roles.
create policy rides_test_update on public.rides for update using (true) with check (true);
set role authenticated;
select pg_temp.act_as('00000000-0000-0000-0000-0000000000d1');
do $$ begin
  update public.rides set payout = '{"driverCents":2000,"hayveCents":0}';
  insert into pg_temp.r values ('guard blocks payout edits', false);
exception when others then insert into pg_temp.r values ('guard blocks payout edits', true); end $$;
reset role;
drop policy rides_test_update on public.rides;

-- Splits: 3 people (2 others); one pays by card, one in cash → paid. Payers never see progress.
insert into public.pay_requests (id, requester_id, kind, title, amount_cents, expires_at, split) values ('splittoken0000000000000000000001', '00000000-0000-0000-0000-0000000000d1', 'split', 'Dinner', 2500, now() + interval '72 hours', '{"people":3,"totalCents":7500,"cashPaid":0}');
insert into public.pay_request_payments (request_id, payer_name, method, method_label, amount_cents, status) values ('splittoken0000000000000000000001', 'Guest', 'card', 'Visa •••• 4242', 2500, 'paid');
insert into pg_temp.r select 'split with one of two paid is still open', (select status = 'pending' from public.pay_request_public('splittoken0000000000000000000001'));
update public.pay_requests set split = jsonb_set(split, '{cashPaid}', '1') where id = 'splittoken0000000000000000000001';
insert into pg_temp.r select 'split closes when everyone paid (incl. cash)', (select status = 'paid' and is_split from public.pay_request_public('splittoken0000000000000000000001'));

\set QUIET off
select test, case when ok then 'PASS' else 'FAIL' end as result from pg_temp.r;
do $$ begin
  if exists (select 1 from pg_temp.r where not ok) then raise exception 'Requests database tests failed'; end if;
end $$;
select 'ALL REQUESTS DATABASE TESTS PASSED' as summary;
