import { z } from 'zod';
import { fetchJson, type FetchFn } from '../common/http';
import type { EmailMessage, EmailSender, HealthStatus } from '../ports';

export const VelomailSendResponse = z.union([
  z.object({ message_id: z.string() }).passthrough(),
  z.object({ messageId: z.string() }).passthrough(),
  z.object({ id: z.union([z.string(), z.number()]) }).passthrough(),
]);

/** VeloMail refuses `Name <address>` in `from`: the address and the display name go in separate fields. */
export function splitFrom(from: string): { from: string; from_name?: string } {
  const match = /^\s*"?([^"<]*?)"?\s*<([^>]+)>\s*$/.exec(from);
  if (!match?.[2]) return { from: from.trim() };
  const name = match[1]?.trim();
  return { from: match[2].trim(), ...(name ? { from_name: name } : {}) };
}

/** VeloMail transactional e-mail (POST /emails/send with a standard `re_...` API key). */
export class VelomailEmailSender implements EmailSender {
  readonly provider = 'velomail';

  constructor(
    private readonly apiKey: string,
    private readonly from: string,
    private readonly baseUrl: string,
    private readonly fetchFn?: FetchFn,
  ) {}

  async send(msg: EmailMessage): Promise<void> {
    await fetchJson('email', `${this.baseUrl.replace(/\/$/, '')}/emails/send`, VelomailSendResponse, {
      method: 'POST',
      headers: { 'x-api-key': this.apiKey },
      body: { ...splitFrom(this.from), to: msg.to, subject: msg.subject, text: msg.text, ...(msg.html ? { html: msg.html } : {}) },
      fetchFn: this.fetchFn,
      timeoutMs: 20_000,
    });
  }

  async healthCheck(): Promise<HealthStatus> {
    // No "ping" endpoint that does not send mail; report configuration only.
    return { ok: this.apiKey.length > 0, detail: this.apiKey ? 'configurado' : 'VELOMAIL_API_KEY ausente' };
  }
}
