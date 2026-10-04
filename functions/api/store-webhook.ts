/**
 * Cloudflare Pages Function: POST /api/store-webhook (Lemon Squeezy → verified grants).
 * Tiny adapter over api/store-webhook.ts; bindings (STORE_KV, secrets) arrive in `context.env`.
 * Setup and environment variables: docs/MONETIZACION.md §6.
 */
import { handleStoreWebhook, type StoreWebhookEnv } from '../../api/store-webhook';

export const onRequest = (context: { request: Request; env: StoreWebhookEnv }): Promise<Response> =>
  handleStoreWebhook(context.request, context.env);
