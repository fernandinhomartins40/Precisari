import { z } from 'zod';
import { fetchJson, type FetchFn } from '../common/http';
import type { EmailMessage, EmailSender, HealthStatus } from '../ports';

export const ResendSendResponse = z.object({ id: z.string() });

/** Resend transactional e-mail (https://resend.com/docs/api-reference/emails/send-email). */
export class ResendEmailSender implements EmailSender {
  readonly provider = 'resend';
  static readonly URL = 'https://api.resend.com/emails';

  constructor(
    private readonly apiKey: string,
    private readonly from: string,
    private readonly fetchFn?: FetchFn,
  ) {}

  async send(msg: EmailMessage): Promise<void> {
    await fetchJson('email', ResendEmailSender.URL, ResendSendResponse, {
      method: 'POST',
      headers: { authorization: `Bearer ${this.apiKey}` },
      body: { from: this.from, to: [msg.to], subject: msg.subject, text: msg.text, ...(msg.html ? { html: msg.html } : {}) },
      fetchFn: this.fetchFn,
      timeoutMs: 10_000,
    });
  }

  async healthCheck(): Promise<HealthStatus> {
    // No free "ping" endpoint that does not send mail; report configuration only.
    return { ok: this.apiKey.length > 0, detail: this.apiKey ? 'configurado' : 'RESEND_API_KEY ausente' };
  }
}
