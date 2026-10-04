/**
 * Provider factory: builds the providers the flags allow, in the host's preference order.
 */
import type { StoreFlags } from '../flags';
import { AppleProvider } from './apple';
import { DevMockProvider, type DevMockOptions } from './devmock';
import { GooglePlayProvider } from './googleplay';
import { LemonSqueezyProvider, type LemonSqueezyConfig } from './lemonsqueezy';
import { SteamProvider } from './steam';
import type { PaymentProvider, PlayerIdentity, ProviderContext } from './types';

export type { PaymentProvider, PlayerIdentity, ProviderContext, ProviderId, Result, FailReason } from './types';
export { DevMockProvider } from './devmock';
export { LemonSqueezyProvider } from './lemonsqueezy';
export { GooglePlayProvider, playProductFor } from './googleplay';
export { SteamProvider } from './steam';
export { AppleProvider } from './apple';

export interface ProvidersConfig {
  /** Player key (src/net). Without it only the mock can work. */
  identity?: PlayerIdentity | null;
  /** Lemon Squeezy store + checkout links (live and test links differ). */
  lemonsqueezy?: Pick<LemonSqueezyConfig, 'store' | 'checkouts'> & Partial<Pick<LemonSqueezyConfig, 'overlay' | 'lemonJsUrl' | 'pollEveryMs' | 'pollForMs'>>;
  googleplay?: { packageName?: string };
  steam?: { dlc?: Record<string, number> };
  devmock?: Partial<Omit<DevMockOptions, 'enabled'>>;
}

export function createProviders(flags: StoreFlags, ctx: ProviderContext, cfg: ProvidersConfig = {}): PaymentProvider[] {
  if (!flags.visible) return [];
  const live = flags.payments || flags.testMode;
  const identity = cfg.identity ?? null;
  const out: PaymentProvider[] = [];
  for (const id of flags.providers) {
    switch (id) {
      case 'devmock':
        if (flags.mock) out.push(new DevMockProvider(ctx, { ...cfg.devmock, enabled: true }));
        break;
      case 'lemonsqueezy':
        if (cfg.lemonsqueezy && !flags.mock) {
          out.push(new LemonSqueezyProvider(ctx, { ...cfg.lemonsqueezy, enabled: live, testMode: !flags.payments, identity }));
        }
        break;
      case 'googleplay':
        if (!flags.mock) out.push(new GooglePlayProvider(ctx, { enabled: live, testMode: !flags.payments, identity, packageName: cfg.googleplay?.packageName }));
        break;
      case 'steam':
        if (!flags.mock) out.push(new SteamProvider(ctx, { enabled: flags.payments, dlc: cfg.steam?.dlc }));
        break;
      case 'apple':
        if (!flags.mock) out.push(new AppleProvider(ctx, { enabled: live, testMode: !flags.payments, identity }));
        break;
    }
  }
  return out;
}
