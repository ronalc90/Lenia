/**
 * Cloudflare Pages Function: GET/OPTIONS /api/entitlements (the player's signed store state).
 * Tiny adapter over api/entitlements.ts; bindings (STORE_KV, STORE_ALLOWED_ORIGINS) arrive in `context.env`.
 * Setup and environment variables: docs/MONETIZACION.md §6.
 */
import { handleEntitlements, type EntitlementsEnv } from '../../api/entitlements';

export const onRequest = (context: { request: Request; env: EntitlementsEnv }): Promise<Response> =>
  handleEntitlements(context.request, context.env);
