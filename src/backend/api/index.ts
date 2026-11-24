/**
 * The Hayve API surface used by every screen.
 * Swap the implementation behind these namespaces for the Supabase adapter
 * (see docs/ARCHITECTURE.md) without touching UI code.
 */
export * as admin from './admin';
export * as bites from './bites';
export * as bookings from './bookings';
export * as business from './business';
export * as ride from './ride';
export * as holidays from './holidays';
export * as importer from './importer';
export * as send from './send';
export * as session from './session';
export * as shop from './shop';
export * as social from './social';
export * as wallet from './wallet';
export * as wishlist from './wishlist';
export { PAY_METHOD_LABEL, type PayMethod, type PublicUser } from './common';
export * as requests from './requests';
export * as regions from '../regions';
export * as revenue from './revenue';
