/**
 * Curated STATE and MUNICIPAL holidays (BrasilAPI only covers national ones — PRD §9).
 * Seeded by DataSeedService for the current and next year; admins curate them in /admin/holidays (RF-81).
 * Entries marked `uncertain: true` must be double-checked against the state/municipal law before launch.
 * National holidays that coincide (e.g. MG 21/04, AP/CE São José where also municipal) are not repeated here.
 */
import type { BrazilState } from '@precisari/shared';
import { addDays, easterSunday } from '../integrations/common/text';

export type HolidayRule =
  | { fixed: `${number}-${number}`; name: string; uncertain?: boolean }
  | { easterOffset: number; name: string; uncertain?: boolean };

export const STATE_HOLIDAYS: Record<BrazilState, HolidayRule[]> = {
  AC: [
    { fixed: '01-23', name: 'Dia do Evangélico' },
    { fixed: '06-15', name: 'Aniversário do Acre' },
    { fixed: '09-05', name: 'Dia da Amazônia', uncertain: true },
    { fixed: '11-17', name: 'Assinatura do Tratado de Petrópolis' },
  ],
  AL: [
    { fixed: '06-24', name: 'São João' },
    { fixed: '06-29', name: 'São Pedro' },
    { fixed: '09-16', name: 'Emancipação Política de Alagoas' },
  ],
  AP: [
    { fixed: '03-19', name: 'Dia de São José' },
    { fixed: '09-13', name: 'Criação do Território Federal do Amapá' },
  ],
  AM: [{ fixed: '09-05', name: 'Elevação do Amazonas à categoria de Província' }],
  BA: [{ fixed: '07-02', name: 'Independência da Bahia' }],
  CE: [
    { fixed: '03-19', name: 'Dia de São José' },
    { fixed: '03-25', name: 'Data Magna do Ceará' },
  ],
  DF: [{ fixed: '11-30', name: 'Dia do Evangélico' }],
  // Nossa Senhora da Penha: Monday 8 days after Easter (state law) — confirm scope (state vs Vitória/Vila Velha).
  ES: [{ easterOffset: 8, name: 'Dia de Nossa Senhora da Penha', uncertain: true }],
  GO: [{ fixed: '07-26', name: 'Fundação da Cidade de Goiás', uncertain: true }],
  MA: [{ fixed: '07-28', name: 'Adesão do Maranhão à Independência' }],
  // MT: no state holiday besides national ones (20/11 became national in 2024).
  MT: [],
  MS: [{ fixed: '10-11', name: 'Criação do Estado de Mato Grosso do Sul' }],
  // MG: Data Magna (21/04) coincides with Tiradentes (national).
  MG: [],
  PA: [{ fixed: '08-15', name: 'Adesão do Grão-Pará à Independência' }],
  PB: [{ fixed: '08-05', name: 'Fundação do Estado da Paraíba' }],
  PR: [{ fixed: '12-19', name: 'Emancipação Política do Paraná' }],
  PE: [
    { fixed: '03-06', name: 'Data Magna de Pernambuco (Revolução Pernambucana)' },
    { fixed: '06-24', name: 'São João' },
  ],
  PI: [
    { fixed: '03-13', name: 'Dia da Batalha do Jenipapo' },
    { fixed: '10-19', name: 'Dia do Piauí' },
  ],
  RJ: [{ fixed: '04-23', name: 'Dia de São Jorge' }],
  RN: [{ fixed: '10-03', name: 'Mártires de Cunhaú e Uruaçu' }],
  RS: [{ fixed: '09-20', name: 'Revolução Farroupilha' }],
  RO: [
    { fixed: '01-04', name: 'Criação do Estado de Rondônia' },
    { fixed: '06-18', name: 'Dia do Evangélico' },
  ],
  RR: [{ fixed: '10-05', name: 'Criação do Estado de Roraima' }],
  // SC: Data Magna (11/08) — state law moves the celebration to the following Sunday in some years; confirm.
  SC: [
    { fixed: '08-11', name: 'Dia de Santa Catarina (Data Magna)', uncertain: true },
    { fixed: '11-25', name: 'Dia de Santa Catarina de Alexandria', uncertain: true },
  ],
  SP: [{ fixed: '07-09', name: 'Revolução Constitucionalista' }],
  SE: [{ fixed: '07-08', name: 'Emancipação Política de Sergipe' }],
  TO: [
    { fixed: '03-18', name: 'Autonomia do Estado do Tocantins' },
    { fixed: '09-08', name: 'Nossa Senhora da Natividade' },
    { fixed: '10-05', name: 'Criação do Estado do Tocantins' },
  ],
};

export interface MunicipalHolidaySet {
  city: string;
  state: BrazilState;
  ibgeCode: string;
  rules: HolidayRule[];
}

/** First launch cities (PRD §12 — to be confirmed). */
export const MUNICIPAL_HOLIDAYS: MunicipalHolidaySet[] = [
  {
    city: 'Florianópolis',
    state: 'SC',
    ibgeCode: '4205407',
    rules: [
      { fixed: '03-23', name: 'Aniversário de Florianópolis' },
      { easterOffset: 60, name: 'Corpus Christi' },
    ],
  },
  {
    city: 'Rio de Janeiro',
    state: 'RJ',
    ibgeCode: '3304557',
    rules: [{ fixed: '01-20', name: 'Dia de São Sebastião' }],
  },
  {
    city: 'São Paulo',
    state: 'SP',
    ibgeCode: '3550308',
    rules: [
      { fixed: '01-25', name: 'Aniversário de São Paulo' },
      { easterOffset: 60, name: 'Corpus Christi' },
    ],
  },
  {
    city: 'Salvador',
    state: 'BA',
    ibgeCode: '2927408',
    rules: [
      { fixed: '06-24', name: 'São João' },
      { fixed: '12-08', name: 'Nossa Senhora da Conceição da Praia' },
      { easterOffset: 60, name: 'Corpus Christi', uncertain: true },
    ],
  },
  {
    city: 'Gramado',
    state: 'RS',
    ibgeCode: '4309100',
    rules: [
      { fixed: '12-15', name: 'Aniversário de Gramado', uncertain: true },
      { easterOffset: 60, name: 'Corpus Christi', uncertain: true },
    ],
  },
];

/** Resolve a rule to a yyyy-mm-dd date in `year`. */
export function ruleDate(rule: HolidayRule, year: number): string {
  if ('fixed' in rule) return `${year}-${rule.fixed}`;
  return addDays(easterSunday(year), rule.easterOffset);
}
