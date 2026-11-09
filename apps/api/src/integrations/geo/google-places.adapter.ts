import { z } from 'zod';
import { BrazilState } from '@precisari/shared';
import { fetchJson, IntegrationError, type FetchFn } from '../common/http';
import { TtlCache } from '../common/ttl-cache';
import type { GeoProvider, HealthStatus, PlaceDetails, PlaceSuggestion } from '../ports';
import { inferDestinationType } from './destination-type';

/** Places API (New): https://developers.google.com/maps/documentation/places/web-service/place-autocomplete */
export const GoogleAutocompleteResponse = z.object({
  suggestions: z
    .array(
      z.object({
        placePrediction: z
          .object({
            placeId: z.string(),
            text: z.object({ text: z.string() }),
          })
          .optional(),
      }),
    )
    .default([]),
});

export const GooglePlaceDetailsResponse = z.object({
  id: z.string(),
  formattedAddress: z.string(),
  location: z.object({ latitude: z.number(), longitude: z.number() }),
  addressComponents: z
    .array(z.object({ longText: z.string(), shortText: z.string(), types: z.array(z.string()) }))
    .default([]),
});

export class GooglePlacesGeoProvider implements GeoProvider {
  readonly provider = 'google';
  static readonly BASE = 'https://places.googleapis.com/v1';
  private readonly autocompleteCache = new TtlCache<PlaceSuggestion[]>(1000, 6 * 3600_000);
  private readonly detailsCache = new TtlCache<PlaceDetails>(2000, 7 * 24 * 3600_000);

  constructor(
    private readonly apiKey: string,
    private readonly fetchFn?: FetchFn,
  ) {}

  async autocomplete(query: string, sessionToken?: string): Promise<PlaceSuggestion[]> {
    const q = query.trim();
    const key = q.toLowerCase();
    const cached = this.autocompleteCache.get(key);
    if (cached) return cached;
    const res = await fetchJson('geo', `${GooglePlacesGeoProvider.BASE}/places:autocomplete`, GoogleAutocompleteResponse, {
      method: 'POST',
      headers: { 'X-Goog-Api-Key': this.apiKey },
      body: { input: q, includedRegionCodes: ['br'], languageCode: 'pt-BR', regionCode: 'br', ...(sessionToken ? { sessionToken } : {}) },
      fetchFn: this.fetchFn,
      timeoutMs: 5_000,
    });
    const out = res.suggestions.flatMap((s) =>
      s.placePrediction ? [{ placeId: s.placePrediction.placeId, description: s.placePrediction.text.text }] : [],
    );
    this.autocompleteCache.set(key, out);
    return out;
  }

  async details(placeId: string, sessionToken?: string): Promise<PlaceDetails> {
    const cached = this.detailsCache.get(placeId);
    if (cached) return cached;
    const params = new URLSearchParams({ languageCode: 'pt-BR', regionCode: 'br', ...(sessionToken ? { sessionToken } : {}) });
    const res = await fetchJson(
      'geo',
      `${GooglePlacesGeoProvider.BASE}/places/${encodeURIComponent(placeId)}?${params.toString()}`,
      GooglePlaceDetailsResponse,
      {
        headers: { 'X-Goog-Api-Key': this.apiKey, 'X-Goog-FieldMask': 'id,formattedAddress,location,addressComponents' },
        fetchFn: this.fetchFn,
        timeoutMs: 5_000,
      },
    );
    const comp = (type: string) => res.addressComponents.find((c) => c.types.includes(type));
    const country = comp('country');
    if (country && country.shortText !== 'BR') throw new IntegrationError('geo', 'place outside Brazil', 422);
    const city = (comp('administrative_area_level_2') ?? comp('locality'))?.longText;
    const stateParsed = BrazilState.safeParse(comp('administrative_area_level_1')?.shortText);
    if (!city || !stateParsed.success) throw new IntegrationError('geo', 'place without city/state', 422);
    const details: PlaceDetails = {
      placeId: res.id,
      address: res.formattedAddress,
      lat: res.location.latitude,
      lng: res.location.longitude,
      city,
      state: stateParsed.data,
      ibgeCode: null, // Google does not return IBGE codes; resolved by curation when needed.
      suggestedDestinationType: inferDestinationType({ city, state: stateParsed.data, address: res.formattedAddress }),
    };
    this.detailsCache.set(placeId, details);
    return details;
  }

  async healthCheck(): Promise<HealthStatus> {
    // Every Places call is billed: report configuration only.
    return { ok: this.apiKey.length > 0, detail: this.apiKey ? 'configurado' : 'GOOGLE_MAPS_API_KEY ausente' };
  }
}
