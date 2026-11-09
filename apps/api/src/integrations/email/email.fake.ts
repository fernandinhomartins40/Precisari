import { Logger } from '@nestjs/common';
import type { EmailMessage, EmailSender, HealthStatus } from '../ports';

/** Logs e-mails (OTP codes appear in the dev log) and keeps them in memory for tests. */
export class FakeEmailSender implements EmailSender {
  readonly provider = 'fake';
  readonly sent: EmailMessage[] = [];
  private readonly log = new Logger('FakeEmailSender');

  async send(msg: EmailMessage): Promise<void> {
    this.sent.push(msg);
    this.log.log(`[email:fake] to=${msg.to} subject="${msg.subject}"\n${msg.text}`);
  }

  async healthCheck(): Promise<HealthStatus> {
    return { ok: true, detail: 'fake' };
  }
}
