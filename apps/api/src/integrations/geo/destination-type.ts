/**
 * Simple heuristic to suggest a destination type from city/state/address (editable by the host at onboarding).
 * Lists are intentionally short and curated; extend as we learn. Matching is accent/case-insensitive.
 */
import type { DestinationType } from '@precisari/shared';
import { normalize } from '../common/text';

const MOUNTAIN_CITIES = [
  'gramado', 'canela', 'nova petropolis', 'sao francisco de paula', 'cambara do sul', 'bento goncalves',
  'campos do jordao', 'santo antonio do pinhal', 'sao bento do sapucai', 'monte verde', 'goncalves',
  'petropolis', 'teresopolis', 'nova friburgo', 'itatiaia', 'visconde de maua', 'penedo', 'lumiar',
  'urubici', 'sao joaquim', 'urupema', 'bom jardim da serra', 'domingos martins', 'venda nova do imigrante',
  'lavras novas', 'aiuruoca', 'serra negra', 'cunha', 'alto paraiso de goias', 'mucuge', 'lencois',
];

const BEACH_CITIES = [
  'florianopolis', 'balneario camboriu', 'bombinhas', 'porto belo', 'itapema', 'garopaba', 'imbituba',
  'governador celso ramos', 'navegantes', 'penha', 'sao francisco do sul', 'laguna',
  'ubatuba', 'ilhabela', 'caraguatatuba', 'sao sebastiao', 'guaruja', 'bertioga', 'santos', 'praia grande',
  'paraty', 'angra dos reis', 'armacao dos buzios', 'buzios', 'cabo frio', 'arraial do cabo', 'saquarema',
  'guarapari', 'itaunas', 'conceicao da barra', 'torres', 'capao da canoa', 'xangri-la', 'tramandai',
  'matinhos', 'guaratuba', 'pontal do parana', 'porto seguro', 'ilheus', 'itacare', 'marau', 'cairu',
  'mata de sao joao', 'prado', 'santa cruz cabralia', 'ipojuca', 'tamandare', 'maragogi', 'sao miguel dos milagres',
  'japaratinga', 'jijoca de jericoacoara', 'aracati', 'beberibe', 'paracuru', 'tibau do sul', 'touros',
  'fernando de noronha', 'barra de sao miguel', 'conde', 'barreirinhas', 'natal', 'maceio', 'joao pessoa',
  'fortaleza', 'aracaju', 'salvador', 'cabedelo', 'ilha comprida', 'peruibe', 'itanhaem', 'mongagua',
];

const CULTURAL_CITIES = [
  'ouro preto', 'tiradentes', 'mariana', 'diamantina', 'sao joao del-rei', 'sao joao del rei', 'congonhas',
  'olinda', 'pirenopolis', 'goias', 'sao luis', 'cachoeira',
  'laranjeiras', 'antonina', 'sao cristovao',
];

const CAPITALS = [
  'rio branco', 'maceio', 'macapa', 'manaus', 'salvador', 'fortaleza', 'brasilia', 'vitoria', 'goiania',
  'sao luis', 'cuiaba', 'campo grande', 'belo horizonte', 'belem', 'joao pessoa', 'curitiba', 'recife',
  'teresina', 'rio de janeiro', 'natal', 'porto alegre', 'porto velho', 'boa vista', 'florianopolis',
  'sao paulo', 'aracaju', 'palmas',
];

/** Big non-capital cities that behave as urban/business destinations. */
const URBAN_CITIES = ['campinas', 'guarulhos', 'sao bernardo do campo', 'ribeirao preto', 'uberlandia', 'joinville', 'londrina', 'sorocaba', 'niteroi'];

const BEACH_ADDRESS = ['praia', 'beira-mar', 'beira mar', 'orla', 'copacabana', 'ipanema', 'leblon', 'barra da tijuca', 'recreio dos bandeirantes', 'jurere', 'campeche'];
const MOUNTAIN_ADDRESS = ['serra ', 'serrana', 'montanha'];
const RURAL_ADDRESS = ['sitio', 'fazenda', 'chacara', 'zona rural', 'estrada vicinal', 'rodovia', 'linha ', 'km '];

export function inferDestinationType(input: { city: string; state?: string; address?: string }): DestinationType {
  const city = normalize(input.city);
  const address = normalize(input.address ?? '');

  if (MOUNTAIN_CITIES.includes(city)) return 'MOUNTAIN';
  if (CULTURAL_CITIES.includes(city)) return 'CULTURAL';
  // Rio de Janeiro and other coastal capitals: beach only for beach neighborhoods/streets.
  if (BEACH_ADDRESS.some((k) => address.includes(k))) return 'BEACH';
  if (BEACH_CITIES.includes(city)) return 'BEACH';
  if (CAPITALS.includes(city) || URBAN_CITIES.includes(city)) return 'URBAN';
  if (MOUNTAIN_ADDRESS.some((k) => address.includes(k)) || city.startsWith('serra')) return 'MOUNTAIN';
  if (RURAL_ADDRESS.some((k) => address.includes(k))) return 'RURAL';
  return 'URBAN';
}
