import type { ChannexProvider, ChannexRate, HealthStatus } from '../ports';

/** In-memory channel manager for dev/tests. */
export class FakeChannexProvider implements ChannexProvider {
  readonly provider = 'fake';
  readonly pushed: { channexPropertyId: string; rates: ChannexRate[] }[] = [];

  async connectProperty(input: { propertyId: string }): Promise<{ channexPropertyId: string }> {
    return { channexPropertyId: `fake-channex-${input.propertyId}` };
  }

  async pushRates(channexPropertyId: string, rates: ChannexRate[]): Promise<void> {
    this.pushed.push({ channexPropertyId, rates });
  }

  async healthCheck(): Promise<HealthStatus> {
    return { ok: true, detail: 'fake' };
  }
}
