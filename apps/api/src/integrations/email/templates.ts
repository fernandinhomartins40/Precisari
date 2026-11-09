/**
 * pt-BR transactional e-mail templates (plain text + branded HTML).
 * HTML is table-based with inline styles so it renders in Gmail, Outlook and Apple Mail.
 * Images are served by the web app (apps/web/public/email) and must stay at these public URLs.
 */
import { formatBRL } from '@precisari/shared';
import { palette } from '@precisari/design-tokens';
import type { EmailMessage } from '../ports';

const BRAND = 'Precisari';
const SITE = 'https://www.precisari.com.br';
const C = {
  navy: palette.navy800,
  tangerine: palette.tangerine500,
  ivory: palette.ivory,
  muted: palette.slate600,
  line: palette.stone200,
};
const HEAD = `font-family:Manrope,'Segoe UI',Arial,sans-serif`;
const BODY = `font-family:Inter,'Segoe UI',Arial,sans-serif`;

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] ?? c);
}

const p = (html: string, style = ''): string => `<p style="margin:0 0 16px;font-size:16px;line-height:24px;color:${C.navy};${style}">${html}</p>`;

function button(href: string, label: string): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:8px 0 8px"><tr>
<td bgcolor="${C.tangerine}" style="border-radius:999px">
<a href="${escapeHtml(href)}" style="display:inline-block;padding:14px 28px;${HEAD};font-size:16px;font-weight:800;color:${C.navy};text-decoration:none;border-radius:999px">${escapeHtml(label)}</a>
</td></tr></table>`;
}

interface LayoutOptions {
  preheader: string;
  eyebrow: string;
  title: string;
  photo?: 'hero' | 'destino';
}

function layout(o: LayoutOptions, bodyHtml: string): string {
  const photo = o.photo
    ? `<tr><td style="padding:0"><img src="${SITE}/email/${o.photo}.jpg" width="600" alt="" style="display:block;width:100%;max-width:600px;height:auto;border:0"></td></tr>`
    : '';
  return `<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light"><meta name="supported-color-schemes" content="light"><title>${escapeHtml(o.title)}</title></head>
<body style="margin:0;padding:0;background:${C.ivory}">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent">${escapeHtml(o.preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${C.ivory}" style="background:${C.ivory}"><tr><td align="center" style="padding:24px 12px">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:600px;background:#FFFFFF;border-radius:20px;overflow:hidden">
<tr><td bgcolor="${C.navy}" style="background:${C.navy};padding:28px 32px">
<a href="${SITE}" style="text-decoration:none"><img src="${SITE}/email/logo-branca.png" width="160" height="36" alt="${BRAND}" style="display:block;border:0;width:160px;height:36px;${HEAD};font-size:22px;font-weight:800;color:#FFFFFF"></a>
</td></tr>
${photo}
<tr><td style="padding:36px 32px 12px;${BODY}">
<p style="margin:0 0 8px;${HEAD};font-size:13px;font-weight:800;letter-spacing:1.5px;text-transform:uppercase;color:${C.tangerine}">${escapeHtml(o.eyebrow)}</p>
<h1 style="margin:0 0 20px;${HEAD};font-size:28px;line-height:34px;font-weight:800;color:${C.navy}">${escapeHtml(o.title)}</h1>
${bodyHtml}
</td></tr>
<tr><td style="padding:12px 32px 32px;${BODY}">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td style="border-top:1px solid ${C.line};padding-top:20px">
<p style="margin:0 0 8px;${HEAD};font-size:15px;font-weight:800;color:${C.navy}">Preço certo, toda noite.</p>
<p style="margin:0;font-size:12px;line-height:18px;color:${C.muted}">Você recebeu este e-mail porque tem uma conta no ${BRAND}.<br>
<a href="${SITE}/privacidade" style="color:${C.muted}">Privacidade</a> · <a href="${SITE}/termos" style="color:${C.muted}">Termos</a> · <a href="${SITE}" style="color:${C.muted}">precisari.com.br</a></p>
</td></tr></table>
</td></tr>
</table>
</td></tr></table>
</body></html>`;
}

export function otpEmail(to: string, code: string, ttlMinutes = 10): EmailMessage {
  const subject = `Seu código de acesso: ${code}`;
  const text = `Seu código para entrar no ${BRAND} é ${code}.\n\nEle vale por ${ttlMinutes} minutos. Se não foi você, pode ignorar este e-mail.`;
  const html = layout(
    { preheader: `${code} é o seu código. Vale por ${ttlMinutes} minutos.`, eyebrow: 'Acesso', title: 'Seu código chegou', photo: 'hero' },
    `${p('Digite o código abaixo no app ou no site para entrar na sua conta.')}
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:8px 0 24px"><tr>
<td align="center" bgcolor="${C.ivory}" style="background:${C.ivory};border-radius:16px;border-left:6px solid ${C.tangerine};padding:24px 12px">
<p style="margin:0;${HEAD};font-size:42px;line-height:48px;font-weight:800;letter-spacing:10px;color:${C.navy}">${escapeHtml(code)}</p>
<p style="margin:8px 0 0;${BODY};font-size:13px;color:${C.muted}">Vale por ${ttlMinutes} minutos</p>
</td></tr></table>
${p('Se não foi você, ignore este e-mail. Ninguém entra na sua conta sem este código.', `font-size:14px;line-height:20px;color:${C.muted}`)}`,
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

function stat(label: string, value: string, color: string): string {
  return `<td width="50%" valign="top" bgcolor="${C.ivory}" style="background:${C.ivory};border-radius:16px;padding:18px 20px">
<p style="margin:0 0 4px;${BODY};font-size:13px;color:${C.muted}">${label}</p>
<p style="margin:0;${HEAD};font-size:28px;line-height:32px;font-weight:800;color:${color}">${value}</p></td>`;
}

export function weeklySummaryEmail(to: string, data: WeeklySummaryData): EmailMessage {
  const hello = data.userName ? `Oi, ${data.userName.split(' ')[0]}!` : 'Oi!';
  const totalPending = data.properties.reduce((s, x) => s + x.pendingGain, 0);
  const totalApproved = data.properties.reduce((s, x) => s + x.approvedGain, 0);
  const signed = (v: number): string => formatBRL(v, { whole: true, signed: true });
  const subject = totalPending > 0 ? `Sua semana no ${BRAND}: ${signed(totalPending)} esperando por você` : `Sua semana no ${BRAND}`;

  const lines: string[] = [hello, '', `Resumo da semana (${data.weekLabel}):`, ''];
  for (const x of data.properties) {
    lines.push(`• ${x.name}`);
    lines.push(`  ${x.approvedCount} ajuste(s) aprovado(s) · ${signed(x.approvedGain)} estimado`);
    lines.push(`  ${x.pendingCount} ajuste(s) pendente(s) · ${signed(x.pendingGain)} em jogo`);
    for (const h of x.highlights) lines.push(`  – ${brDate(h.date)}: ${h.headline} (${formatBRL(h.toValue, { whole: true })})`);
    lines.push('');
  }
  lines.push(`Abra o app para revisar: ${data.appUrl}`);

  const propsHtml = data.properties
    .map(
      (x) => `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 12px"><tr>
<td style="border:1px solid ${C.line};border-radius:16px;padding:18px 20px;${BODY}">
<p style="margin:0 0 8px;${HEAD};font-size:17px;font-weight:800;color:${C.navy}">${escapeHtml(x.name)}</p>
<p style="margin:0 0 4px;font-size:14px;color:${C.navy}">${x.approvedCount} aprovado(s) · <b>${signed(x.approvedGain)}</b></p>
<p style="margin:0 0 ${x.highlights.length ? 10 : 0}px;font-size:14px;color:${C.navy}">${x.pendingCount} pendente(s) · <b style="color:${C.tangerine}">${signed(x.pendingGain)}</b></p>
${x.highlights.map((h) => `<p style="margin:4px 0 0;font-size:13px;line-height:19px;color:${C.muted}"><b style="color:${C.navy}">${brDate(h.date)}</b> · ${escapeHtml(h.headline)} · ${formatBRL(h.toValue, { whole: true })}</p>`).join('')}
</td></tr></table>`,
    )
    .join('');
  const html = layout(
    { preheader: `${signed(totalPending)} em ajustes esperando por você.`, eyebrow: data.weekLabel, title: 'Sua semana em números', photo: 'destino' },
    `${p(`${escapeHtml(hello)} Aqui vai o que aconteceu com seus preços nesta semana.`)}
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 20px"><tr>
${stat('Aprovado', signed(totalApproved), C.navy)}<td width="12" style="font-size:0">&nbsp;</td>${stat('Esperando você', signed(totalPending), C.tangerine)}
</tr></table>
${propsHtml}
${button(data.appUrl, 'Revisar ajustes')}`,
  );
  return { to, subject, text: lines.join('\n'), html };
}

export function icalBrokenEmail(to: string, data: { propertyName: string; appUrl: string }): EmailMessage {
  const subject = `O calendário de "${data.propertyName}" parou de sincronizar`;
  const text = `Não conseguimos ler o link do calendário (iCal) de "${data.propertyName}".\n\nSem ele, não sabemos quais noites estão ocupadas e as sugestões podem ficar erradas. Copie o link de novo no Airbnb e cole no app: ${data.appUrl}`;
  const html = layout(
    { preheader: 'Reconecte o calendário para manter as sugestões certas.', eyebrow: 'Atenção', title: 'Seu calendário parou de sincronizar' },
    `${p(`Não conseguimos ler o link do calendário (iCal) de <b>${escapeHtml(data.propertyName)}</b>.`)}
${p('Sem ele, não sabemos quais noites estão ocupadas e as sugestões de preço podem ficar erradas. Copie o link de novo no Airbnb e cole no app: leva um minuto.')}
${button(data.appUrl, 'Reconectar calendário')}`,
  );
  return { to, subject, text, html };
}
