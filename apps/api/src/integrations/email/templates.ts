/**
 * pt-BR transactional e-mail templates (plain text + minimal inline HTML).
 * User-facing copy lives here (single place, easy to move to an i18n catalog later).
 */
import { formatBRL } from '@precisari/shared';
import type { EmailMessage } from '../ports';

const BRAND = 'Precisari';

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] ?? c);
}

function layout(title: string, bodyHtml: string): string {
  return `<!doctype html><html lang="pt-BR"><body style="margin:0;background:#F7F5F0;font-family:Inter,Arial,sans-serif;color:#162B49">
<div style="max-width:520px;margin:0 auto;padding:32px 24px">
<p style="font-family:Manrope,Arial,sans-serif;font-weight:800;font-size:20px;margin:0 0 24px">${BRAND}</p>
<h1 style="font-family:Manrope,Arial,sans-serif;font-size:22px;margin:0 0 16px">${escapeHtml(title)}</h1>
${bodyHtml}
<p style="font-size:12px;color:#5b6b80;margin-top:32px">Você recebeu este e-mail porque tem uma conta no ${BRAND}.</p>
</div></body></html>`;
}

export function otpEmail(to: string, code: string, ttlMinutes = 10): EmailMessage {
  const subject = `Seu código de acesso: ${code}`;
  const text = `Seu código para entrar no ${BRAND} é ${code}.\n\nEle vale por ${ttlMinutes} minutos. Se não foi você, pode ignorar este e-mail.`;
  const html = layout(
    'Seu código de acesso',
    `<p style="font-size:15px">Use o código abaixo para entrar. Ele vale por ${ttlMinutes} minutos.</p>
<p style="font-family:Manrope,Arial,sans-serif;font-size:36px;font-weight:800;letter-spacing:8px;margin:24px 0">${escapeHtml(code)}</p>
<p style="font-size:13px;color:#5b6b80">Se não foi você, pode ignorar este e-mail.</p>`,
  );
  return { to, subject, text, html };
}

export interface WeeklySummaryProperty {
  name: string;
  approvedCount: number;
  approvedGain: number;
  pendingCount: number;
  pendingGain: number;
  highlights: { date: string; headline: string; toValue: number }[];
}

export interface WeeklySummaryData {
  userName: string | null;
  weekLabel: string;
  properties: WeeklySummaryProperty[];
  appUrl: string;
}

function brDate(iso: string): string {
  const [, m, d] = iso.split('-');
  return `${d}/${m}`;
}

export function weeklySummaryEmail(to: string, data: WeeklySummaryData): EmailMessage {
  const hello = data.userName ? `Oi, ${data.userName.split(' ')[0]}!` : 'Oi!';
  const totalPending = data.properties.reduce((s, p) => s + p.pendingGain, 0);
  const totalApproved = data.properties.reduce((s, p) => s + p.approvedGain, 0);
  const subject =
    totalPending > 0
      ? `Sua semana no ${BRAND}: ${formatBRL(totalPending, { whole: true, signed: true })} esperando por você`
      : `Sua semana no ${BRAND}`;

  const lines: string[] = [hello, '', `Resumo da semana (${data.weekLabel}):`, ''];
  for (const p of data.properties) {
    lines.push(`• ${p.name}`);
    lines.push(`  ${p.approvedCount} ajuste(s) aprovado(s) · ${formatBRL(p.approvedGain, { whole: true, signed: true })} estimado`);
    lines.push(`  ${p.pendingCount} ajuste(s) pendente(s) · ${formatBRL(p.pendingGain, { whole: true, signed: true })} em jogo`);
    for (const h of p.highlights) lines.push(`  – ${brDate(h.date)}: ${h.headline} (${formatBRL(h.toValue, { whole: true })})`);
    lines.push('');
  }
  lines.push(`Abra o app para revisar: ${data.appUrl}`);

  const propsHtml = data.properties
    .map(
      (p) => `<div style="background:#fff;border-radius:12px;padding:16px;margin:12px 0">
<p style="font-weight:700;margin:0 0 8px">${escapeHtml(p.name)}</p>
<p style="margin:4px 0">${p.approvedCount} aprovado(s) · <b>${formatBRL(p.approvedGain, { whole: true, signed: true })}</b></p>
<p style="margin:4px 0">${p.pendingCount} pendente(s) · <b style="color:#FF8845">${formatBRL(p.pendingGain, { whole: true, signed: true })}</b></p>
${p.highlights.map((h) => `<p style="margin:4px 0;font-size:13px">${brDate(h.date)} — ${escapeHtml(h.headline)} (${formatBRL(h.toValue, { whole: true })})</p>`).join('')}
</div>`,
    )
    .join('');
  const html = layout(
    'Sua semana',
    `<p>${escapeHtml(hello)} Aqui vai o resumo de ${escapeHtml(data.weekLabel)}.</p>
<p style="font-size:15px">Aprovado: <b>${formatBRL(totalApproved, { whole: true, signed: true })}</b> · Pendente: <b style="color:#FF8845">${formatBRL(totalPending, { whole: true, signed: true })}</b></p>
${propsHtml}
<p><a href="${escapeHtml(data.appUrl)}" style="display:inline-block;background:#FF8845;color:#162B49;padding:12px 20px;border-radius:999px;text-decoration:none;font-weight:700">Revisar ajustes</a></p>`,
  );
  return { to, subject, text: lines.join('\n'), html };
}

export function icalBrokenEmail(to: string, data: { propertyName: string; appUrl: string }): EmailMessage {
  const subject = `O calendário de "${data.propertyName}" parou de sincronizar`;
  const text = `Não conseguimos ler o link do calendário (iCal) de "${data.propertyName}".\n\nSem ele, não sabemos quais noites estão ocupadas e as sugestões podem ficar erradas. Copie o link de novo no Airbnb e cole no app: ${data.appUrl}`;
  const html = layout(
    'Calendário fora do ar',
    `<p>Não conseguimos ler o link do calendário (iCal) de <b>${escapeHtml(data.propertyName)}</b>.</p>
<p>Sem ele, não sabemos quais noites estão ocupadas e as sugestões podem ficar erradas.</p>
<p><a href="${escapeHtml(data.appUrl)}" style="display:inline-block;background:#FF8845;color:#162B49;padding:12px 20px;border-radius:999px;text-decoration:none;font-weight:700">Reconectar calendário</a></p>`,
  );
  return { to, subject, text, html };
}
