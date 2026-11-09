const EARTH_RADIUS_KM = 6371;

/** Great-circle distance in km. */
export function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const rad = (d: number): number => (d * Math.PI) / 180;
  const dLat = rad(lat2 - lat1);
  const dLng = rad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(a)));
}

/** Bounding box (degrees) around a point for a coarse DB pre-filter. */
export function boundingBox(lat: number, lng: number, radiusKm: number): { minLat: number; maxLat: number; minLng: number; maxLng: number } {
  const dLat = radiusKm / 111;
  const dLng = radiusKm / (111 * Math.max(0.1, Math.cos((lat * Math.PI) / 180)));
  return { minLat: lat - dLat, maxLat: lat + dLat, minLng: lng - dLng, maxLng: lng + dLng };
}

/** Weather grid: coordinates rounded to 0.1° (shared forecasts per region). */
export function weatherGrid(v: number): number {
  return Math.round(v * 10) / 10;
}
