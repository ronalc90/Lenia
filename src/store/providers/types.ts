/**
 * Payment provider contract. One implementation per platform; the store controller
 * (src/store/store.ts) picks the first available one for the current host (flags.ts).
 *
 * Providers never grant anything themselves except the dev mock: a real purchase ends with the
 * server's snapshot (webhook- or receipt-verified) applied to Entitlements.
 */
import type { Text } from '../../core/types';
import type { Entitlements } from '../entitlements';
import type { ServerSnapshot } from '../protocol';

export type ProviderId = 'lemonsqueezy' | 'googleplay' | 'apple' | 'steam' | 'devmock';

export type FailReason =
  | 'cancelled' // the player closed the checkout
  | 'pending' // payment started but not confirmed yet (slow card, cash voucher...): restore later
  | 'unavailable' // provider not usable here
  | 'disabled' // STORE flags forbid it
  | 'not_for_sale' // unknown item, free item, early access...
  | 'owned'
  | 'network'
  | 'error';

export type Result =
  | { ok: true; itemId?: string; /** Cosmetic ids now owned thanks to this call. */ granted: string[]; message?: Text }
  | { ok: false; reason: FailReason; message?: string };

export interface PurchaseOptions {
  /** Abort a checkout the UI no longer waits for (resolves 'cancelled'). */
  signal?: AbortSignal;
}

export interface PaymentProvider {
  readonly id: ProviderId;
  /** Shown in the store footer ("Pago seguro con …"). */
  readonly label: Text;
  /** Seller of record line for the legal footer. */
  readonly seller?: Text;
  /** Sandbox / fake purchases. The UI shows a banner when true. */
  readonly testMode: boolean;
  available(): boolean;
  purchase(itemId: string, opts?: PurchaseOptions): Promise<Result>;
  restore(): Promise<Result>;
  manageSubscription?(): void;
  /** Store-localised price ("COP 8.900", "$1.99") when the provider knows it. */
  priceLabel?(itemId: string): string | null;
  /** Load localised prices etc. before showing the store (optional). */
  prepare?(): Promise<void>;
}

/** Player identity for signed API calls (implemented by src/net with the ranking keys). */
export interface PlayerIdentity {
  playerId(): Promise<string>;
  /** base64url raw P-256 public key (server/protocol.ts format). */
  publicKey(): Promise<string>;
  /** base64url IEEE-P1363 signature of the UTF-8 bytes of `message`. */
  sign(message: string): Promise<string>;
}

/** Shared dependencies handed to providers. */
export interface ProviderContext {
  entitlements: Entitlements;
  /** Fetch the authoritative snapshot (signed GET /api/entitlements). null when offline/unsupported. */
  fetchSnapshot?: () => Promise<ServerSnapshot | null>;
  /** Open an https URL outside the game (platform.openExternal). */
  openExternal?: (url: string) => void;
  now?: () => number;
}

export const ok = (granted: string[], itemId?: string): Result => ({ ok: true, granted, itemId });
export const fail = (reason: FailReason, message?: string): Result => ({ ok: false, reason, message });
