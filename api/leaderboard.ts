/**
 * GET /api/leaderboard?board=essence|species|era[&player=<id>]: top 50 plus the caller's own row.
 * Vercel Edge Function (Web Request/Response, bundled by Vercel, no dependencies).
 */
import { serviceFor } from '../server/env.js';

export const config = { runtime: 'edge' };

export default async function handler(req: Request): Promise<Response> {
  return serviceFor(req).leaderboard(req);
}
