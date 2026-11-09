import { Controller, Get, Inject, Param, Query, UseGuards } from '@nestjs/common';
import { z } from 'zod';
import type { PlaceDetailsDto, PlaceSuggestionDto } from '@precisari/shared';
import { JwtAuthGuard } from '../auth/guards';
import { ZodPipe } from '../common/zod.pipe';
import { GEO_PROVIDER, type GeoProvider } from '../integrations/ports';
import { toAppError } from '../integrations/common/errors';

const AutocompleteQuery = z.object({
  q: z.string().trim().min(2).max(200),
  sessionToken: z.string().max(100).optional(),
});
const PlaceIdParam = z.string().trim().min(1).max(300);

/** Address autocomplete for onboarding (Google Places behind GEO_PROVIDER; results cached in the adapter). */
@Controller('places')
@UseGuards(JwtAuthGuard)
export class PlacesController {
  constructor(@Inject(GEO_PROVIDER) private readonly geo: GeoProvider) {}

  @Get('autocomplete')
  async autocomplete(@Query(new ZodPipe(AutocompleteQuery)) q: z.infer<typeof AutocompleteQuery>): Promise<PlaceSuggestionDto[]> {
    try {
      return await this.geo.autocomplete(q.q, q.sessionToken);
    } catch (err) {
      throw toAppError(err);
    }
  }

  @Get(':placeId')
  async details(@Param('placeId', new ZodPipe(PlaceIdParam)) placeId: string): Promise<PlaceDetailsDto> {
    try {
      const d = await this.geo.details(placeId);
      return { ...d, state: d.state as PlaceDetailsDto['state'] };
    } catch (err) {
      throw toAppError(err, 'Endereço não encontrado');
    }
  }
}
