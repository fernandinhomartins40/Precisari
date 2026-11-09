/** Minimal fake adapters (dev/test). Expanded per integration in src/integrations/<name>/. */
import { Logger } from '@nestjs/common';
import type {
  BillingProvider, ChannexProvider, EmailSender, GeoProvider, HolidaysProvider, LlmProvider, PushProvider, WeatherProvider,
} from './ports';

const log = new Logger('FakeAdapters');

export class FakeEmailSender implements EmailSender {
  readonly sent: { to: string; subject: string; text: string }[] = [];
  async send(msg: { to: string; subject: string; text: string }): Promise<void> {
    this.sent.push(msg);
    log.log(`[email:fake] to=${msg.to} subject="${msg.subject}"\n${msg.text}`);
  }
}

export class FakeHolidaysProvider implements HolidaysProvider {
  async nationalHolidays(year: number) {
    return [
      { date: `${year}-01-01`, name: 'Confraternização mundial', type: 'national' },
      { date: `${year}-04-21`, name: 'Tiradentes', type: 'national' },
      { date: `${year}-05-01`, name: 'Dia do trabalho', type: 'national' },
      { date: `${year}-09-07`, name: 'Independência do Brasil', type: 'national' },
      { date: `${year}-10-12`, name: 'Nossa Senhora Aparecida', type: 'national' },
      { date: `${year}-11-02`, name: 'Finados', type: 'national' },
      { date: `${year}-11-15`, name: 'Proclamação da República', type: 'national' },
      { date: `${year}-11-20`, name: 'Dia da consciência negra', type: 'national' },
      { date: `${year}-12-25`, name: 'Natal', type: 'national' },
    ];
  }
}

export class FakeWeatherProvider implements WeatherProvider {
  async forecast(_lat: number, _lng: number, opts: { days?: number; pastDays?: number } = {}) {
    const days = opts.days ?? 16;
    const past = opts.pastDays ?? 0;
    const today = Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), new Date().getUTCDate());
    return Array.from({ length: days + past }, (_, i) => {
      const date = new Date(today + (i - past) * 86_400_000).toISOString().slice(0, 10);
      return { date, precipProb: (i * 37) % 100, precipMm: ((i * 37) % 100) / 10, tempMin: 18, tempMax: 27 };
    });
  }
}

export class FakeGeoProvider implements GeoProvider {
  async autocomplete(query: string) {
    return [{ placeId: 'fake-campeche', description: `${query} — Campeche, Florianópolis - SC` }];
  }
  async details(placeId: string) {
    return {
      placeId, address: 'Av. Campeche, 1000 - Campeche, Florianópolis - SC', lat: -27.6789, lng: -48.4867,
      city: 'Florianópolis', state: 'SC', ibgeCode: '4205407', suggestedDestinationType: 'BEACH' as const,
    };
  }
}

export class FakeLlmProvider implements LlmProvider {
  readonly model = 'fake';
  async explain(input: Parameters<LlmProvider['explain']>[0]) {
    const top = [...input.factors].sort((a, b) => Math.abs(b.multiplier - 1) - Math.abs(a.multiplier - 1))[0];
    const up = input.toPrice >= input.fromPrice;
    return {
      headline: up ? `${input.weekdayLabel} tá disputado` : `${input.weekdayLabel} pede um preço mais leve`,
      text: top ? `${top.label} ${up ? 'aumenta' : 'reduz'} a procura pelo seu imóvel.` : 'Ajuste fino com base no seu histórico.',
    };
  }
  async classifyEvent() {
    return { size: 'M' as const, radiusKm: 5, confidence: 0.5 };
  }
}

export class FakePushProvider implements PushProvider {
  readonly sent: { to: string; title: string; body: string }[] = [];
  async send(messages: { to: string; title: string; body: string }[]) {
    this.sent.push(...messages);
    messages.forEach((m) => log.log(`[push:fake] ${m.to} ${m.title} — ${m.body}`));
    return messages.map((m) => ({ token: m.to, ok: true }));
  }
}

export class FakeBillingProvider implements BillingProvider {
  readonly name = 'fake';
  async createCheckout(input: Parameters<BillingProvider['createCheckout']>[0]) {
    const id = `fake_${Date.now().toString(36)}`;
    return {
      checkoutId: id, providerRef: `sub_${id}`, status: 'PENDING' as const,
      redirectUrl: input.paymentMethod === 'CARD' ? `http://localhost:3000/checkout/fake/${id}` : null,
      pixQrCode: input.paymentMethod === 'PIX' ? 'data:image/png;base64,' : null,
      pixCopyPaste: input.paymentMethod === 'PIX' ? `00020126FAKEPIX${id}` : null,
      boletoUrl: input.paymentMethod === 'BOLETO' ? `http://localhost:3000/checkout/fake/${id}/boleto` : null,
      expiresAt: new Date(Date.now() + 3600_000).toISOString(),
    };
  }
  async parseWebhook(_headers: Record<string, string | string[] | undefined>, rawBody: string) {
    return JSON.parse(rawBody) as Awaited<ReturnType<BillingProvider['parseWebhook']>>;
  }
  async cancel() {}
}

export class FakeChannexProvider implements ChannexProvider {
  async connectProperty(input: { propertyId: string }) {
    return { channexPropertyId: `fake-channex-${input.propertyId}` };
  }
  async pushRates() {}
}
