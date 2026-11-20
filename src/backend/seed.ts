import { DEFAULT_FEE_TIERS, DEFAULT_WAVE_BACK } from './config';
import { accountIdFor, createTransaction, ensureAccount, releaseTransaction, SYSTEM, systemAccounts } from './ledger';
import { media } from './media';
import { PLACES } from './places';
import { setDatabase, simHash } from './store';
import type {
  Database,
  MenuItem,
  NotificationKind,
  Product,
  Profile,
  Property,
  RentalVehicle,
  Restaurant,
  Role,
  User,
} from './types';

export const DB_VERSION = 10;
export const DEMO_PASSWORD = 'hayve123';

export const DEMO_ACCOUNTS = [
  { email: 'sam@hayve.app', label: 'Sam Rivera', hint: 'Customer · Seller' },
  { email: 'noor@hayve.app', label: 'Noor Haddad', hint: 'Customer with a public wishlist' },
  { email: 'lucas@hayve.app', label: 'Lucas Vermeer', hint: 'Verified Hayve Store business' },
  { email: 'marco@hayve.app', label: 'Marco Rossi', hint: 'Hayve Kitchen' },
  { email: 'mila@hayve.app', label: 'Mila Jansen', hint: 'Hayve Host (stays and cars)' },
  { email: 'eva@hayve.app', label: 'Eva Smit', hint: 'Private seller · Store application pending' },
  { email: 'daan@hayve.app', label: 'Daan de Boer', hint: 'Hayve Driver' },
  { email: 'yara@hayve.app', label: 'Yara Bakker', hint: 'Hayve Courier' },
];

const allPrefs = (): Record<NotificationKind, boolean> => ({
  order: true,
  sale: true,
  delivery: true,
  ride: true,
  rental: true,
  stay: true,
  payment: true,
  refund: true,
  message: true,
  business: true,
  security: true,
});

export function emptyDatabase(): Database {
  return {
    version: DB_VERSION,
    users: [],
    profiles: [],
    addresses: [],
    paymentMethods: [],
    products: [],
    favourites: [],
    savedProperties: [],
    wishlistItems: [],
    orders: [],
    giftOrders: [],
    giftReservations: [],
    accounts: systemAccounts(),
    entries: [],
    transactions: [],
    moneyRequests: [],
    payRequests: [],
    rides: [],
    drivers: [],
    couriers: [],
    restaurants: [],
    menuItems: [],
    foodOrders: [],
    vehicles: [],
    rentals: [],
    properties: [],
    stayBookings: [],
    deliveries: [],
    threads: [],
    messages: [],
    notifications: [],
    reviews: [],
    businesses: [],
    paymentLinks: [],
    reports: [],
    settings: { feeTiers: DEFAULT_FEE_TIERS, waveBack: DEFAULT_WAVE_BACK },
    audit: [],
  };
}

export function defaultProfile(userId: string, username: string, displayName: string): Profile {
  return {
    userId,
    username,
    displayName,
    bio: '',
    city: 'New York',
    country: 'US',
    accountType: 'individual',
    isPublic: true,
    wishlistVisibility: 'public',
    wishlistToken: Math.random().toString(36).slice(2, 12),
    language: 'en',
    currency: 'USD',
    notificationPrefs: allPrefs(),
    twoFactor: false,
  };
}

const DAY = 86_400_000;

export function createSeedDatabase(): Database {
  const db = emptyDatabase();
  setDatabase(db);
  const t0 = Date.now();
  const ago = (days: number, hours = 0) => t0 - days * DAY - hours * 3_600_000;

  /* ---------------------------------------------------------- people -- */
  type Person = [id: string, email: string, username: string, name: string, roles: Role[], avatar: string, bio: string, extra?: Partial<Profile>];
  const people: Person[] = [
    ['u_sam', 'sam@hayve.app', 'samrivera', 'Sam Rivera', ['customer', 'seller'], media.avatars.sam, 'Designer in Brooklyn. Selling what I no longer use, buying what I love.', { country: 'US', city: 'New York', currency: 'USD' }],
    ['u_noor', 'noor@hayve.app', 'noor', 'Noor Haddad', ['customer'], media.avatars.noor, 'Coffee, film cameras and long walks along the Thames. My wishlist is public.', { country: 'GB', city: 'London', currency: 'GBP' }],
    ['u_lucas', 'lucas@hayve.app', 'lucasv', 'Lucas Vermeer', ['customer', 'seller'], media.avatars.lucas, 'Vinyl, audio and vintage tech. Ships within 48h.', { country: 'NL', city: 'Amsterdam', currency: 'EUR' }],
    ['u_ines', 'ines@hayve.app', 'ines.vintage', 'Inès Laurent', ['customer', 'seller'], media.avatars.ines, 'Curated vintage fashion from Paris.', { country: 'FR', city: 'Paris', currency: 'EUR' }],
    ['u_marco', 'marco@hayve.app', 'marco.kitchen', 'Marco Rossi', ['customer', 'kitchen'], media.avatars.marco, 'Chef-owner. Napoli Forno & Green Ritual.', { accountType: 'business', country: 'US', city: 'New York', currency: 'USD' }],
    ['u_mila', 'mila@hayve.app', 'mila.stays', 'Mila Jansen', ['customer', 'host'], media.avatars.mila, 'Superhost. City homes and cars for weekend escapes.', { country: 'US', city: 'New York', currency: 'USD' }],
    ['u_daan', 'daan@hayve.app', 'daan', 'Daan de Boer', ['customer', 'driver'], media.avatars.daan, 'Hayve Driver since 2025.', { country: 'US', city: 'New York', currency: 'USD' }],
    ['u_yara', 'yara@hayve.app', 'yara', 'Yara Bakker', ['customer', 'courier'], media.avatars.yara, 'E-bike courier, Manhattan.', { country: 'US', city: 'New York', currency: 'USD' }],
    ['u_fatima', 'fatima@hayve.app', 'fatima.drives', 'Fatima El Amrani', ['customer', 'driver'], '', 'Hayve Driver, electric only.', { country: 'US', city: 'New York', currency: 'USD' }],
    ['u_ruben', 'ruben@hayve.app', 'ruben.v', 'Ruben Visser', ['customer', 'driver'], '', 'Hayve Driver, Comfort.', { country: 'US', city: 'New York', currency: 'USD' }],
    ['u_kemal', 'kemal@hayve.app', 'kemal', 'Kemal Yilmaz', ['customer', 'driver'], '', 'Hayve Driver, XL and airport runs.', { country: 'US', city: 'New York', currency: 'USD' }],
    ['u_sophie', 'sophie@hayve.app', 'sophiedw', 'Sophie de Wit', ['customer', 'driver'], '', 'Hayve Driver, evenings.', { country: 'US', city: 'New York', currency: 'USD' }],
    ['u_eva', 'eva@hayve.app', 'evasmit', 'Eva Smit', ['customer', 'seller'], media.avatars.eva, 'Home & interiors lover.', { country: 'IE', city: 'Dublin', currency: 'EUR' }],
    ['u_jonas', 'jonas@hayve.app', 'jonas', 'Jonas Kramer', ['customer'], media.avatars.jonas, 'Private account.', { isPublic: false, wishlistVisibility: 'private', country: 'DE', city: 'Berlin', currency: 'EUR' }],
  ];
  for (const [id, email, username, name, roles, avatar, bio, extra] of people) {
    const user: User = { id, email, passwordHash: simHash(DEMO_PASSWORD), roles, emailVerified: true, createdAt: ago(400 - db.users.length * 20) };
    db.users.push(user);
    db.profiles.push({ ...defaultProfile(id, username, name), avatar: avatar || undefined, bio, ...extra });
    ensureAccount(id);
  }

  const addr = (id: string, userId: string, fullName: string, line1: string, city: string, postcode: string, country: string) =>
    db.addresses.push({ id, userId, label: 'Home', fullName, line1, city, postcode, country, isDefault: true });
  addr('ad_sam', 'u_sam', 'Sam Rivera', '245 Bedford Ave, Apt 3B', 'Brooklyn, NY', '11211', 'United States');
  addr('ad_noor', 'u_noor', 'Noor Haddad', '18 Columbia Road', 'London', 'E2 7NN', 'United Kingdom');
  addr('ad_lucas', 'u_lucas', 'Lucas Vermeer', 'Ferdinand Bolstraat 88', 'Amsterdam', '1072 LN', 'Netherlands');
  addr('ad_ines', 'u_ines', 'Inès Laurent', '21 Rue de Bretagne', 'Paris', '75003', 'France');
  addr('ad_eva', 'u_eva', 'Eva Smit', '14 Camden Street Lower', 'Dublin', 'D02 XY12', 'Ireland');
  addr('ad_jonas', 'u_jonas', 'Jonas Kramer', 'Kastanienallee 30', 'Berlin', '10435', 'Germany');
  db.addresses.push({ id: 'ad_sam_work', userId: 'u_sam', label: 'Studio', fullName: 'Sam Rivera', line1: '55 Washington St, Suite 400', city: 'Brooklyn, NY', postcode: '11201', country: 'United States', isDefault: false });

  db.paymentMethods.push(
    // Payout account for withdrawals (verified by the payment provider in production).
    { id: 'pm_sam_bank', userId: 'u_sam', kind: 'bank', label: 'Bank account •••• 4300', last4: '4300', isDefault: true, createdAt: ago(200) },
  );

  /* -------------------------------------------------------- products -- */
  const SELLER_CITY: Record<string, string> = { u_sam: 'Brooklyn, New York', u_lucas: 'Amsterdam', u_ines: 'Paris', u_eva: 'Dublin', u_noor: 'London' };
  const pr = (
    id: string,
    sellerId: string,
    title: string,
    priceEur: number,
    category: Product['category'],
    condition: Product['condition'],
    images: string[],
    description: string,
    extra: Partial<Product> = {},
  ) =>
    db.products.push({
      id,
      sellerId,
      title,
      description,
      priceCents: Math.round(priceEur * 100),
      category,
      condition,
      images,
      quantity: 1,
      status: 'active',
      location: SELLER_CITY[sellerId] ?? 'New York',
      createdAt: ago(Math.floor(Math.random() * 30), Math.floor(Math.random() * 20)),
      ...extra,
    });
  const P = media.products;
  pr('p_vinyl_bowl', 'u_lucas', 'Upcycled vinyl record bowl', 5, 'home', 'new_without_tags', [P.vinyl, P.turntable], 'Hand-shaped decorative bowl made from a real 12" LP. Each one is unique. Great for keys or snacks (dry only).', { quantity: 6, brand: 'Handmade' });
  pr('p_turntable', 'u_lucas', 'Belt-drive turntable, walnut', 189, 'electronics', 'very_good', [P.turntable, P.vinyl], 'Fully serviced belt-drive turntable with new stylus. Built-in preamp. Walnut veneer plinth, tiny mark on the lid.', { brand: 'Audio-Technica' });
  pr('p_headphones', 'u_lucas', 'Wireless over-ear headphones', 145, 'electronics', 'very_good', [P.headphones], 'Noise cancelling, 30h battery, original case and cable. Barely used.', { brand: 'Sony' });
  pr('p_polaroid', 'u_lucas', 'Instant camera, mint green', 79, 'electronics', 'good', [P.polaroid, P.camera], 'Tested with a fresh pack, works perfectly. Strap included.', { brand: 'Polaroid' });
  pr('p_keyboard', 'u_lucas', 'Mechanical keyboard 75%', 95, 'electronics', 'new_without_tags', [P.keyboard], 'Hot-swappable, brown switches, PBT keycaps. Opened only to test.', { brand: 'Keychron' });
  pr('p_film_camera', 'u_lucas', '35mm film camera with 50mm lens', 220, 'electronics', 'very_good', [P.camera, P.polaroid], 'Light meter works, shutter accurate at all speeds. A perfect first film camera.', { brand: 'Canon' });
  pr('p_jacket', 'u_ines', 'Vintage leather biker jacket', 120, 'fashion', 'very_good', [P.jacket, P.clothes], 'Soft lambskin, 90s cut. Size M, fits true to size.', { brand: 'Vintage', size: 'M' });
  pr('p_sneaker_red', 'u_ines', 'Running sneakers, red', 65, 'fashion', 'new_with_tags', [P.sneakerRed, P.sneakerPair], 'Brand new in box. EU 40.', { brand: 'Nike', size: 'EU 40' });
  pr('p_sneaker_white', 'u_ines', 'Classic white leather sneakers', 55, 'fashion', 'very_good', [P.sneakerWhite], 'Worn a handful of times, cleaned. EU 39.', { brand: 'Veja', size: 'EU 39' });
  pr('p_sunglasses', 'u_ines', 'Tortoiseshell sunglasses', 38, 'accessories', 'new_without_tags', [P.sunglasses, P.sunglasses2], 'UV400, acetate frame. Comes with pouch.', { brand: 'Ray-Ban' });
  pr('p_dress', 'u_ines', 'Silk slip dress, champagne', 74, 'fashion', 'new_with_tags', [P.dress, P.clothes], 'Bias cut 100% silk. Size S.', { brand: '& Other Stories', size: 'S' });
  pr('p_bag', 'u_ines', 'Structured leather tote', 98, 'accessories', 'very_good', [P.bag], 'Cognac leather with laptop sleeve. Minimal wear on the corners.', { brand: 'Cos' });
  pr('p_tee', 'u_ines', 'Heavyweight organic tee (3-pack)', 30, 'fashion', 'new_with_tags', [P.tshirt], 'White, size L. Unopened pack.', { brand: 'Arket', size: 'L', quantity: 4 });
  pr('p_watch', 'u_eva', 'Minimal automatic watch', 260, 'accessories', 'very_good', [P.watch], 'Sapphire crystal, 38mm, serviced in 2025. Box and papers.', { brand: 'Junghans' });
  pr('p_smartwatch', 'u_eva', 'Smartwatch with sport band', 160, 'electronics', 'good', [P.smartwatch], 'Battery health 92%. Charger included.', { brand: 'Apple' });
  pr('p_sofa', 'u_eva', 'Velvet 3-seater sofa, emerald', 420, 'home', 'very_good', [P.sofa], 'Pickup in Dublin 2 or Hayve Send XL delivery. Pet-free, smoke-free home.', { brand: 'Made.com' });
  pr('p_chair', 'u_eva', 'Mid-century lounge chair', 180, 'home', 'good', [P.chair], 'Teak frame, reupholstered seat.', { brand: 'Vintage' });
  pr('p_lamp', 'u_eva', 'Brass table lamp', 45, 'home', 'very_good', [P.lamp], 'Warm, dimmable, E27 bulb included.', { brand: 'HAY' });
  pr('p_plant', 'u_eva', 'Monstera in ceramic pot', 25, 'home', 'very_good', [P.plant], 'Healthy 80cm Monstera with 9 leaves. Pickup only.', { quantity: 2 });
  pr('p_mug', 'u_eva', 'Handmade stoneware mugs (set of 2)', 28, 'home', 'new_without_tags', [P.mug], 'Speckled glaze, dishwasher safe.', { brand: 'Studio Klei', quantity: 5 });
  pr('p_books', 'u_sam', 'Design book bundle (5 titles)', 40, 'books', 'good', [P.books], 'Grid systems, typography and colour theory. Light shelf wear.');
  pr('p_laptop', 'u_sam', '13" ultrabook, 16GB / 512GB', 640, 'electronics', 'very_good', [P.laptop, P.laptop2], 'M-series chip, battery cycle count 210. Original charger and box.', { brand: 'Apple' });
  pr('p_bike', 'u_sam', 'City bike, 3 gears', 210, 'sport', 'good', [P.bike], 'Dutch city bike with lights and lock. Recently serviced.', { brand: 'Gazelle' });
  pr('p_perfume', 'u_noor', 'Eau de parfum 50ml (90% full)', 48, 'accessories', 'very_good', [P.perfume], 'Woody, warm, amber notes.', { brand: 'Le Labo' });

  db.favourites.push(
    { userId: 'u_sam', productId: 'p_turntable', createdAt: ago(2) },
    { userId: 'u_sam', productId: 'p_jacket', createdAt: ago(3) },
    { userId: 'u_noor', productId: 'p_vinyl_bowl', createdAt: ago(1) },
    { userId: 'u_eva', productId: 'p_vinyl_bowl', createdAt: ago(5) },
  );

  /* -------------------------------------------------------- wishlists -- */
  const wl = (id: string, ownerId: string, productId: string, position: number, status: 'available' | 'sold' = 'available') =>
    db.wishlistItems.push({ id, ownerId, productId, position, status, addedAt: ago(10 - position) });
  wl('w_noor_1', 'u_noor', 'p_film_camera', 0);
  wl('w_noor_2', 'u_noor', 'p_turntable', 1);
  wl('w_noor_3', 'u_noor', 'p_sunglasses', 2);
  wl('w_noor_4', 'u_noor', 'p_mug', 3);
  wl('w_noor_5', 'u_noor', 'p_dress', 4);
  wl('w_noor_6', 'u_noor', 'p_lamp', 5);
  wl('w_sam_1', 'u_sam', 'p_headphones', 0);
  wl('w_sam_2', 'u_sam', 'p_watch', 1);
  wl('w_sam_3', 'u_sam', 'p_chair', 2);
  wl('w_jonas_1', 'u_jonas', 'p_keyboard', 0);

  /* ----------------------------------------------------------- money -- */
  const dep = (userId: string, eur: number, days: number) => {
    const tx = createTransaction({
      type: 'deposit',
      fromAccountId: SYSTEM.bank,
      credits: [{ accountId: accountIdFor(userId), amountCents: eur * 100 }],
      labelForFrom: 'Wallet top-up',
      labelForTo: 'Bank transfer (simulated)',
      method: 'bank',
    });
    tx.createdAt = ago(days);
  };
  dep('u_sam', 400, 30);
  dep('u_noor', 150, 20);
  dep('u_eva', 300, 25);
  dep('u_jonas', 100, 10);
  dep('u_lucas', 50, 40);
  const p2p = createTransaction({
    type: 'p2p',
    fromAccountId: accountIdFor('u_noor'),
    credits: [{ accountId: accountIdFor('u_sam'), amountCents: 2450 }],
    labelForFrom: 'Sam Rivera',
    labelForTo: 'Noor Haddad',
    note: 'Dinner at Baan Thai',
    method: 'wallet',
  });
  p2p.createdAt = ago(4);
  db.moneyRequests.push({ id: 'mr_1', requesterId: 'u_eva', payerId: 'u_sam', amountCents: 1800, note: 'Concert tickets', status: 'pending', createdAt: ago(1) });

  /* -------------------------------------------- historical purchase -- */
  // Sam bought headphones-like item earlier: use the vinyl bowl (multi-quantity).
  {
    const price = 500;
    const ship = 395;
    const fee = 25;
    const tx = createTransaction({
      type: 'purchase',
      fromAccountId: accountIdFor('u_sam'),
      credits: [
        { accountId: accountIdFor('u_lucas'), amountCents: price, status: 'pending' },
        { accountId: SYSTEM.fees, amountCents: ship + fee },
      ],
      labelForFrom: 'Lucas Vermeer',
      labelForTo: 'Sam Rivera',
      note: 'Upcycled vinyl record bowl',
      method: 'wallet',
      ref: { kind: 'order', id: 'o_seed_1' },
    });
    tx.createdAt = ago(9);
    releaseTransaction(tx.id);
    db.products.find((p) => p.id === 'p_vinyl_bowl')!.quantity -= 1;
    db.orders.push({
      id: 'o_seed_1',
      reference: 'HS-7Q4MXA',
      kind: 'purchase',
      productId: 'p_vinyl_bowl',
      sellerId: 'u_lucas',
      buyerId: 'u_sam',
      recipientId: 'u_sam',
      shipTo: { fullName: 'Sam Rivera', line1: '245 Bedford Ave, Apt 3B', city: 'Brooklyn, NY', postcode: '11211', country: 'United States' },
      delivery: 'ship',
      shipment: { carrier: 'Hayve Send', trackingCode: 'HX-8KQ2PZ', labelCreatedAt: ago(8, 2), events: [{ status: 'label_created', at: ago(8, 2) }, { status: 'in_transit', at: ago(8) }, { status: 'delivered', at: ago(6) }] },
      priceCents: price,
      shippingCents: ship,
      feeCents: fee,
      totalCents: price + ship + fee,
      paymentTxId: tx.id,
      sellerTxId: tx.id,
      status: 'completed',
      timeline: [
        { status: 'paid', at: ago(9) },
        { status: 'shipped', at: ago(8) },
        { status: 'delivered', at: ago(6) },
        { status: 'completed', at: ago(6) },
      ],
      createdAt: ago(9),
    });
  }

  /* ---------------------------------------------------------- drivers -- */
  db.drivers.push({
    userId: 'u_daan',
    vehicle: { make: 'Toyota', model: 'Corolla Hybrid', color: 'Graphite', plate: 'HV-482-K', category: 'go' },
    licenseNumber: 'NL-5541238',
    online: true,
    rating: 4.92,
    trips: 1284,
    demo: true,
    location: { lng: -73.9681, lat: 40.7128, at: t0 },
  });
  // More drivers around the centre so dispatch can rank them by distance and pickup time.
  db.drivers.push(
    { userId: 'u_fatima', vehicle: { make: 'Tesla', model: 'Model 3', color: 'White', plate: 'J-118-XR', category: 'green' }, licenseNumber: 'NL-6620194', online: true, rating: 4.95, trips: 2210, location: { lng: -73.9442, lat: 40.7081, at: t0 }, demo: true },
    { userId: 'u_ruben', vehicle: { make: 'Mercedes-Benz', model: 'E-Class', color: 'Black', plate: 'S-904-NK', category: 'comfort' }, licenseNumber: 'NL-7712055', online: true, rating: 4.9, trips: 980, location: { lng: -73.9903, lat: 40.7195, at: t0 }, demo: true },
    { userId: 'u_kemal', vehicle: { make: 'Volkswagen', model: 'Touran', color: 'Silver', plate: 'V-227-TB', category: 'xl' }, licenseNumber: 'NL-5530981', online: true, rating: 4.87, trips: 1730, location: { lng: -73.9396, lat: 40.7306, at: t0 }, demo: true },
    { userId: 'u_sophie', vehicle: { make: 'Kia', model: 'Niro EV', color: 'Blue', plate: 'K-561-PD', category: 'green' }, licenseNumber: 'NL-8841207', online: true, rating: 4.93, trips: 640, location: { lng: -73.9776, lat: 40.6895, at: t0 }, demo: true },
  );
  db.couriers.push({ userId: 'u_yara', vehicle: 'e-bike', online: true, rating: 4.97, jobs: 860 });

  const rideAt = (id: string, p: string, d: string, eur: number, days: number) => {
    const pickup = PLACES.find((x) => x.id === p)!;
    const dropoff = PLACES.find((x) => x.id === d)!;
    const tx = createTransaction({
      type: 'ride',
      fromAccountId: accountIdFor('u_sam'),
      credits: [
        { accountId: accountIdFor('u_daan'), amountCents: Math.round(eur * 80) },
        { accountId: SYSTEM.fees, amountCents: Math.round(eur * 20) },
      ],
      labelForFrom: 'Hayve Ride',
      labelForTo: 'Ride earnings',
      note: `${pickup.name} → ${dropoff.name}`,
      method: 'wallet',
      ref: { kind: 'ride', id },
    });
    tx.createdAt = ago(days);
    db.rides.push({
      id,
      riderId: 'u_sam',
      driverId: 'u_daan',
      pickup,
      dropoff,
      category: 'go',
      priceCents: Math.round(eur * 100),
      distanceKm: 6.4,
      durationMin: 18,
      status: 'completed',
      declinedBy: [],
      rating: 5,
      paymentTxId: tx.id,
      createdAt: ago(days),
      timeline: [{ status: 'completed', at: ago(days) }],
    });
  };
  rideAt('r_seed_1', 'home', 'grand_central', 18.4, 3);
  rideAt('r_seed_2', 'grand_central', 'jfk', 41.9, 12);

  /* ------------------------------------------------------- restaurants -- */
  const F = media.food;
  const rest = (r: Omit<Restaurant, 'createdAt' | 'ownerId'> & { ownerId?: string }) =>
    db.restaurants.push({ ownerId: 'u_marco', createdAt: ago(100), ...r });
  rest({ id: 'rs_napoli', name: 'Napoli Forno', cuisine: 'Pizza · Italian', description: 'Wood-fired Neapolitan pizza with 48-hour dough.', image: F.pizza, logoColor: '#E4572E', rating: 4.7, ratingCount: 1240, deliveryFeeCents: 199, minOrderCents: 1200, etaMin: 25, priceLevel: 2, tags: ['Pizza', 'Italian', 'Vegetarian'], address: '212 Bedford Ave, Brooklyn', isOpen: true, isGrocery: false, promo: '2 for 1 Margherita' });
  rest({ id: 'rs_green', name: 'Green Ritual', cuisine: 'Bowls · Healthy', description: 'Seasonal bowls, salads and cold-pressed juice.', image: F.bowl, logoColor: '#3E8E41', rating: 4.8, ratingCount: 860, deliveryFeeCents: 149, minOrderCents: 1000, etaMin: 20, priceLevel: 2, tags: ['Healthy', 'Vegan', 'Salads'], address: '88 N 6th St, Brooklyn', isOpen: true, isGrocery: false });
  rest({ id: 'rs_smash', name: 'Smash & Co', cuisine: 'Burgers · American', description: 'Double smash burgers, crinkle fries, thick shakes.', image: F.burger, logoColor: '#1B1B1B', rating: 4.5, ratingCount: 2210, deliveryFeeCents: 199, minOrderCents: 1200, etaMin: 30, priceLevel: 2, tags: ['Burgers', 'Fries'], address: '301 Grand St, Brooklyn', isOpen: true, isGrocery: false, promo: 'Free fries over €20', ownerId: 'u_lucas' });
  rest({ id: 'rs_baan', name: 'Baan Thai Kitchen', cuisine: 'Thai', description: 'Family recipes from Chiang Mai. Spice levels on request.', image: F.thai, logoColor: '#C2185B', rating: 4.9, ratingCount: 512, deliveryFeeCents: 200, minOrderCents: 1500, etaMin: 35, priceLevel: 2, tags: ['Thai', 'Noodles', 'Spicy'], address: '145 Ludlow St, New York', isOpen: true, isGrocery: false, ownerId: 'u_eva' });
  rest({ id: 'rs_sora', name: 'Sora Sushi', cuisine: 'Sushi · Japanese', description: 'Omakase-inspired sushi sets and poke.', image: F.sushi, logoColor: '#263238', rating: 4.6, ratingCount: 940, deliveryFeeCents: 299, minOrderCents: 2000, etaMin: 40, priceLevel: 3, tags: ['Sushi', 'Japanese', 'Poke'], address: '61 Greenpoint Ave, Brooklyn', isOpen: true, isGrocery: false, ownerId: 'u_eva' });
  rest({ id: 'rs_spice', name: 'Spice Route', cuisine: 'Indian · Curry', description: 'Tandoor, biryani and slow-cooked curries.', image: F.curry, logoColor: '#F57C00', rating: 4.4, ratingCount: 670, deliveryFeeCents: 149, minOrderCents: 1500, etaMin: 35, priceLevel: 1, tags: ['Indian', 'Curry', 'Vegetarian'], address: '402 Graham Ave, Brooklyn', isOpen: false, isGrocery: false, ownerId: 'u_eva' });
  rest({ id: 'rs_bakkerij', name: 'North Bakery', cuisine: 'Bakery · Breakfast', description: 'Sourdough, croissants and specialty coffee.', image: F.bakery, logoColor: '#8D6E63', rating: 4.8, ratingCount: 430, deliveryFeeCents: 99, minOrderCents: 800, etaMin: 15, priceLevel: 1, tags: ['Bakery', 'Breakfast', 'Coffee'], address: '19 Driggs Ave, Brooklyn', isOpen: true, isGrocery: false });
  rest({ id: 'rs_market', name: 'Hayve Market', cuisine: 'Groceries · 15 min', description: 'Fresh groceries and essentials delivered in minutes.', image: F.groceries, logoColor: '#3A1FD1', rating: 4.7, ratingCount: 3100, deliveryFeeCents: 0, minOrderCents: 1000, etaMin: 15, priceLevel: 1, tags: ['Groceries', 'Essentials'], address: 'Hayve hub, Williamsburg', isOpen: true, isGrocery: true, promo: 'Free delivery' });

  let mi = 0;
  const item = (restaurantId: string, category: string, name: string, eur: number, description: string, extra: Partial<MenuItem> = {}) =>
    db.menuItems.push({ id: `mi_${++mi}`, restaurantId, category, name, priceCents: Math.round(eur * 100), description, available: true, options: [], ...extra });
  const pizzaSize = { name: 'Size', required: true, choices: [{ label: 'Regular 30cm', priceCents: 0 }, { label: 'Large 35cm', priceCents: 300 }] };
  const extras = { name: 'Extras', required: false, choices: [{ label: 'Burrata', priceCents: 350 }, { label: 'Nduja', priceCents: 250 }, { label: 'Extra basil', priceCents: 50 }] };
  item('rs_napoli', 'Pizza', 'Margherita DOP', 11.5, 'San Marzano tomato, fior di latte, basil, olive oil.', { image: F.pizza, popular: true, options: [pizzaSize, extras] });
  item('rs_napoli', 'Pizza', 'Diavola', 13.5, 'Spicy salami, chilli honey, mozzarella.', { image: F.pizza2, popular: true, options: [pizzaSize, extras] });
  item('rs_napoli', 'Pizza', 'Funghi e Tartufo', 15, 'Wild mushrooms, truffle cream, parmesan.', { options: [pizzaSize, extras] });
  item('rs_napoli', 'Pasta', 'Cacio e Pepe', 12.5, 'Tonnarelli, pecorino romano, black pepper.', { image: F.pasta });
  item('rs_napoli', 'Dessert', 'Tiramisu', 6.5, 'Classic, made in-house daily.', { image: F.dessert });
  item('rs_napoli', 'Drinks', 'San Pellegrino Limonata', 3.2, '330ml can.', { image: F.drinks });
  item('rs_green', 'Bowls', 'Ritual Bowl', 13.9, 'Quinoa, roasted squash, kale, tahini, pickled onion.', { image: F.bowl, popular: true, options: [{ name: 'Protein', required: true, choices: [{ label: 'Tofu', priceCents: 0 }, { label: 'Chicken', priceCents: 200 }, { label: 'Salmon', priceCents: 400 }] }] });
  item('rs_green', 'Salads', 'Greek Garden Salad', 11.5, 'Feta, cucumber, olives, oregano dressing.', { image: F.salad });
  item('rs_green', 'Bowls', 'Miso Glow Bowl', 14.5, 'Brown rice, edamame, avocado, miso dressing.', { image: F.food });
  item('rs_green', 'Drinks', 'Green Juice', 5.5, 'Apple, cucumber, spinach, ginger.');
  item('rs_smash', 'Burgers', 'Double Smash', 12.9, 'Two smashed patties, cheddar, pickles, house sauce.', { image: F.burger, popular: true, options: [{ name: 'Make it a meal', required: false, choices: [{ label: 'Fries + drink', priceCents: 450 }] }] });
  item('rs_smash', 'Burgers', 'Crispy Chicken', 11.9, 'Buttermilk chicken, slaw, hot honey.', { image: F.burger2 });
  item('rs_smash', 'Sides', 'Crinkle Fries', 4.5, 'Sea salt, rosemary.', { image: F.fries });
  item('rs_smash', 'Shakes', 'Salted Caramel Shake', 5.9, 'Thick and creamy.');
  item('rs_baan', 'Mains', 'Pad Thai Goong', 15.5, 'Rice noodles, prawns, tamarind, peanuts.', { image: F.thai, popular: true, options: [{ name: 'Spice level', required: true, choices: [{ label: 'Mild', priceCents: 0 }, { label: 'Medium', priceCents: 0 }, { label: 'Thai hot', priceCents: 0 }] }] });
  item('rs_baan', 'Mains', 'Green Curry', 14.5, 'Chicken, Thai basil, aubergine, jasmine rice.', { image: F.curry });
  item('rs_baan', 'Starters', 'Spring Rolls (4)', 6.5, 'Vegetable, sweet chilli dip.');
  item('rs_sora', 'Sets', 'Sora Signature Set (16 pcs)', 28, 'Nigiri, maki and uramaki chef selection.', { image: F.sushi, popular: true });
  item('rs_sora', 'Poke', 'Salmon Poke', 16.5, 'Sushi rice, salmon, mango, edamame, ponzu.', { image: F.sushi2 });
  item('rs_sora', 'Maki', 'Spicy Tuna Roll', 9.5, '8 pieces, sriracha mayo.');
  item('rs_spice', 'Curries', 'Butter Chicken', 15, 'Tandoori chicken in tomato-butter sauce.', { image: F.curry, popular: true });
  item('rs_spice', 'Breads', 'Garlic Naan', 3.5, 'From the tandoor.');
  item('rs_bakkerij', 'Pastry', 'Butter Croissant', 3.2, 'Laminated with Normandy butter.', { image: F.croissant, popular: true });
  item('rs_bakkerij', 'Bread', 'Sourdough Loaf', 6.5, '24h fermentation.', { image: F.bakery });
  item('rs_bakkerij', 'Coffee', 'Flat White', 3.9, 'Single-origin espresso, oat or dairy.', { options: [{ name: 'Milk', required: true, choices: [{ label: 'Dairy', priceCents: 0 }, { label: 'Oat', priceCents: 40 }] }] });
  item('rs_market', 'Fresh', 'Bananas (1kg)', 1.99, 'Fairtrade.', { image: F.groceries });
  item('rs_market', 'Fresh', 'Avocados (2)', 2.79, 'Ripe and ready.');
  item('rs_market', 'Dairy', 'Oat milk 1L', 2.29, 'Barista edition.');
  item('rs_market', 'Bakery', 'Sourdough bread', 3.49, 'Baked this morning.');
  item('rs_market', 'Essentials', 'Coffee beans 500g', 8.99, 'Medium roast.');
  item('rs_market', 'Drinks', 'Sparkling water 6×1.5L', 3.99, '');

  // historical food order
  {
    const tx = createTransaction({
      type: 'food_order',
      fromAccountId: accountIdFor('u_sam'),
      credits: [
        { accountId: accountIdFor('u_marco'), amountCents: 2500 },
        { accountId: SYSTEM.fees, amountCents: 199 + 149 },
      ],
      labelForFrom: 'Napoli Forno',
      labelForTo: 'Hayve Bites order',
      method: 'wallet',
      ref: { kind: 'food', id: 'fo_seed_1' },
    });
    tx.createdAt = ago(2);
    db.foodOrders.push({
      id: 'fo_seed_1',
      reference: 'HB-K29XQP',
      customerId: 'u_sam',
      restaurantId: 'rs_napoli',
      courierId: 'u_yara',
      lines: [
        { menuItemId: 'mi_1', name: 'Margherita DOP', qty: 1, unitCents: 1150, options: ['Regular 30cm'] },
        { menuItemId: 'mi_2', name: 'Diavola', qty: 1, unitCents: 1350, options: ['Regular 30cm'] },
      ],
      subtotalCents: 2500,
      deliveryFeeCents: 199,
      serviceFeeCents: 149,
      totalCents: 2848,
      address: '245 Bedford Ave, Apt 3B, Brooklyn',
      note: '',
      status: 'delivered',
      paymentTxId: tx.id,
      rating: 5,
      createdAt: ago(2),
      timeline: [{ status: 'delivered', at: ago(2) }],
    });
  }

  /* --------------------------------------------------------- vehicles -- */
  const C = media.cars;
  const veh = (v: Omit<RentalVehicle, 'createdAt' | 'blockedDates' | 'listed' | 'hostId'> & { hostId?: string }) =>
    db.vehicles.push({ hostId: 'u_mila', createdAt: ago(60), blockedDates: [], listed: true, ...v });
  const req = (minAge: number, licenseYears: number, deposit: number) => ({ minAge, licenseYears, depositCents: deposit * 100 });
  veh({ id: 'v_tesla3', make: 'Tesla', model: 'Model 3 Long Range', year: 2024, type: 'electric', seats: 5, doors: 4, transmission: 'automatic', fuel: 'electric', rangeKm: 600, pricePerDayCents: 8900, images: [C.tesla, C.interior], location: "Manhattan, New York", features: ['Autopilot', 'Heated seats', 'Supercharging included', 'Apple CarPlay'], requirements: req(23, 2, 500), rating: 4.9, trips: 212 });
  veh({ id: 'v_golf', make: 'Volkswagen', model: 'Golf 1.5 eTSI', year: 2023, type: 'compact', seats: 5, doors: 5, transmission: 'automatic', fuel: 'petrol', pricePerDayCents: 4900, images: [C.compact, C.interior], location: "Brooklyn, New York", features: ['Bluetooth', 'Parking sensors', 'Cruise control'], requirements: req(21, 1, 300), rating: 4.8, trips: 340 });
  veh({ id: 'v_rav4', make: 'Toyota', model: 'RAV4 Hybrid AWD', year: 2023, type: 'suv', seats: 5, doors: 5, transmission: 'automatic', fuel: 'hybrid', pricePerDayCents: 7400, images: [C.suv, C.interior], location: "JFK Airport", features: ['AWD', 'Roof rails', 'Large boot', 'Child seat on request'], requirements: req(23, 2, 400), rating: 4.7, trips: 156 });
  veh({ id: 'v_ev6', make: 'Kia', model: 'EV6 GT-Line', year: 2024, type: 'electric', seats: 5, doors: 5, transmission: 'automatic', fuel: 'electric', rangeKm: 520, pricePerDayCents: 7900, images: [C.electric, C.interior], location: "LAX Airport", features: ['800V fast charging', 'Head-up display', 'Panoramic roof'], requirements: req(23, 2, 500), rating: 4.9, trips: 88 });
  veh({ id: 'v_bmw3', make: 'BMW', model: '330e Touring', year: 2022, type: 'sedan', seats: 5, doors: 5, transmission: 'automatic', fuel: 'hybrid', pricePerDayCents: 8400, images: [C.bmw, C.interior], location: "King's Cross, London", features: ['Plug-in hybrid', 'Navigation', 'Leather'], requirements: req(25, 3, 600), rating: 4.8, trips: 120, hostId: 'u_lucas' });
  veh({ id: 'v_mustang', make: 'Ford', model: 'Mustang Convertible', year: 2021, type: 'luxury', seats: 4, doors: 2, transmission: 'automatic', fuel: 'petrol', pricePerDayCents: 15900, images: [C.mustang], location: "Santa Monica, Los Angeles", features: ['Convertible', 'V8', 'Premium audio'], requirements: req(25, 5, 1500), rating: 4.9, trips: 41 });
  veh({ id: 'v_van', make: 'Mercedes-Benz', model: 'Vito Tourer (9 seats)', year: 2022, type: 'van', seats: 9, doors: 4, transmission: 'manual', fuel: 'diesel', pricePerDayCents: 11900, images: [C.van], location: "Dublin Airport", features: ['9 seats', 'Tow bar', 'Dual climate'], requirements: req(25, 3, 800), rating: 4.6, trips: 64 });
  veh({ id: 'v_porsche', make: 'Porsche', model: '911 Carrera', year: 2020, type: 'luxury', seats: 4, doors: 2, transmission: 'automatic', fuel: 'petrol', pricePerDayCents: 34900, images: [C.porsche], location: "Amsterdam Centraal", features: ['Sport Chrono', 'Bose audio'], requirements: req(30, 8, 3000), rating: 5, trips: 19 });

  /* -------------------------------------------------------- properties -- */
  const S = media.stays;
  const prop = (p: Omit<Property, 'createdAt' | 'blockedDates' | 'listed' | 'hostId'> & { hostId?: string }) =>
    db.properties.push({ hostId: 'u_mila', createdAt: ago(90), blockedDates: [], listed: true, ...p });
  prop({ id: 'st_canal', title: 'Canal house apartment with garden', type: 'apartment', city: 'Amsterdam', country: 'Netherlands', neighbourhood: 'Grachtengordel', description: 'A bright two-bedroom apartment in a 17th-century canal house. Original beams, a private garden and a five-minute walk to the Nine Streets. Fast Wi-Fi and a dedicated workspace.', pricePerNightCents: 24500, cleaningFeeCents: 6000, guests: 4, bedrooms: 2, beds: 2, baths: 1, amenities: ['Wi-Fi', 'Kitchen', 'Garden', 'Washer', 'Workspace', 'Heating'], images: [S.canal, S.living, S.bedroom, S.kitchen], rating: 4.96, reviewCount: 214, instantBook: true });
  prop({ id: 'st_jordaan', title: 'Sunny studio in the Jordaan', type: 'studio', city: 'Amsterdam', country: 'Netherlands', neighbourhood: 'Jordaan', description: 'Compact, design-led studio above a florist. Queen bed, rain shower and a sunny window seat overlooking the Westerkerk.', pricePerNightCents: 13900, cleaningFeeCents: 3500, guests: 2, bedrooms: 1, beds: 1, baths: 1, amenities: ['Wi-Fi', 'Kitchenette', 'Heating', 'Coffee maker'], images: [S.apartment, S.bedroom, S.bathroom], rating: 4.88, reviewCount: 389, instantBook: true });
  prop({ id: 'st_pijp', title: 'Private room in Williamsburg', type: 'room', city: 'New York', country: 'United States', neighbourhood: 'Williamsburg, Brooklyn', description: 'A calm private room in a shared loft with a friendly host. Steps from cafés, the waterfront and the L train.', pricePerNightCents: 7900, cleaningFeeCents: 1500, guests: 1, bedrooms: 1, beds: 1, baths: 1, amenities: ['Wi-Fi', 'Shared kitchen', 'Heating'], images: [S.bedroom, S.interior], rating: 4.79, reviewCount: 122, instantBook: false, hostId: 'u_eva' });
  prop({ id: 'st_loft', title: 'Warehouse loft in Shoreditch', type: 'apartment', city: 'London', country: 'United Kingdom', neighbourhood: 'Shoreditch', description: 'Double-height loft in a converted Victorian warehouse, five minutes from the Overground.', pricePerNightCents: 19900, cleaningFeeCents: 5000, guests: 3, bedrooms: 1, beds: 2, baths: 1, amenities: ['Wi-Fi', 'Kitchen', 'Free parking', 'Washer', 'River view'], images: [S.loft, S.living, S.kitchen], rating: 4.91, reviewCount: 97, instantBook: true });
  prop({ id: 'st_beach', title: 'Beach house in Malibu', type: 'house', city: 'Los Angeles', country: 'United States', neighbourhood: 'Malibu', description: 'Three-bedroom family house 200 ft from the beach. Deck, BBQ and bikes included. 40 minutes from Santa Monica.', pricePerNightCents: 31000, cleaningFeeCents: 9000, guests: 6, bedrooms: 3, beds: 4, baths: 2, amenities: ['Wi-Fi', 'Kitchen', 'Garden', 'BBQ', 'Free parking', 'Bikes', 'Washer'], images: [S.beach, S.house, S.living], rating: 4.93, reviewCount: 66, instantBook: false });
  prop({ id: 'st_lisbon', title: 'Azulejo holiday home in Alfama', type: 'holiday_home', city: 'Lisbon', country: 'Portugal', neighbourhood: 'Alfama', description: 'Traditional tiled home with a roof terrace over the Tagus. Tram 28 at the door.', pricePerNightCents: 16500, cleaningFeeCents: 4500, guests: 4, bedrooms: 2, beds: 3, baths: 1, amenities: ['Wi-Fi', 'Kitchen', 'Terrace', 'Air conditioning'], images: [S.lisbon, S.interior, S.bedroom], rating: 4.85, reviewCount: 158, instantBook: true });
  prop({ id: 'st_paris', title: 'Haussmann apartment, Le Marais', type: 'apartment', city: 'Paris', country: 'France', neighbourhood: 'Le Marais', description: 'Elegant fourth-floor flat with balcony, herringbone floors and marble fireplace.', pricePerNightCents: 28900, cleaningFeeCents: 7000, guests: 4, bedrooms: 2, beds: 2, baths: 2, amenities: ['Wi-Fi', 'Kitchen', 'Elevator', 'Balcony', 'Washer'], images: [S.paris, S.living, S.bedroom], rating: 4.9, reviewCount: 203, instantBook: true, hostId: 'u_ines' });
  prop({ id: 'st_villa', title: 'Modern villa with pool, Costa Brava', type: 'house', city: 'Barcelona', country: 'Spain', neighbourhood: 'Begur', description: 'Architect-designed villa with infinity pool and sea views. Ideal for families and groups.', pricePerNightCents: 52000, cleaningFeeCents: 15000, guests: 8, bedrooms: 4, beds: 5, baths: 3, amenities: ['Wi-Fi', 'Pool', 'Kitchen', 'Air conditioning', 'Free parking', 'Sea view', 'BBQ'], images: [S.villa, S.house2, S.living, S.barcelona], rating: 4.97, reviewCount: 48, instantBook: false });

  /* ---------------------------------------------------------- reviews -- */
  const rv = (targetKind: 'user' | 'restaurant' | 'property' | 'vehicle' | 'driver', targetId: string, authorId: string, rating: number, text: string, days: number) =>
    db.reviews.push({ id: `rv_${db.reviews.length + 1}`, targetKind, targetId, authorId, rating, text, createdAt: ago(days) });
  rv('user', 'u_lucas', 'u_sam', 5, 'Bowl arrived beautifully packed. Fast shipping!', 6);
  rv('user', 'u_lucas', 'u_eva', 5, 'Great seller, item exactly as described.', 30);
  rv('user', 'u_ines', 'u_noor', 5, 'Gorgeous jacket, lovely communication.', 14);
  rv('user', 'u_eva', 'u_jonas', 4, 'Smooth pickup, friendly.', 40);
  rv('property', 'st_canal', 'u_noor', 5, 'The garden is a dream. Mila was incredibly helpful.', 22);
  rv('property', 'st_canal', 'u_jonas', 5, 'Perfect location, spotless and quiet.', 50);
  rv('property', 'st_jordaan', 'u_sam', 5, 'Tiny but perfect. Loved the window seat.', 70);
  rv('property', 'st_beach', 'u_eva', 5, 'Kids loved it. Beach is right there.', 120);
  rv('vehicle', 'v_tesla3', 'u_sam', 5, 'Spotless car, easy handover.', 45);
  rv('vehicle', 'v_golf', 'u_noor', 5, 'Great little car for a day trip.', 33);
  rv('restaurant', 'rs_napoli', 'u_sam', 5, 'Best Margherita in the city.', 2);
  rv('restaurant', 'rs_baan', 'u_noor', 5, 'Proper Thai heat. Love it.', 9);
  rv('driver', 'u_daan', 'u_sam', 5, 'Friendly and smooth driving.', 3);

  /* --------------------------------------------------------- messages -- */
  db.threads.push({ id: 'th_1', participantIds: ['u_sam', 'u_lucas'], context: { kind: 'product', id: 'p_turntable', title: 'Belt-drive turntable, walnut' }, lastMessageAt: ago(0, 3) });
  db.messages.push(
    { id: 'm_1', threadId: 'th_1', senderId: 'u_sam', body: 'Hi Lucas! Is the turntable still available? Does it come with the dust cover?', createdAt: ago(0, 5), readBy: ['u_sam', 'u_lucas'] },
    { id: 'm_2', threadId: 'th_1', senderId: 'u_lucas', body: 'Hey Sam, yes it is — dust cover included, and I just replaced the belt.', createdAt: ago(0, 4), readBy: ['u_lucas', 'u_sam'] },
    { id: 'm_3', threadId: 'th_1', senderId: 'u_lucas', body: 'Happy to ship it with Hayve Send tomorrow if you buy today.', createdAt: ago(0, 3), readBy: ['u_lucas'] },
  );
  db.threads.push({ id: 'th_2', participantIds: ['u_sam', 'u_mila'], context: { kind: 'property', id: 'st_canal', title: 'Canal house apartment with garden' }, lastMessageAt: ago(6) });
  db.messages.push(
    { id: 'm_4', threadId: 'th_2', senderId: 'u_mila', body: 'Welcome to Hayve Stay! Let me know if you have any questions about the apartment.', createdAt: ago(6), readBy: ['u_mila', 'u_sam'] },
  );

  /* ---------------------------------------------------- notifications -- */
  const nt = (userId: string, kind: NotificationKind, title: string, body: string, hours: number, link?: string, read = false) =>
    db.notifications.push({ id: `n_${db.notifications.length + 1}`, userId, kind, title, body, link, read, createdAt: t0 - hours * 3_600_000 });
  nt('u_sam', 'message', 'New message from Lucas', 'Happy to ship it with Hayve Send tomorrow…', 3, '/messages/th_1');
  nt('u_sam', 'payment', 'Payment request', 'Eva Smit requested €18.00 · Concert tickets', 24, '/pay/requests');
  nt('u_sam', 'payment', 'You received €24.50', 'Noor Haddad · Dinner at Baan Thai', 96, '/pay', true);
  nt('u_sam', 'order', 'Order delivered', 'Upcycled vinyl record bowl was delivered.', 144, '/orders/o_seed_1', true);
  nt('u_lucas', 'message', 'New message from Sam', 'Is the turntable still available?', 5, '/messages/th_1');

  /* ------------------------------------------------- Hayve Store -- */
  db.businesses.push(
    {
      id: 'biz_groove',
      ownerId: 'u_lucas',
      legalName: 'Groove Supply B.V.',
      country: 'NL',
      tradingName: 'Groove Supply',
      category: 'Audio & vinyl',
      registrationNumber: '81234567',
      vatNumber: 'NL862345678B01',
      address: { line1: 'Ferdinand Bolstraat 88', city: 'Amsterdam', postcode: '1072 LN', country: 'Netherlands' },
      website: 'groovesupply.nl',
      description: 'Serviced turntables, audio and vinyl objects. Every item tested in our De Pijp workshop.',
      logo: media.products.turntable,
      banner: media.products.vinyl,
      ownerIdChecked: true,
      status: 'verified',
      reviewedAt: ago(200),
      payoutSchedule: 'weekly',
      submittedAt: ago(205),
      createdAt: ago(205),
    },
    {
      id: 'biz_casa',
      ownerId: 'u_eva',
      legalName: 'Casa Eva Interiors Ltd',
      tradingName: 'Casa Eva',
      category: 'Home & interiors',
      country: 'IE',
      registrationNumber: '654321',
      vatNumber: 'IE6543210T',
      address: { line1: '14 Camden Street Lower', city: 'Dublin', postcode: 'D02 XY12', country: 'Ireland' },
      website: '',
      description: 'Pre-loved furniture and handmade homeware.',
      ownerIdChecked: true,
      status: 'pending',
      payoutSchedule: 'weekly',
      submittedAt: ago(1),
      createdAt: ago(1),
    },
  );
  if (!db.users.find((u) => u.id === 'u_lucas')!.roles.includes('merchant')) db.users.find((u) => u.id === 'u_lucas')!.roles.push('merchant');

  /* ------------------------------------------- seller review volume -- */
  const texts = ['Exactly as described, fast shipping.', 'Lovely seller, well packed.', 'Great quality, would buy again.', 'Quick replies and smooth handover.', 'Item was even better in person.', 'Arrived in two days. Thank you!', 'Honest description, fair price.', 'Super friendly, recommended.'];
  const reviewers = ['u_sam', 'u_noor', 'u_eva', 'u_jonas', 'u_ines', 'u_lucas', 'u_daan', 'u_yara', 'u_mila', 'u_marco'];
  const volume = (sellerId: string, total: number, fours: number, threes: number) => {
    const existing = db.reviews.filter((r) => r.targetKind === 'user' && r.targetId === sellerId).length;
    for (let i = existing; i < total; i++) {
      const authorId = reviewers.filter((r) => r !== sellerId)[i % (reviewers.length - 1)];
      const rating = i < threes ? 3 : i < threes + fours ? 4 : 5;
      db.reviews.push({ id: `rv_${sellerId}_${i}`, targetKind: 'user', targetId: sellerId, authorId, rating, text: texts[i % texts.length], createdAt: ago(10 + i * 2) });
    }
  };
  volume('u_lucas', 132, 22, 2); // ★ 4.8
  volume('u_ines', 87, 9, 0); // ★ 4.9
  volume('u_eva', 41, 13, 2); // ★ 4.6
  volume('u_sam', 12, 3, 0); // ★ 4.8
  volume('u_noor', 3, 0, 0);

  db.audit.push({ id: 'au_1', actorId: null, action: 'seed', target: 'database', createdAt: t0 });
  return db;
}
