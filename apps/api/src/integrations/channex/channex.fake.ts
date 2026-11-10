import type { ChannexBookingRevision, ChannexConnectInput, ChannexIds, ChannexProvider, ChannexRate, HealthStatus } from '../ports';

/** In-memory channel manager for dev/tests. */
export class FakeChannexProvider implements ChannexProvider {
  readonly provider = 'fake';
  readonly pushed: { channexPropertyId: string; rates: ChannexRate[] }[] = [];
  readonly connected: ChannexConnectInput[] = [];
  /** Tests queue revisions here; ack removes them. */
  readonly revisions: ChannexBookingRevision[] = [];
  readonly deleted: string[] = [];
  /** Dev/tests: every property counts as linked to Airbnb unless listed here. */
  readonly unlinked = new Set<string>();

  async connectProperty(input: ChannexConnectInput): Promise<ChannexIds> {
    this.connected.push(input);
    return { channexPropertyId: `fake-channex-${input.propertyId}`, roomTypeId: `fake-room-${input.propertyId}`, ratePlanId: `fake-rate-${input.propertyId}` };
  }

  async connectUrl(channexPropertyId: string): Promise<string> {
    return `about:blank#channex-${channexPropertyId}`;
  }

  async hasActiveChannel(channexPropertyId: string): Promise<boolean> {
    return !this.unlinked.has(channexPropertyId);
  }

  async pushRates(ids: { channexPropertyId: string }, rates: ChannexRate[]): Promise<void> {
    this.pushed.push({ channexPropertyId: ids.channexPropertyId, rates });
  }

  async bookingRevisions(): Promise<ChannexBookingRevision[]> {
    return [...this.revisions];
  }

  async ackRevision(id: string): Promise<void> {
    const i = this.revisions.findIndex((r) => r.id === id);
    if (i >= 0) this.revisions.splice(i, 1);
  }

  async deleteProperty(channexPropertyId: string): Promise<void> {
    this.deleted.push(channexPropertyId);
  }

  async healthCheck(): Promise<HealthStatus> {
    return { ok: true, detail: 'fake' };
  }
}
