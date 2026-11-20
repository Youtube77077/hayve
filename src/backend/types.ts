/**
 * Hayve domain model.
 *
 * These types mirror the PostgreSQL schema in /supabase/migrations. The local
 * simulated backend (src/backend/store.ts) persists exactly these records, so the
 * UI code is written against the same shapes it will receive from Supabase.
 */
export type ID = string;
export type ISODate = string; // yyyy-mm-dd
export type Cents = number;

export type Role =
  | 'customer'
  | 'seller'
  | 'host'
  | 'driver'
  | 'courier'
  | 'kitchen'
  | 'merchant'
  | 'admin';

export interface User {
  id: ID;
  email: string;
  passwordHash: string;
  roles: Role[];
  emailVerified: boolean;
  createdAt: number;
  deletedAt?: number;
  suspendedAt?: number;
  suspensionReason?: string;
}

export interface Profile {
  userId: ID;
  username: string;
  displayName: string;
  bio: string;
  /** 400×400 picture URL (object storage). */
  avatar?: string;
  /** 96×96 thumbnail URL. */
  avatarThumb?: string;
  city: string;
  accountType: 'individual' | 'business';
  isPublic: boolean;
  /** public: on the profile · link: only with the share link · private: owner only. */
  wishlistVisibility: 'public' | 'link' | 'private';
  wishlistToken: string;
  language: 'en' | 'nl' | 'fr' | 'de';
  currency: 'EUR';
  notificationPrefs: Record<NotificationKind, boolean>;
  twoFactor: boolean;
  /** Identity check through the payment partner (needed for Tap to Pay and the Hayve Card). */
  kyc?: { status: 'pending' | 'verified'; verifiedAt?: number };
}

export interface Address {
  id: ID;
  userId: ID;
  label: string;
  fullName: string;
  line1: string;
  city: string;
  postcode: string;
  country: string;
  isDefault: boolean;
}

export type ProductCategory =
  | 'fashion'
  | 'electronics'
  | 'home'
  | 'accessories'
  | 'collectibles'
  | 'books'
  | 'sport'
  | 'general';

export type ProductCondition = 'new_with_tags' | 'new_without_tags' | 'very_good' | 'good' | 'satisfactory';

export interface Product {
  id: ID;
  sellerId: ID;
  title: string;
  description: string;
  priceCents: Cents;
  category: ProductCategory;
  condition: ProductCondition;
  brand?: string;
  size?: string;
  images: string[];
  quantity: number;
  status: 'active' | 'sold_out' | 'removed';
  location: string;
  createdAt: number;
}

export interface Favourite {
  userId: ID;
  productId: ID;
  createdAt: number;
}

export interface WishlistItem {
  id: ID;
  ownerId: ID;
  productId: ID;
  position: number;
  /** available → reserved (during a gift checkout) → sold (gift fulfilled). */
  status: 'available' | 'reserved' | 'sold';
  reservation?: { id: ID; expiresAt: number };
  addedAt: number;
}

export type OrderStatus = 'paid' | 'shipped' | 'delivered' | 'completed' | 'cancelled' | 'refunded';

export interface Shipment {
  carrier: 'Hayve Send';
  trackingCode: string;
  labelCreatedAt: number;
  events: { status: 'label_created' | 'in_transit' | 'out_for_delivery' | 'delivered' | 'returned'; at: number }[];
}

export interface Order {
  id: ID;
  reference: string;
  kind: 'purchase' | 'gift';
  productId: ID;
  sellerId: ID;
  /**
   * The buyer for ordinary purchases. ALWAYS null for gift orders: the gift
   * purchaser lives only in the private `giftOrders` table.
   */
  buyerId: ID | null;
  /** Who receives the parcel (buyer for purchases, wishlist owner for gifts). */
  recipientId: ID;
  shipTo: Omit<Address, 'id' | 'userId' | 'isDefault' | 'label'>;
  /** ship = Hayve Send parcel, pickup = handed over in person. */
  delivery: 'ship' | 'pickup';
  shipment?: Shipment;
  priceCents: Cents;
  shippingCents: Cents;
  /** Marketplace buyer fee (tiered, see config.ts). */
  feeCents: Cents;
  totalCents: Cents;
  paymentTxId: ID;
  sellerTxId: ID;
  status: OrderStatus;
  timeline: { status: OrderStatus | 'label_created'; at: number }[];
  /** The buyer's review of the seller (one per order). */
  reviewId?: ID;
  createdAt: number;
}

/** PRIVATE: only the gifting service / fulfilment may read this table. */
export interface GiftOrder {
  id: ID;
  orderId: ID;
  wishlistItemId: ID;
  purchaserId: ID;
  recipientId: ID;
  createdAt: number;
}

/** PRIVATE: an in-progress gift checkout. Holds the purchaser identity. */
export interface GiftReservation {
  id: ID;
  wishlistItemId: ID;
  purchaserId: ID;
  expiresAt: number;
}

/* ---------------------------------------------------------------- Ledger -- */

export type AccountKind = 'user' | 'system';
export interface Account {
  id: ID;
  ownerId: ID | null;
  kind: AccountKind;
  label: string;
}

/**
 * posted  – settled, counts towards available balance.
 * pending – incoming funds not yet released (e.g. seller earnings before delivery).
 * held    – funds reserved from a payer during checkout (negative, blocks spending).
 * voided  – cancelled entry, ignored.
 */
export type EntryStatus = 'posted' | 'pending' | 'held' | 'voided';

export interface LedgerEntry {
  id: ID;
  txId: ID;
  accountId: ID;
  amountCents: Cents; // signed
  status: EntryStatus;
  createdAt: number;
}

export type TxType =
  | 'deposit'
  | 'withdrawal'
  | 'p2p'
  | 'purchase'
  | 'sale'
  | 'gift_purchase'
  | 'food_order'
  | 'ride'
  | 'rental'
  | 'stay'
  | 'delivery'
  | 'earning'
  | 'refund'
  | 'merchant_payment'
  | 'wave_back'
  | 'tap_payment'
  | 'card_purchase'
  | 'auto_topup'
  | 'fee';

export type TxStatus = 'pending' | 'completed' | 'failed' | 'refunded' | 'reserved';

export interface Transaction {
  id: ID;
  type: TxType;
  status: TxStatus;
  amountCents: Cents;
  fromAccountId: ID;
  toAccountId: ID;
  /** Label each side sees. The gift seller sees "Hayve Gift" rather than a person. */
  labelForFrom: string;
  labelForTo: string;
  note?: string;
  ref?: { kind: string; id: ID };
  method: 'wallet' | 'card' | 'bank' | 'system';
  /** For card payments: the card → wallet funding transaction. */
  fundingTxId?: ID;
  /** Wave Back eligibility, granted when the payment is captured from the balance. */
  waveBack?: { category: import('./config').WaveBackCategory; baseCents: Cents; merchant?: string };
  /** Wave Back credited for this payment. */
  waveBackCents?: Cents;
  /** Extra details: welcome rate (wave_back), card used (tap/card), merchant (card purchases). */
  meta?: { newUser?: boolean; card?: { brand: string; last4: string }; merchant?: { name: string; category: string; partner: boolean }; tapId?: ID };
  simulated: true;
  createdAt: number;
}

export interface MoneyRequest {
  id: ID;
  requesterId: ID;
  payerId: ID;
  amountCents: Cents;
  note: string;
  status: 'pending' | 'paid' | 'declined' | 'cancelled';
  createdAt: number;
}

export interface PaymentMethod {
  id: ID;
  userId: ID;
  kind: 'card' | 'bank';
  label: string;
  last4: string;
  brand?: string;
  isDefault: boolean;
}

/* ------------------------------------------------------------- Services -- */

export interface Place {
  id: string;
  name: string;
  address: string;
  lng: number;
  lat: number;
}

export type RideCategory = 'go' | 'green' | 'comfort' | 'xl' | 'priority';
export type RideStatus = 'requested' | 'accepted' | 'arriving' | 'in_progress' | 'completed' | 'cancelled';

export interface Ride {
  id: ID;
  riderId: ID;
  driverId: ID | null;
  pickup: Place;
  dropoff: Place;
  category: RideCategory;
  priceCents: Cents;
  distanceKm: number;
  durationMin: number;
  status: RideStatus;
  declinedBy: ID[];
  rating?: number;
  paymentTxId?: ID;
  createdAt: number;
  timeline: { status: RideStatus; at: number }[];
}

export interface DriverProfile {
  userId: ID;
  vehicle: { make: string; model: string; color: string; plate: string; category: RideCategory };
  licenseNumber: string;
  online: boolean;
  rating: number;
  trips: number;
}

export interface CourierProfile {
  userId: ID;
  vehicle: 'bike' | 'e-bike' | 'scooter' | 'car' | 'van';
  online: boolean;
  rating: number;
  jobs: number;
}

export interface Restaurant {
  id: ID;
  ownerId: ID;
  name: string;
  cuisine: string;
  description: string;
  image: string;
  logoColor: string;
  rating: number;
  ratingCount: number;
  deliveryFeeCents: Cents;
  minOrderCents: Cents;
  etaMin: number;
  priceLevel: 1 | 2 | 3;
  tags: string[];
  address: string;
  isOpen: boolean;
  isGrocery: boolean;
  promo?: string;
  createdAt: number;
}

export interface MenuOption {
  name: string;
  required: boolean;
  choices: { label: string; priceCents: Cents }[];
}

export interface MenuItem {
  id: ID;
  restaurantId: ID;
  name: string;
  description: string;
  priceCents: Cents;
  image?: string;
  category: string;
  available: boolean;
  popular?: boolean;
  options: MenuOption[];
}

export type FoodOrderStatus =
  | 'placed'
  | 'accepted'
  | 'preparing'
  | 'ready'
  | 'picked_up'
  | 'delivered'
  | 'rejected'
  | 'cancelled';

export interface FoodOrderLine {
  menuItemId: ID;
  name: string;
  qty: number;
  unitCents: Cents;
  options: string[];
}

export interface FoodOrder {
  id: ID;
  reference: string;
  customerId: ID;
  restaurantId: ID;
  courierId: ID | null;
  lines: FoodOrderLine[];
  subtotalCents: Cents;
  deliveryFeeCents: Cents;
  serviceFeeCents: Cents;
  totalCents: Cents;
  address: string;
  note: string;
  status: FoodOrderStatus;
  paymentTxId?: ID;
  rating?: number;
  createdAt: number;
  timeline: { status: FoodOrderStatus; at: number }[];
}

export type VehicleType = 'compact' | 'sedan' | 'suv' | 'electric' | 'van' | 'luxury';

export interface RentalVehicle {
  id: ID;
  hostId: ID;
  make: string;
  model: string;
  year: number;
  type: VehicleType;
  seats: number;
  doors: number;
  transmission: 'automatic' | 'manual';
  fuel: 'petrol' | 'diesel' | 'electric' | 'hybrid';
  rangeKm?: number;
  pricePerDayCents: Cents;
  images: string[];
  location: string;
  features: string[];
  requirements: { minAge: number; licenseYears: number; depositCents: Cents };
  listed: boolean;
  blockedDates: ISODate[];
  rating: number;
  trips: number;
  createdAt: number;
}

export type BookingStatus = 'requested' | 'confirmed' | 'declined' | 'active' | 'completed' | 'cancelled';

export interface Rental {
  id: ID;
  reference: string;
  vehicleId: ID;
  renterId: ID;
  hostId: ID;
  pickupLocation: string;
  returnLocation: string;
  start: ISODate;
  end: ISODate;
  days: number;
  totalCents: Cents;
  status: BookingStatus;
  paymentTxId?: ID;
  createdAt: number;
}

export type PropertyType = 'apartment' | 'room' | 'house' | 'holiday_home' | 'studio';

export interface Property {
  id: ID;
  hostId: ID;
  title: string;
  type: PropertyType;
  city: string;
  country: string;
  neighbourhood: string;
  description: string;
  pricePerNightCents: Cents;
  cleaningFeeCents: Cents;
  guests: number;
  bedrooms: number;
  beds: number;
  baths: number;
  amenities: string[];
  images: string[];
  rating: number;
  reviewCount: number;
  instantBook: boolean;
  listed: boolean;
  blockedDates: ISODate[];
  createdAt: number;
}

export interface StayBooking {
  id: ID;
  reference: string;
  propertyId: ID;
  guestId: ID;
  hostId: ID;
  checkIn: ISODate;
  checkOut: ISODate;
  nights: number;
  guests: number;
  totalCents: Cents;
  status: BookingStatus;
  paymentTxId?: ID;
  createdAt: number;
}

export type ParcelSize = 'S' | 'M' | 'L' | 'XL';
export type DeliveryStatus = 'booked' | 'assigned' | 'picked_up' | 'in_transit' | 'delivered' | 'cancelled';

export interface Delivery {
  id: ID;
  trackingCode: string;
  senderId: ID;
  courierId: ID | null;
  pickup: string;
  dropoff: string;
  recipientName: string;
  recipientPhone: string;
  size: ParcelSize;
  weightKg: number;
  instructions: string;
  speed: 'standard' | 'express' | 'same_day';
  priceCents: Cents;
  status: DeliveryStatus;
  declinedBy: ID[];
  paymentTxId?: ID;
  createdAt: number;
  timeline: { status: DeliveryStatus; at: number }[];
}

/* --------------------------------------------------- Social & business -- */

export interface Thread {
  id: ID;
  participantIds: ID[];
  context?: { kind: 'product' | 'property' | 'vehicle' | 'restaurant' | 'order' | 'support'; id: ID; title: string };
  lastMessageAt: number;
}

export interface Message {
  id: ID;
  threadId: ID;
  senderId: ID;
  body: string;
  createdAt: number;
  readBy: ID[];
}

export type NotificationKind =
  | 'order'
  | 'sale'
  | 'delivery'
  | 'ride'
  | 'rental'
  | 'stay'
  | 'payment'
  | 'refund'
  | 'message'
  | 'business'
  | 'security';

export interface Notification {
  id: ID;
  userId: ID;
  kind: NotificationKind;
  title: string;
  body: string;
  link?: string;
  read: boolean;
  createdAt: number;
}

export interface Review {
  id: ID;
  authorId: ID;
  targetKind: 'user' | 'restaurant' | 'property' | 'vehicle' | 'driver';
  targetId: ID;
  rating: number;
  text: string;
  createdAt: number;
}

/** Hayve Store: a registered business, verified by a Hayve admin. */
export interface Business {
  id: ID;
  ownerId: ID;
  legalName: string;
  tradingName: string;
  category: string;
  /** Chamber of Commerce / company registration number (e.g. KVK). */
  registrationNumber: string;
  vatNumber: string;
  address: { line1: string; city: string; postcode: string; country: string };
  website: string;
  description: string;
  logo?: string;
  banner?: string;
  /** Owner identity check (simulated document scan in this build). */
  ownerIdChecked: boolean;
  status: 'pending' | 'verified' | 'rejected';
  rejectionReason?: string;
  reviewedAt?: number;
  reviewedBy?: ID;
  payoutSchedule: 'daily' | 'weekly' | 'monthly';
  submittedAt: number;
  createdAt: number;
}

export interface Report {
  id: ID;
  reporterId: ID;
  targetKind: 'listing' | 'user' | 'review';
  targetId: ID;
  reason: string;
  status: 'open' | 'resolved' | 'dismissed';
  resolution?: string;
  resolvedBy?: ID;
  createdAt: number;
}

export interface Settings {
  feeTiers: import('./config').FeeTier[];
  waveBack: import('./config').WaveBackSettings;
  tapToPay?: import('./config').TapToPaySettings;
}

export type TapPayerMethod = 'card' | 'apple_pay' | 'google_pay' | 'hayve_card' | 'hayve_balance';

/** A contactless payment received on the user's phone (Tap to Pay). */
export interface TapPayment {
  id: ID;
  receiverId: ID;
  amountCents: Cents;
  feeCents: Cents;
  note: string;
  status: 'awaiting_tap' | 'pending' | 'available' | 'refunded' | 'cancelled' | 'failed';
  payerMethod?: TapPayerMethod;
  cardBrand?: string;
  last4?: string;
  /** Set when the payer is a Hayve user (balance, Hayve Card, matched card or QR claim). */
  payerUserId?: ID;
  txId?: ID;
  /** Payment partner reference (e.g. Stripe PaymentIntent id). */
  providerRef: string;
  receiptToken: string;
  waveBackCents?: Cents;
  waveBackClaimable?: boolean;
  createdAt: number;
  paidAt?: number;
  settleAt?: number;
  refundedAt?: number;
  failureReason?: string;
}

export interface HayveCard {
  id: ID;
  userId: ID;
  network: 'Visa';
  last4: string;
  expMonth: number;
  expYear: number;
  status: 'active' | 'frozen' | 'replaced';
  kind: 'virtual' | 'physical';
  physical?: { orderedAt: number; status: 'ordered' | 'shipped' | 'activated' };
  limits: { dailyCents: Cents; monthlyCents: Cents };
  blocks: { online: boolean; contactless: boolean; gambling: boolean };
  autoTopUp: { enabled: boolean; amountCents: Cents };
  wallets: { apple: boolean; google: boolean };
  pinSet: boolean;
  /** Issuer reference (e.g. Stripe Issuing card id). Full card numbers are never stored by Hayve. */
  issuerRef: string;
  createdAt: number;
}

export interface LinkedBank {
  userId: ID;
  holder: string;
  ibanLast4: string;
  bank: string;
  method: 'ideal_wero' | 'sepa_debit';
  mandateRef: string;
  linkedAt: number;
}

export interface WaveBackBoost {
  id: ID;
  merchant: string;
  rate: number;
  startsAt: number;
  endsAt: number;
  createdBy: ID;
  createdAt: number;
}

export interface PaymentLink {
  id: ID;
  businessId: ID;
  title: string;
  amountCents: Cents;
  active: boolean;
  payments: number;
  createdAt: number;
}

export interface AuditEvent {
  id: ID;
  actorId: ID | null;
  action: string;
  target: string;
  createdAt: number;
}

export interface Database {
  version: number;
  users: User[];
  profiles: Profile[];
  addresses: Address[];
  paymentMethods: PaymentMethod[];
  products: Product[];
  favourites: Favourite[];
  savedProperties: { userId: ID; propertyId: ID; createdAt: number }[];
  wishlistItems: WishlistItem[];
  orders: Order[];
  /** PRIVATE table. Never returned to recipient-facing queries. */
  giftOrders: GiftOrder[];
  /** PRIVATE table. */
  giftReservations: GiftReservation[];
  accounts: Account[];
  entries: LedgerEntry[];
  transactions: Transaction[];
  moneyRequests: MoneyRequest[];
  rides: Ride[];
  drivers: DriverProfile[];
  couriers: CourierProfile[];
  restaurants: Restaurant[];
  menuItems: MenuItem[];
  foodOrders: FoodOrder[];
  vehicles: RentalVehicle[];
  rentals: Rental[];
  properties: Property[];
  stayBookings: StayBooking[];
  deliveries: Delivery[];
  threads: Thread[];
  messages: Message[];
  notifications: Notification[];
  reviews: Review[];
  businesses: Business[];
  paymentLinks: PaymentLink[];
  tapPayments: TapPayment[];
  cards: HayveCard[];
  linkedBanks: LinkedBank[];
  waveBackBoosts: WaveBackBoost[];
  reports: Report[];
  settings: Settings;
  audit: AuditEvent[];
}
