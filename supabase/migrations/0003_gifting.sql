-- Wishlists, orders and ANONYMOUS GIFTING.
--
-- Privacy guarantees enforced by the database (not just the UI):
--  1. The gift purchaser is stored only in private.gift_orders /
--     private.gift_reservations. The `private` schema is not exposed through
--     the Supabase API and anon/authenticated have no privileges on it.
--  2. orders.buyer_id is NULL for gifts (CHECK constraint), so no order row can
--     reveal the purchaser.
--  3. The recipient has no RLS path to gift orders at all; their wishlist row
--     simply becomes status = 'sold'. In-progress reservations live in the
--     private schema, so the owner can't even see that a checkout is happening.
--  4. Purchasers read their gifts through my_sent_gifts(), which omits the
--     recipient's address.
--  5. Gift money flows purchaser → Hayve Gift escrow → seller as two separate
--     transactions, so nothing the seller can read references the purchaser.
--  6. reserve_wishlist_gift() locks the wishlist row (SELECT … FOR UPDATE) and a
--     unique index allows one live reservation per item, so an item can never be
--     gifted twice.

create schema if not exists private;
revoke all on schema private from public;

create table public.wishlist_items (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  product_id uuid not null references public.products (id),
  position integer not null default 0,
  status text not null default 'available' check (status in ('available', 'sold')),
  added_at timestamptz not null default now(),
  unique (owner_id, product_id)
);

create type public.order_status as enum ('paid', 'shipped', 'delivered', 'completed', 'cancelled', 'refunded');

create table public.orders (
  id uuid primary key default gen_random_uuid(),
  reference text not null unique,
  kind text not null check (kind in ('purchase', 'gift')),
  product_id uuid not null references public.products (id),
  seller_id uuid not null references auth.users (id),
  buyer_id uuid references auth.users (id),
  recipient_id uuid not null references auth.users (id),
  ship_to jsonb not null,
  price_cents integer not null,
  shipping_cents integer not null,
  protection_fee_cents integer not null,
  total_cents integer not null,
  payment_tx uuid not null references public.transactions (id),
  -- For gifts the seller is paid by a separate escrow → seller transaction, so
  -- the seller's ledger never references the purchaser's account.
  seller_tx uuid references public.transactions (id),
  status public.order_status not null default 'paid',
  timeline jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  constraint gift_has_no_buyer check ((kind = 'gift' and buyer_id is null) or (kind = 'purchase' and buyer_id is not null))
);

create table private.gift_orders (
  order_id uuid primary key references public.orders (id) on delete cascade,
  wishlist_item_id uuid not null references public.wishlist_items (id),
  purchaser_id uuid not null references auth.users (id),
  recipient_id uuid not null references auth.users (id),
  created_at timestamptz not null default now()
);

create table private.gift_reservations (
  id uuid primary key default gen_random_uuid(),
  wishlist_item_id uuid not null unique references public.wishlist_items (id) on delete cascade,
  purchaser_id uuid not null references auth.users (id),
  expires_at timestamptz not null
);

revoke all on all tables in schema private from public;

alter table public.wishlist_items enable row level security;
alter table public.orders enable row level security;

-- Owners manage their own wishlist rows. Everyone else reads wishlists through
-- wishlist_for(), which applies profile visibility and computes Gift/Buy state.
create policy wishlist_owner_read on public.wishlist_items for select using (owner_id = auth.uid());
create policy wishlist_owner_insert on public.wishlist_items for insert with check (owner_id = auth.uid() and status = 'available');
create policy wishlist_owner_update on public.wishlist_items for update using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy wishlist_owner_delete on public.wishlist_items for delete using (owner_id = auth.uid() and status = 'available');

-- Orders: buyers and sellers only. Note: no policy mentions recipient_id.
create policy orders_parties on public.orders for select using (buyer_id = auth.uid() or seller_id = auth.uid() or public.is_admin());

-- ------------------------------------------------------------ helpers --

create or replace function public.protection_fee(price integer)
returns integer language sql immutable as $$ select round(price * 0.05)::integer + 70 $$;

create or replace function private.notify(target uuid, k public.notification_kind, t text, b text, l text)
returns void language sql security definer set search_path = public as $$
  insert into public.notifications (user_id, kind, title, body, link) values (target, k, t, b, l);
$$;

create or replace function private.order_reference(prefix text)
returns text language sql volatile as $$
  select prefix || '-' || upper(substr(translate(encode(gen_random_bytes(6), 'base64'), '+/=0O1I', ''), 1, 6));
$$;

-- ---------------------------------------------------- public wishlist --

create or replace function public.wishlist_for(p_username text)
returns table (
  item_id uuid, product_id uuid, title text, image text, price_cents integer, item_position integer,
  status text, can_buy boolean, can_gift boolean, gift_blocked_reason text
)
language plpgsql stable security definer set search_path = public, private as $$
declare
  v_owner uuid;
  v_public boolean;
  v_viewer uuid := auth.uid();
  v_has_address boolean;
begin
  select p.id, (p.is_public and p.wishlist_public) into v_owner, v_public from public.profiles p where p.username = lower(p_username);
  if v_owner is null then raise exception 'Profile not found' using errcode = 'P0002'; end if;
  if not v_public and v_viewer is distinct from v_owner then return; end if;
  select exists (select 1 from public.addresses a where a.user_id = v_owner and a.is_default) into v_has_address;

  return query
  with base as (
    select w.id, w.product_id, pr.title, pr.images[1] as image, pr.price_cents, w.position, w.status as wstatus,
           pr.status as pstatus, pr.quantity, pr.seller_id,
           exists (select 1 from private.gift_reservations r where r.wishlist_item_id = w.id and r.expires_at > now()) as reserved
    from public.wishlist_items w join public.products pr on pr.id = w.product_id
    where w.owner_id = v_owner
  ), computed as (
    select b.*,
      case
        when b.wstatus = 'sold' then 'sold'
        when b.pstatus <> 'active' or b.quantity <= 0 then 'unavailable'
        -- The owner never learns that a gift checkout is in progress.
        when b.reserved and v_viewer is distinct from v_owner then 'reserved'
        else 'available'
      end as vstatus
    from base b
  )
  select c.id, c.product_id, c.title, c.image, c.price_cents, c.position, c.vstatus,
    (v_viewer is not null and v_viewer <> v_owner and c.vstatus = 'available' and c.seller_id <> v_viewer),
    (v_viewer is not null and v_viewer <> v_owner and c.vstatus = 'available' and c.seller_id <> v_viewer and v_has_address),
    case
      when v_viewer is null then 'Sign in to send a gift'
      when v_viewer = v_owner then 'This is your wishlist'
      when c.vstatus = 'sold' then 'Already sold'
      when c.vstatus = 'reserved' then 'Someone is checking out this item'
      when c.vstatus = 'unavailable' then 'No longer available'
      when c.seller_id = v_viewer then 'You can''t gift your own listing'
      when not v_has_address then 'Gifting is not available for this person yet'
      else null
    end
  from computed c
  order by c.position;
end $$;

-- ------------------------------------------------------------ gifting --

create or replace function public.reserve_wishlist_gift(p_item uuid)
returns table (reservation_id uuid, expires_at timestamptz, total_cents integer)
language plpgsql volatile security definer set search_path = public, private as $$
declare
  v_viewer uuid := auth.uid();
  v_item public.wishlist_items%rowtype;
  v_product public.products%rowtype;
  v_owner public.profiles%rowtype;
  v_live_reservations integer;
  v_res uuid;
  v_exp timestamptz := now() + interval '10 minutes';
begin
  if v_viewer is null then raise exception 'Please sign in' using errcode = '28000'; end if;

  -- Lock the wishlist row: concurrent reservations for the same item serialise here.
  select * into v_item from public.wishlist_items where id = p_item for update;
  if not found then raise exception 'Wishlist item not found' using errcode = 'P0002'; end if;

  select * into v_owner from public.profiles where id = v_item.owner_id;
  if not (v_owner.is_public and v_owner.wishlist_public) then raise exception 'This wishlist is private' using errcode = '42501'; end if;
  if v_item.owner_id = v_viewer then raise exception 'This is your wishlist'; end if;
  if v_item.status <> 'available' then raise exception 'Already sold'; end if;

  delete from private.gift_reservations where wishlist_item_id = p_item and gift_reservations.expires_at <= now();
  if exists (select 1 from private.gift_reservations where wishlist_item_id = p_item) then
    raise exception 'Someone is checking out this item';
  end if;

  select * into v_product from public.products where id = v_item.product_id for update;
  if v_product.status <> 'active' or v_product.quantity <= 0 then raise exception 'No longer available'; end if;
  if v_product.seller_id = v_viewer then raise exception 'You can''t gift your own listing'; end if;
  select count(*) into v_live_reservations
    from private.gift_reservations r join public.wishlist_items w on w.id = r.wishlist_item_id
    where w.product_id = v_product.id and r.expires_at > now();
  if v_product.quantity - v_live_reservations <= 0 then raise exception 'This item is being purchased by someone else right now'; end if;
  if not exists (select 1 from public.addresses where user_id = v_item.owner_id and is_default) then
    raise exception 'Gifting is not available for this person yet';
  end if;

  insert into private.gift_reservations (wishlist_item_id, purchaser_id, expires_at) values (p_item, v_viewer, v_exp) returning id into v_res;
  return query select v_res, v_exp, v_product.price_cents + 395 + public.protection_fee(v_product.price_cents);
end $$;

create or replace function public.release_wishlist_gift(p_reservation uuid)
returns void language sql volatile security definer set search_path = public, private as $$
  delete from private.gift_reservations where id = p_reservation and purchaser_id = auth.uid();
$$;

/*
 * Pays for a reserved gift and creates the anonymous order, atomically.
 * p_method: 'wallet' (Hayve Pay balance) or 'card' (simulated card funding).
 */
create or replace function public.confirm_wishlist_gift(p_reservation uuid, p_method text)
returns table (order_id uuid, reference text, total_cents integer, payment_tx uuid)
language plpgsql volatile security definer set search_path = public, private as $$
declare
  v_viewer uuid := auth.uid();
  v_res private.gift_reservations%rowtype;
  v_item public.wishlist_items%rowtype;
  v_product public.products%rowtype;
  v_addr public.addresses%rowtype;
  v_fee integer;
  v_total integer;
  v_wallet uuid;
  v_seller_acc uuid;
  v_fees_acc uuid;
  v_card_acc uuid;
  v_escrow_acc uuid;
  v_tx uuid;
  v_seller_tx uuid;
  v_funding uuid;
  v_order uuid;
  v_ref text;
  v_recipient_name text;
begin
  if p_method not in ('wallet', 'card') then raise exception 'Unsupported payment method'; end if;

  select * into v_res from private.gift_reservations where id = p_reservation and purchaser_id = v_viewer for update;
  if not found then raise exception 'Gift checkout not found or expired'; end if;
  if v_res.expires_at <= now() then
    delete from private.gift_reservations where id = p_reservation;
    raise exception 'Your reservation expired. Please start again.';
  end if;

  select * into v_item from public.wishlist_items where id = v_res.wishlist_item_id for update;
  if v_item.status <> 'available' then raise exception 'Already sold'; end if;
  select * into v_product from public.products where id = v_item.product_id for update;
  if v_product.status <> 'active' or v_product.quantity <= 0 then raise exception 'No longer available'; end if;
  select * into v_addr from public.addresses where user_id = v_item.owner_id and is_default;
  if not found then raise exception 'Gifting is not available for this person yet'; end if;

  v_fee := public.protection_fee(v_product.price_cents);
  v_total := v_product.price_cents + 395 + v_fee;
  select id into v_wallet from public.ledger_accounts where owner_id = v_viewer;
  select id into v_seller_acc from public.ledger_accounts where owner_id = v_product.seller_id;
  select id into v_fees_acc from public.ledger_accounts where code = 'fees';
  select id into v_card_acc from public.ledger_accounts where code = 'card';
  select id into v_escrow_acc from public.ledger_accounts where code = 'gift_escrow';
  select display_name into v_recipient_name from public.profiles where id = v_item.owner_id;

  if p_method = 'card' then
    insert into public.transactions (type, status, amount_cents, from_account, to_account, label_for_from, label_for_to, method)
      values ('deposit', 'completed', v_total, v_card_acc, v_wallet, 'Card', 'Card payment (simulated)', 'card') returning id into v_funding;
    insert into public.ledger_entries (tx_id, account_id, amount_cents, status) values (v_funding, v_card_acc, -v_total, 'posted'), (v_funding, v_wallet, v_total, 'posted');
  end if;

  if (select available_cents from public.wallet_balances(v_wallet)) < v_total then
    raise exception 'Not enough Hayve Pay balance' using errcode = 'P0001';
  end if;

  -- 1) Purchaser → Hayve Gift escrow.
  insert into public.transactions (type, status, amount_cents, from_account, to_account, label_for_from, label_for_to, note, ref_kind, method, funding_tx)
    values ('gift_purchase', 'completed', v_total, v_wallet, v_escrow_acc, 'Gift for ' || v_recipient_name, 'Hayve Gift', v_product.title, 'order', p_method, v_funding)
    returning id into v_tx;
  insert into public.ledger_entries (tx_id, account_id, amount_cents, status) values
    (v_tx, v_wallet, -v_total, 'posted'),
    (v_tx, v_escrow_acc, v_total, 'posted');
  -- 2) Escrow → seller (pending until delivery) and fees. The seller only ever sees this one.
  insert into public.transactions (type, status, amount_cents, from_account, to_account, label_for_from, label_for_to, note, ref_kind, method)
    values ('sale', 'pending', v_total, v_escrow_acc, v_seller_acc, 'Hayve Gift', 'Hayve Gift', v_product.title, 'order', 'system')
    returning id into v_seller_tx;
  insert into public.ledger_entries (tx_id, account_id, amount_cents, status) values
    (v_seller_tx, v_escrow_acc, -v_total, 'posted'),
    (v_seller_tx, v_seller_acc, v_product.price_cents, 'pending'),
    (v_seller_tx, v_fees_acc, v_total - v_product.price_cents, 'posted');

  v_ref := private.order_reference('HG');
  insert into public.orders (reference, kind, product_id, seller_id, buyer_id, recipient_id, ship_to, price_cents, shipping_cents, protection_fee_cents, total_cents, payment_tx, seller_tx, timeline)
    values (v_ref, 'gift', v_product.id, v_product.seller_id, null, v_item.owner_id,
      jsonb_build_object('full_name', v_addr.full_name, 'line1', v_addr.line1, 'city', v_addr.city, 'postcode', v_addr.postcode, 'country', v_addr.country),
      v_product.price_cents, 395, v_fee, v_total, v_tx, v_seller_tx, jsonb_build_array(jsonb_build_object('status', 'paid', 'at', now())))
    returning id into v_order;
  update public.transactions set ref_id = v_order where id in (v_tx, v_seller_tx);

  insert into private.gift_orders (order_id, wishlist_item_id, purchaser_id, recipient_id) values (v_order, v_item.id, v_viewer, v_item.owner_id);
  update public.wishlist_items set status = 'sold' where id = v_item.id;
  update public.products set quantity = quantity - 1, status = case when quantity - 1 <= 0 then 'sold_out'::public.product_status else status end where id = v_product.id;
  delete from private.gift_reservations where id = p_reservation;

  -- Purchaser and seller are notified. The recipient deliberately is not.
  perform private.notify(v_viewer, 'order', 'Gift confirmed', v_product.title || ' · ' || v_ref, '/orders/' || v_order);
  perform private.notify(v_product.seller_id, 'sale', 'New Hayve Gift order', v_product.title || ' sold. Ship to the address on the order.', '/orders/' || v_order);

  return query select v_order, v_ref, v_total, v_tx;
end $$;

-- Purchaser's view of gifts they sent: no recipient address.
create or replace function public.my_sent_gifts()
returns table (order_id uuid, reference text, recipient_name text, product_title text, total_cents integer, status public.order_status, created_at timestamptz)
language sql stable security definer set search_path = public, private as $$
  select o.id, o.reference, p.display_name, pr.title, o.total_cents, o.status, o.created_at
  from private.gift_orders g
  join public.orders o on o.id = g.order_id
  join public.profiles p on p.id = g.recipient_id
  join public.products pr on pr.id = o.product_id
  where g.purchaser_id = auth.uid()
  order by o.created_at desc;
$$;

revoke all on function private.notify(uuid, public.notification_kind, text, text, text) from public;
revoke all on function private.order_reference(text) from public;
grant execute on function public.wishlist_for(text) to anon, authenticated;
grant execute on function public.reserve_wishlist_gift(uuid) to authenticated;
grant execute on function public.release_wishlist_gift(uuid) to authenticated;
grant execute on function public.confirm_wishlist_gift(uuid, text) to authenticated;
grant execute on function public.my_sent_gifts() to authenticated;
