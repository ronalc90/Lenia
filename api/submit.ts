/**
 * POST /api/submit: a signed, proof-of-worked ranking submission (see server/protocol.ts).
 * Vercel Edge Function (Web Request/Response, bundled by Vercel, no dependencies).
 */
import { serviceFor } from '../server/env.js';

export const config = { runtime: 'edge' };

export default async function handler(req: Request): Promise<Response> {
  return serviceFor(req).submit(req);
}
