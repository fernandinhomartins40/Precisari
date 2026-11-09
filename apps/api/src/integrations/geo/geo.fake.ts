import { IntegrationError } from '../common/http';
import { normalize } from '../common/text';
import type { GeoProvider, HealthStatus, PlaceDetails, PlaceSuggestion } from '../ports';
import { inferDestinationType } from './destination-type';

const PLACES: Omit<PlaceDetails, 'suggestedDestinationType'>[] = [
  { placeId: 'fake-campeche', address: 'Av. Campeche, 1000 - Campeche, Florianópolis - SC', lat: -27.6789, lng: -48.4867, city: 'Florianópolis', state: 'SC', ibgeCode: '4205407' },
  { placeId: 'fake-copacabana', address: 'Av. Atlântica, 1702 - Copacabana, Rio de Janeiro - RJ', lat: -22.9694, lng: -43.1806, city: 'Rio de Janeiro', state: 'RJ', ibgeCode: '3304557' },
  { placeId: 'fake-paulista', address: 'Av. Paulista, 1578 - Bela Vista, São Paulo - SP', lat: -23.5614, lng: -46.6559, city: 'São Paulo', state: 'SP', ibgeCode: '3550308' },
  { placeId: 'fake-barra', address: 'Av. Oceânica, 200 - Barra, Salvador - BA', lat: -13.0105, lng: -38.5326, city: 'Salvador', state: 'BA', ibgeCode: '2927408' },
  { placeId: 'fake-gramado', address: 'Av. Borges de Medeiros, 2500 - Centro, Gramado - RS', lat: -29.3787, lng: -50.8744, city: 'Gramado', state: 'RS', ibgeCode: '4309100' },
];

/** Deterministic geo provider with a few launch-city addresses. */
export class FakeGeoProvider implements GeoProvider {
  readonly provider = 'fake';

  async autocomplete(query: string): Promise<PlaceSuggestion[]> {
    const q = normalize(query);
    const hits = PLACES.filter((p) => normalize(`${p.address} ${p.city}`).includes(q));
    const list = hits.length > 0 ? hits : PLACES.slice(0, 1);
    return list.map((p) => ({ placeId: p.placeId, description: hits.length > 0 ? p.address : `${query} — ${p.address}` }));
  }

  async details(placeId: string): Promise<PlaceDetails> {
    const p = PLACES.find((x) => x.placeId === placeId);
    if (!p) throw new IntegrationError('geo', 'place not found', 404);
    return { ...p, suggestedDestinationType: inferDestinationType(p) };
  }

  async healthCheck(): Promise<HealthStatus> {
    return { ok: true, detail: 'fake' };
  }
}
