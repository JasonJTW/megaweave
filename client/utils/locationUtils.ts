/**
 * Calculates the Haversine distance in kilometers between two coordinates.
 */
export function calculateDistanceKm(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  const R = 6371; // Earth radius in km
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/**
 * Formats a distance in kilometers into a human-friendly string.
 * Examples: "< 0.1 km", "1.2 km", "15 km"
 */
export function formatDistanceKm(distanceKm: number): string {
  if (distanceKm < 0.1) {
    return "< 0.1 km";
  }
  if (distanceKm < 10) {
    return `${distanceKm.toFixed(1)} km`;
  }
  return `${Math.round(distanceKm)} km`;
}

/**
 * Calculates and returns the formatted distance string between user's current coords
 * and the post's coordinates, or null if coordinates are unavailable.
 */
export function getPostDistance(
  userCoords: { lat: number; lng: number } | null | undefined,
  postLat?: number | string | null,
  postLng?: number | string | null,
): string | null {
  if (
    !userCoords ||
    postLat === undefined ||
    postLat === null ||
    postLng === undefined ||
    postLng === null
  ) {
    return null;
  }

  const lat1 = Number(userCoords.lat);
  const lon1 = Number(userCoords.lng);
  const lat2 = Number(postLat);
  const lon2 = Number(postLng);

  if (
    isNaN(lat1) ||
    isNaN(lon1) ||
    isNaN(lat2) ||
    isNaN(lon2) ||
    (lat2 === 0 && lon2 === 0)
  ) {
    return null;
  }

  const dist = calculateDistanceKm(lat1, lon1, lat2, lon2);
  return formatDistanceKm(dist);
}
