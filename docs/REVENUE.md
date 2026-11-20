# Hayve revenue intelligence: opportunity database

Scope: only services implemented in the app today (Ride, Bites, Stay, Drive, Shop, Pay). Euro examples as requested (the app stores base amounts in USD and shows each person's currency).

**Labels.** *Documented* = a publicly documented practice of the named companies (their help pages, filings or terms). *Proposed* = Hayve's own idea or an estimate; numbers are illustrative, not measured. Nothing here claims what a company does privately.

**Principles built into the engine (`src/backend/pricing.ts`).** Market-wide signals only (place, time, demand, events, order size, distance, lead time). No individual price discrimination: the engine never receives personal attributes, and A/B groups are random. Every mandatory customer fee is shown with its name and amount before payment. Demand pricing is capped (1.8× default) and switched off in emergency mode. Surcharges in total are capped at 35% of the base. Every charge is stored as an auditable price record. Before rolling out a fee in a market, get legal advice on consumer law (drip pricing, unit-price rules), competition law and privacy.

## What Hayve already earns (as built)

| Service | Customer pays | Supplier pays | Built-in rule ids |
|---|---|---|---|
| Ride | Fare + booking fee €0.99 + contextual fees | 15% commission | `ride_commission`, `ride_booking_fee`, `ride_airport`, `ride_night`, `ride_demand`, `ride_event`, `ride_waiting`, `ride_cancel` |
| Bites | Food + restaurant delivery fee + service fee €1.49 (+ small-order fee under €15) | 15% commission | `bites_commission`, `bites_service`, `bites_small_order` |
| Stay | Nights + cleaning + 12% service fee + taxes | 15% commission | `stay_host_commission`, `stay_service` |
| Drive | Days − long-rental discount + insurance + 8% service fee (+ €15 airport collection) | 15% commission | `drive_host_commission`, `drive_service`, `drive_airport` |
| Shop | Item + tiered buyer fee (5→2%) + Hayve Send shipping by zone | — (business seller fee available, off) | config `feeTiers`, `SEND_ZONES`, `shop_business_seller` |
| Pay | — (FX margin rule available, off) | Business request links 1.2% + €0.20 | `pay_fx`, `payRequests` settings |

## Ranking method

Score = revenue potential (1–5) × margin (1–5) × scalability (1–5) ÷ (implementation cost (1–5) × legal/operational complexity (1–5)), adjusted down for low customer acceptance. Top ideas per service first.

---

## Hayve Ride

| # | Strategy | How it works / trigger | Who pays | Example (€) | Price change? | Goes to | Effort | Legal / ops notes | Used by majors? | Overlooked? |
|---|---|---|---|---|---|---|---|---|---|---|
| 1 | Booking fee | Flat per trip | Rider | €0.99 × 10k trips/day = €9.9k/day | Yes, disclosed | Hayve | Built | Show as a line | Documented (Uber "booking fee") | No |
| 2 | Airport fee | Pickup/drop-off in airport zone | Rider | €3.50 × 1,200 airport trips/day = €4.2k | Yes | Hayve (part may be owed to airport) | Built | Airport access contracts | Documented (Uber/Lyft airport surcharges) | No |
| 3 | Busy-time pricing (capped) | Demand ratio ≥ 1.5 near pickup | Rider | €20 fare × 1.25 → +€5 on 8% of trips | Yes | Hayve + driver split | Built | Cap, emergency mode, show multiplier | Documented (surge) | No |
| 4 | Commission tiers by driver category | Higher commission for premium classes (Comfort/XL) where fares are higher | Driver | 15% → 18% on Comfort: +€0.60 on a €20 fare | No | Hayve | Low | Driver contracts | Documented (varies by market) | Partly |
| 5 | Waiting-time charge | €0.35/min after 3 free minutes | Rider → driver | Pays drivers, reduces no-shows | Yes | Driver | Built | Disclose before booking | Documented | No |
| 6 | Late cancellation fee | >2 min after acceptance | Rider → driver | €5 × 2% of trips | Yes | Driver (or split) | Built | Disclose | Documented | No |
| 7 | Event surge zones | Admin-defined event + radius + time | Rider | Stadium exit: +15% max €8 | Yes | Hayve | Built (events) | Off in emergencies | Documented (event pricing) | Partly |
| 8 | Scheduled-ride reservation fee | Booking >1h ahead guarantees a driver | Rider | €2.50 per reservation | Yes | Hayve + driver bonus | Medium | Must guarantee or refund | Documented (Uber Reserve) | No |
| 9 | Priority dispatch upsell | "Priority" category already exists; price at 1.18× | Rider | +€3 on 6% of trips | Yes | Hayve | Built | Honour faster pickup | Documented | No |
| 10 | Route-economics: dead-head pricing | Long trips to low-demand areas include return-trip cost | Rider | +€0.30/km beyond city limits | Yes | Driver | Medium | Disclose "outside service area" | Documented (out-of-area fees) | Partly |
| 11 | Toll and congestion pass-through | Route crosses tolls/congestion zones | Rider | London ULEZ/NYC congestion pricing | Yes | Authority | Medium | Itemise | Documented | No |
| 12 | Driver instant payout fee | Driver withdraws earnings instantly instead of weekly | Driver | €0.50 per instant payout | No | Hayve | Low | Provider payout cost | Documented (Uber Instant Pay fees in some markets) | Partly |
| 13 | Supply-side guaranteed-earnings boosts funded by demand pricing | Pay drivers bonuses in hot zones from busy-time revenue | — | Raises acceptance, lowers wait | No | Driver | Medium | — | Documented (quests/boosts) | No |
| 14 | Ride + Bites bundling | Free delivery on the next Bites order after an evening ride | Hayve-funded | +AOV, cross-service frequency | No | — | Low | — | Proposed | Yes |
| 15 | In-trip advertising (screen-free) | Sponsored destination cards in the app during the trip | Advertiser | €2 CPM; €4k/month per city | No | Hayve | Medium | Ad disclosure, no tracking ads | Documented (Uber Journey Ads) | Partly |
| 16 | Corporate accounts | Monthly invoicing for companies, 3–5% service fee | Business | €10k/month account → €400 | No | Hayve | Medium | Invoicing, VAT | Documented (Uber for Business) | No |
| 17 | Lost-item return fee | Driver returns lost property | Rider → driver | €15, Hayve keeps €0 | Yes | Driver | Low | Fair to drivers | Documented (Uber) | Yes |

## Hayve Bites

| # | Strategy | Trigger | Who pays | Example (€) | Price change? | Goes to | Effort | Notes | Majors? | Overlooked? |
|---|---|---|---|---|---|---|---|---|---|---|
| 1 | Service fee | Every order | Customer | €1.49 × 5k orders/day = €7.4k | Yes | Hayve | Built | Single disclosed line | Documented (DoorDash/Uber Eats service fee) | No |
| 2 | Small-order fee | Subtotal under €15 | Customer | €2 on 18% of orders; shows "add €x to avoid" | Yes | Hayve | Built | Disclose threshold | Documented | No |
| 3 | Restaurant commission tiers | Basic 15% (delivery only) / Plus 22% (marketing + lower customer fees) | Restaurant | €30 order: €4.50 → €6.60 | No | Hayve | Medium | Contracts, caps exist in some US cities | Documented (DoorDash plans) | No |
| 4 | Sponsored listings | Restaurants bid for top placement | Restaurant | €0.40 per click, €8k/month per city | No | Hayve | Medium | Label "Sponsored" | Documented | No |
| 5 | Supplier-funded promotions | Restaurant funds "2 for 1"; Hayve features it | Restaurant | Restaurant pays discount + €0.50/redemption | No | Hayve | Low | — | Documented | Partly |
| 6 | Distance bands | Delivery >5 km | Customer | +€1.50, paid to courier | Yes | Courier | Built (off) | — | Documented | No |
| 7 | Busy-time fee | Friday/Saturday dinner | Customer | +€0.99 on 25% of weekend orders | Yes | Courier incentives | Built (off) | — | Documented ("busy area fee") | No |
| 8 | Pickup orders at lower commission | Customer collects; commission 6% | Restaurant | Converts walk-ins into app orders | No | Hayve | Low | — | Documented | Partly |
| 9 | Order-ahead for groups/catering | Large orders scheduled 24h ahead, 10% fee | Customer | €300 office lunch → €30 | Yes | Hayve | Medium | — | Documented | Yes |
| 10 | Grocery basket picking fee | Hayve Market orders | Customer | €2.99 picking fee | Yes | Picker | Medium | — | Documented | No |
| 11 | Menu-price markup disclosure (restaurant choice) | Restaurant sets in-app prices higher to absorb commission | Customer (via restaurant) | 10% higher menu | Yes (restaurant's) | Restaurant | — | Show "prices may differ from store" | Documented | No |
| 12 | Packaging/bag fee pass-through | Where local law requires bag fees | Customer | €0.10–0.25 | Yes | Authority/restaurant | Low | Local law | Documented | No |
| 13 | Restaurant tablet/POS integration fee | Monthly | Restaurant | €29/month × 1,000 restaurants | No | Hayve | Medium | — | Documented | Partly |
| 14 | Data insights for restaurants (aggregated) | Demand heatmaps, menu analytics | Restaurant | €49/month premium dashboard | No | Hayve | Medium | Aggregate only, no personal data | Proposed | Yes |
| 15 | Ghost-kitchen capacity | Rent idle kitchen hours to virtual brands listed on Hayve | Brand | 8% extra commission on virtual brands | No | Hayve | High | Food safety | Documented (industry) | Yes |
| 16 | Tip-matching campaigns funded by sponsors | Brand funds courier tips at peak | Sponsor | Sponsor pays €0.50/order | No | Courier | Low | — | Proposed | Yes |

## Hayve Stay

| # | Strategy | Trigger | Who pays | Example (€) | Price change? | Goes to | Effort | Notes | Majors? | Overlooked? |
|---|---|---|---|---|---|---|---|---|---|---|
| 1 | Guest service fee | Every booking | Guest | 12% of €450 = €54 | Yes | Hayve | Built | Show total incl. fees first (US FTC/EU rules) | Documented (Airbnb guest fee) | No |
| 2 | Host commission | Every booking | Host | 15% of €450 = €67.50 | No | Hayve | Built | — | Documented (Booking.com ~15% typical) | No |
| 3 | Visibility boost (preferred programme) | Host pays +3% commission for ranking boost | Host | +€13.50 per €450 booking | No | Hayve | Medium | Label ranking factors | Documented (Booking.com Preferred) | No |
| 4 | Last-minute booking fee | ≤2 days ahead | Guest | 3% max €30 | Yes | Hayve | Built (off) | Test first | Proposed | Yes |
| 5 | Event-week fee | Big event nearby | Guest | +5% max €50 | Yes | Hayve | Built (off) | Hosts set their own prices too | Proposed | Partly |
| 6 | Flexible-cancellation upsell | Guest buys free cancellation | Guest | €12 per booking | Yes | Hayve (risk pool) | Medium | Insurance law in some markets | Documented (Booking/hotel "flex" rates) | No |
| 7 | Damage protection for hosts | Optional cover | Host | €3 per booking | No | Hayve/insurer | High | Insurance licence/partner | Documented (AirCover is free; others charge) | Partly |
| 8 | Early check-in / late check-out add-ons | Host offers paid add-on | Guest | €25, Hayve takes 15% | Yes | Host + Hayve | Low | — | Documented (hotels) | Yes |
| 9 | Cleaning-fee pass-through transparency | Show in total | Guest | — | Yes | Host | Built | — | Documented | No |
| 10 | Long-stay discounts funded by host | Weekly/monthly | Host | Fills gaps; lower ADR | Yes (lower) | — | Built (weekly) | — | Documented | No |
| 11 | Ride to the stay | Offer a Hayve Ride from the airport at check-in | Guest | €35 ride, 15% + booking fee | Yes | Hayve | Low | — | Proposed | Yes |
| 12 | Car with the stay | Bundle Drive rental near the property | Guest | €60/day, 15% + 8% | Yes | Hayve | Low | — | Documented (Booking.com cars) | No |
| 13 | City tax collection service | Collect and remit tourist tax for hosts | Host | €0.50 per booking admin fee | No | Hayve | Medium | Tax registration | Documented (Airbnb collects) | Partly |
| 14 | Hotel inventory commission | Hotels list via link import; 15–18% | Hotel | €120 night → €19 | No | Hayve | Medium | Parity clauses banned in EU | Documented | No |
| 15 | Host subscription (pro tools) | Pricing tips, calendar sync, analytics | Host | €15/month | No | Hayve | Medium | — | Documented (various PMS) | Partly |
| 16 | Deposit float (no interest taken from guests) | Held deposits sit with the provider | — | Not a revenue source unless licensed | — | — | — | Don't plan revenue on customer funds | — | — |

## Hayve Drive

| # | Strategy | Trigger | Who pays | Example (€) | Price change? | Goes to | Effort | Notes | Majors? | Overlooked? |
|---|---|---|---|---|---|---|---|---|---|---|
| 1 | Rental service fee | Every rental | Renter | 8% of €180 = €14.40 | Yes | Hayve | Built | — | Documented (Turo trip fee) | No |
| 2 | Host commission | Every rental | Host | 15% of €180 = €27 | No | Hayve | Built | — | Documented (Turo host plans 15–40%) | No |
| 3 | Airport collection fee | Car at airport | Renter | €15 per rental | Yes | Hayve / airport | Built | Airport concessions | Documented ("concession recovery fee") | No |
| 4 | One-way return fee | Return location differs | Renter | €40 | Yes | Host/Hayve | Medium | — | Documented | No |
| 5 | Protection plans | Tiered insurance (basic/standard/premium) | Renter | €12–28/day | Yes | Insurer + Hayve commission | High | Insurance partner | Documented | No |
| 6 | Young driver fee | Driver under 25 | Renter | €15/day | Yes | Host/insurer | Low | Age rules vary | Documented | No |
| 7 | Additional driver fee | Extra driver | Renter | €8/day | Yes | Host | Low | — | Documented | No |
| 8 | Delivery to the renter | Host delivers car | Renter | €25 + 15% | Yes | Host + Hayve | Low | — | Documented (Turo delivery) | No |
| 9 | Prepaid fuel/charging | Return empty | Renter | Fuel at market + €10 service | Yes | Host/Hayve | Low | Disclose | Documented | No |
| 10 | Late-return fee | Over grace period | Renter | €20 per hour | Yes | Host | Low | — | Documented | No |
| 11 | Mileage packs | Above included km | Renter | €0.30/km | Yes | Host | Low | — | Documented | No |
| 12 | Host plans | Lower commission + less protection, or higher commission + more protection | Host | 15% / 25% / 35% | No | Hayve | Medium | — | Documented (Turo) | No |
| 13 | Idle-car marketplace for Ride drivers | Drivers without a car rent weekly from hosts | Driver | €250/week, 15% | No | Hayve | Medium | Insurance for rideshare use | Proposed | Yes |
| 14 | EV charging partnerships | Discounted charging; revenue share | Charging network | €0.02/kWh share | No | Hayve | Medium | — | Proposed | Yes |
| 15 | Cleaning and damage processing fee | Damage claims handled by Hayve | Host | 10% of claim | No | Hayve | Medium | Fair process | Documented | Partly |

## Hayve Shop

| # | Strategy | Trigger | Who pays | Example (€) | Price change? | Goes to | Effort | Notes | Majors? | Overlooked? |
|---|---|---|---|---|---|---|---|---|---|---|
| 1 | Tiered buyer protection fee | Every purchase | Buyer | 5% of €40 = €2 | Yes | Hayve | Built | One "Fees" line | Documented (Vinted buyer protection) | No |
| 2 | Shipping margin by zone | Hayve Send domestic/region/international | Buyer | Carrier cost €3.20, price €3.95 → €0.75 | Yes | Hayve | Built | — | Documented | No |
| 3 | Business seller commission | Verified stores | Seller | 5% of €100 = €5 | No | Hayve | Built (off) | — | Documented (Amazon referral fees) | No |
| 4 | Promoted listings | Seller pays to bump | Seller | €1.99 for 7 days | No | Hayve | Medium | Label "Promoted" | Documented (Vinted bumps, eBay promoted) | No |
| 5 | Wardrobe/store spotlight | Seller subscription | Seller | €6.99/week | No | Hayve | Medium | — | Documented | No |
| 6 | Bulk listing and stock tools for stores | Monthly | Seller | €19/month | No | Hayve | Medium | — | Documented | Partly |
| 7 | Authentication service | Luxury items verified | Buyer | €15 per item | Yes | Hayve/partner | High | — | Documented (Vinted/StockX) | Partly |
| 8 | Shipping insurance upsell | Parcels > €100 | Buyer | €1.50 per €100 | Yes | Hayve/insurer | Low | — | Documented | No |
| 9 | Gift wrapping for wishlist gifts | Anonymous gifts | Buyer | €2.99 | Yes | Hayve | Low | Keep gift privacy | Proposed | Yes |
| 10 | Sponsored search for brands | Brand-new items from stores | Seller | €0.25 CPC | No | Hayve | Medium | — | Documented | No |
| 11 | Return label fee | Buyer-initiated returns | Buyer | €3.95 | Yes | Hayve | Low | Consumer law for business sellers | Documented | No |
| 12 | Price-drop alerts paid by sellers | Seller pays to notify wishlist savers | Seller | €0.05 per notification | No | Hayve | Medium | Opt-in | Proposed | Yes |
| 13 | Cross-border shipping consolidation | International orders consolidated | Buyer | Lower cost, keep margin | Yes | Hayve | High | Customs | Documented | Partly |
| 14 | Local pickup at partner points | Buyer collects at a partner shop | Partner + buyer | €0.30 from partner | No | Hayve | Medium | — | Documented | Yes |
| 15 | Fulfilment for stores | Hayve stores and ships | Seller | €2.50 per order | No | Hayve | High | Warehousing | Documented (FBA) | No |

## Hayve Pay (wallet)

| # | Strategy | Trigger | Who pays | Example (€) | Price change? | Goes to | Effort | Notes | Majors? | Overlooked? |
|---|---|---|---|---|---|---|---|---|---|---|
| 1 | Business request-link fee | Business invoices paid via link | Business | 1.2% + €0.20 on €100 = €1.40 | No | Hayve | Built | — | Documented (Tikkie Business, PayPal) | No |
| 2 | Currency conversion margin | Paying in another currency | Customer | 1.5% on €200 = €3 | Yes, separate line | Hayve | Built (off) | EU/UK rules require showing the margin | Documented (PayPal ~3–4%) | No |
| 3 | Instant withdrawal fee | Withdraw now instead of 1–3 days | Customer | 1% max €10 | Yes | Hayve | Low | Provider instant payout cost | Documented (PayPal/Venmo) | No |
| 4 | Lower card cost via balance spending | Balance payments avoid card fees on each purchase | — | Saves ~2% + €0.25 per purchase | No | Hayve margin | Built | — | Documented logic | Yes |
| 5 | Wave Back funded partly by merchants | Merchants fund higher Wave Back on their items | Merchant | Merchant funds 2% | No | Customer | Medium | — | Documented (card-linked offers) | Yes |
| 6 | Gift cards (future) | Buy Hayve gift cards | Buyer | Breakage only where law allows | — | — | Medium | Escheatment rules | Documented | Partly |
| 7 | Business accounts with batch payouts | Pay many suppliers | Business | €0.25 per payout | No | Hayve | Medium | — | Documented | No |
| 8 | Split-bill premium (business) | Business splits with branding | Business | Included in fee | No | Hayve | Low | — | Proposed | Yes |
| 9 | Top-up bonuses funded by partners | "Add €50, get €2 Wave Back at partner" | Partner | Partner pays €2 | No | Customer | Low | — | Proposed | Yes |
| 10 | Interest on safeguarded funds | Only if licence/partner permits and terms disclose | — | Depends on partner | — | Partner/Hayve | — | Often not permitted for e-money; check | Documented (some fintechs) | — |
| 11 | Dormant balance fees | — | — | Do not plan: escheatment and consumer law | — | — | — | Avoid | — | — |
| 12 | Request-link premium analytics | Who paid, reminders, exports for businesses | Business | €5/month | No | Hayve | Low | — | Proposed | Yes |
| 13 | Payment links for non-Hayve merchants | Any business takes link payments | Business | 1.2% + €0.20 | No | Hayve | Built | Provider fees ~1.5% + €0.25 | Documented | No |
| 14 | Cross-service credit (balance spent across services) | Higher frequency, lower churn | — | Retention, not a fee | — | — | Built | — | Documented logic | Yes |
| 15 | Chargeback cost recovery from merchants | Disputes on business links | Business | €15 per dispute | No | Hayve | Low | — | Documented | No |

---

## Simulator examples (from the engine, illustrative)

- Airport fee €3.50 → €6.50 on a sample of 200 rides (20% airport): Hayve revenue up, trips down slightly (elasticity 0.6). Run it in Admin → Revenue & pricing → Simulate.
- Ride commission 15% → 18%: no customer price change; driver earnings −€0.60 on a €20 fare; watch driver supply.
- Bites small-order fee on: +€2 on orders under €15; expect some baskets to grow to avoid the fee (shown in the cart).

Every experiment measures orders, Hayve revenue, net revenue and average order per test vs control group (Admin → Experiments). Track refunds, cancellations and complaints alongside before rolling out.

## Not recommended

Hidden or drip fees; prices based on someone's device, wealth signals or desperation; surge during emergencies; fees for using one's own balance; dormant-balance fees; revenue plans that depend on interest from customer funds without a licence.
