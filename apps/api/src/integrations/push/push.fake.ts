import { Logger } from '@nestjs/common';
import type { HealthStatus, PushMessage, PushProvider, PushResult } from '../ports';

/** Logs pushes and keeps them in memory. Tokens listed in `unregistered` answer DeviceNotRegistered. */
export class FakePushProvider implements PushProvider {
  readonly provider = 'fake';
  readonly sent: PushMessage[] = [];
  readonly unregistered = new Set<string>();
  private readonly log = new Logger('FakePushProvider');

  async send(messages: PushMessage[]): Promise<PushResult[]> {
    this.sent.push(...messages);
    messages.forEach((m) => this.log.log(`[push:fake] ${m.to} ${m.title} — ${m.body}`));
    return messages.map((m) =>
      this.unregistered.has(m.to) ? { token: m.to, ok: false, error: 'DeviceNotRegistered' } : { token: m.to, ok: true },
    );
  }

  async healthCheck(): Promise<HealthStatus> {
    return { ok: true, detail: 'fake' };
  }
}
