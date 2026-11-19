-- Database-level tests for anonymous wishlist gifting.
\set ON_ERROR_STOP on
\set QUIET on

-- Fixtures (as superuser) ---------------------------------------------------
insert into auth.users values
  ('00000000-0000-0000-0000-00000000000a', 'purchaser@test'),
  ('00000000-0000-0000-0000-00000000000b', 'recipient@test'),
  ('00000000-0000-0000-0000-00000000000c', 'seller@test'),
  ('00000000-0000-0000-0000-00000000000d', 'visitor@test');
insert into public.profiles (id, username, display_name) values
  ('00000000-0000-0000-0000-00000000000a', 'purchaser', 'Pat Purchaser'),
  ('00000000-0000-0000-0000-00000000000b', 'recipient', 'Rae Recipient'),
  ('00000000-0000-0000-0000-00000000000c', 'seller', 'Sol Seller'),
  ('00000000-0000-0000-0000-00000000000d', 'visitor', 'Vic Visitor');
insert into public.ledger_accounts (owner_id, kind, label) select id, 'user', 'wallet' from auth.users;
-- Seed the purchaser's wallet with €100 from the simulated bank.
with tx as (
  insert into public.transactions (type, status, amount_cents, from_account, to_account, label_for_from, label_for_to, method)
  select 'deposit', 'completed', 10000, (select id from ledger_accounts where code = 'bank'), (select id from ledger_accounts where owner_id = '00000000-0000-0000-0000-00000000000a'), 'Top-up', 'Bank', 'bank'
  returning id, from_account, to_account
)
insert into public.ledger_entries (tx_id, account_id, amount_cents, status)
select id, from_account, -10000, 'posted'::public.entry_status from tx union all select id, to_account, 10000, 'posted'::public.entry_status from tx;
insert into public.addresses (user_id, full_name, line1, city, postcode, is_default)
  values ('00000000-0000-0000-0000-00000000000b', 'Rae Recipient', 'Secret Street 1', 'Amsterdam', '1000 AA', true);
insert into public.products (id, seller_id, title, description, price_cents, category, condition, images)
  values ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000000c', 'Film camera', 'A lovely 35mm camera', 5000, 'electronics', 'good', '{x}'),
         ('10000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-00000000000c', 'Not wished for', 'Arbitrary product', 2000, 'home', 'good', '{x}');
insert into public.wishlist_items (id, owner_id, product_id) values ('20000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000000b', '10000000-0000-0000-0000-000000000001');

create or replace function pg_temp.act_as(u text) returns void language plpgsql as $$
begin perform set_config('request.jwt.claim.sub', u, false); end $$;
create table pg_temp.results (test text, ok boolean);
grant all on pg_temp.results to authenticated;

-- 1. Purchaser reserves and pays ----------------------------------------------
set role authenticated;
select pg_temp.act_as('00000000-0000-0000-0000-00000000000a');
create temp table r1 as select * from public.reserve_wishlist_gift('20000000-0000-0000-0000-000000000001');

-- 2. While reserved: another visitor is blocked, the owner sees "available" ----
select pg_temp.act_as('00000000-0000-0000-0000-00000000000d');
insert into pg_temp.results select 'visitor sees reserved', (select status = 'reserved' and not can_gift from public.wishlist_for('recipient'));
do $$ begin
  perform public.reserve_wishlist_gift('20000000-0000-0000-0000-000000000001');
  insert into pg_temp.results values ('concurrent reservation blocked', false);
exception when others then insert into pg_temp.results values ('concurrent reservation blocked', true); end $$;
select pg_temp.act_as('00000000-0000-0000-0000-00000000000b');
insert into pg_temp.results select 'owner cannot see in-progress gift', (select status = 'available' from public.wishlist_for('recipient'));

select pg_temp.act_as('00000000-0000-0000-0000-00000000000a');
create temp table c1 as select * from public.confirm_wishlist_gift((select reservation_id from r1), 'wallet');
insert into pg_temp.results select 'purchaser receives reference', (select reference like 'HG-%' from c1);
insert into pg_temp.results select 'purchaser sees gift in my_sent_gifts', (select count(*) = 1 from public.my_sent_gifts());
insert into pg_temp.results select 'purchaser cannot read order row (address)', (select count(*) = 0 from public.orders);
insert into pg_temp.results select 'purchaser wallet debited', (select available_cents = 10000 - (5000 + 395 + 320) from public.my_wallet());

-- 3. Recipient perspective -----------------------------------------------------
select pg_temp.act_as('00000000-0000-0000-0000-00000000000b');
insert into pg_temp.results select 'recipient sees Sold', (select status = 'sold' from public.wishlist_for('recipient'));
insert into pg_temp.results select 'recipient has no order rows', (select count(*) = 0 from public.orders);
insert into pg_temp.results select 'recipient got no notification', (select count(*) = 0 from public.notifications);
insert into pg_temp.results select 'recipient sees no transactions', (select count(*) = 0 from public.transactions);
insert into pg_temp.results select 'recipient sees nothing in my_sent_gifts', (select count(*) = 0 from public.my_sent_gifts());
do $$ begin
  perform * from private.gift_orders;
  insert into pg_temp.results values ('recipient cannot read private.gift_orders', false);
exception when insufficient_privilege then insert into pg_temp.results values ('recipient cannot read private.gift_orders', true); end $$;

-- 4. Seller perspective --------------------------------------------------------
select pg_temp.act_as('00000000-0000-0000-0000-00000000000c');
insert into pg_temp.results select 'seller sees order with NULL buyer', (select count(*) = 1 and bool_and(buyer_id is null) from public.orders);
insert into pg_temp.results select 'seller sees ship-to address', (select bool_and(ship_to->>'line1' = 'Secret Street 1') from public.orders);
insert into pg_temp.results select 'seller ledger label is Hayve Gift', (select count(*) = 1 and bool_and(label_for_to = 'Hayve Gift' and label_for_from = 'Hayve Gift') from public.transactions);
insert into pg_temp.results select 'seller transactions never reference purchaser account', (select count(*) = 0 from public.transactions t where t.from_account = (select id from public.ledger_accounts where owner_id = '00000000-0000-0000-0000-00000000000a') or t.to_account = (select id from public.ledger_accounts where owner_id = '00000000-0000-0000-0000-00000000000a'));
do $$ begin
  perform * from private.gift_reservations;
  insert into pg_temp.results values ('seller cannot read private schema', false);
exception when insufficient_privilege then insert into pg_temp.results values ('seller cannot read private schema', true); end $$;

-- 5. No double gifting, no arbitrary gifting ------------------------------------
select pg_temp.act_as('00000000-0000-0000-0000-00000000000d');
do $$ begin
  perform public.reserve_wishlist_gift('20000000-0000-0000-0000-000000000001');
  insert into pg_temp.results values ('sold item cannot be gifted again', false);
exception when others then insert into pg_temp.results values ('sold item cannot be gifted again', true); end $$;
do $$ begin
  perform public.reserve_wishlist_gift('10000000-0000-0000-0000-000000000002');
  insert into pg_temp.results values ('non-wishlist product cannot be gifted', false);
exception when others then insert into pg_temp.results values ('non-wishlist product cannot be gifted', true); end $$;
do $$ begin
  insert into public.orders (reference, kind, product_id, seller_id, buyer_id, recipient_id, ship_to, price_cents, shipping_cents, protection_fee_cents, total_cents, payment_tx)
  values ('X', 'gift', '10000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-00000000000c', '00000000-0000-0000-0000-00000000000d', '00000000-0000-0000-0000-00000000000b', '{}', 1, 1, 1, 1, (select id from public.transactions limit 1));
  insert into pg_temp.results values ('gift orders can never store a buyer', false);
exception when others then insert into pg_temp.results values ('gift orders can never store a buyer', true); end $$;

reset role;
-- Ledger balance invariant.
insert into pg_temp.results select 'ledger balanced', (select bool_and(s = 0) from (select sum(amount_cents) s from public.ledger_entries where status <> 'voided' group by tx_id) x);

\set QUIET off
select test, case when ok then 'PASS' else 'FAIL' end as result from pg_temp.results;
select case when bool_and(ok) then 'ALL GIFTING PRIVACY TESTS PASSED' else 'SOME TESTS FAILED' end as summary from pg_temp.results;
