const EARTH_RADIUS_KM = 6371;

export function haversineKm(a, b) {
  const toRad = (value) => (value * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const sinLat = Math.sin(dLat / 2);
  const sinLng = Math.sin(dLng / 2);
  const h =
    sinLat * sinLat +
    Math.cos(lat1) * Math.cos(lat2) * sinLng * sinLng;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(h));
}

export function estimateRouteTotals(stops, averageKph = 68) {
  const legs = [];
  let distanceKm = 0;

  for (let index = 1; index < stops.length; index += 1) {
    const from = stops[index - 1];
    const to = stops[index];
    const straightKm = haversineKm(from, to);
    const roadKm = Math.round(straightKm * 1.28);
    distanceKm += roadKm;
    legs.push({
      from: from.name,
      to: to.name,
      distanceKm: roadKm,
      durationHours: Number((roadKm / averageKph).toFixed(1)),
    });
  }

  return {
    distanceKm,
    durationHours: Number((distanceKm / averageKph).toFixed(1)),
    legs,
  };
}

export function reorderStopIds(ids, fromIndex, toIndex) {
  const next = ids.slice();
  const [item] = next.splice(fromIndex, 1);
  next.splice(toIndex, 0, item);
  return next;
}

export function buildGoogleMapsDirectionsUrl(stops) {
  if (stops.length < 2) return "https://www.google.com/maps";

  const encodePoint = (stop) => encodeURIComponent(`${stop.lat},${stop.lng}`);
  const origin = encodePoint(stops[0]);
  const destination = encodePoint(stops[stops.length - 1]);
  const waypoints = stops.slice(1, -1).map(encodePoint).join("%7C");
  const params = [
    `api=1`,
    `origin=${origin}`,
    `destination=${destination}`,
    waypoints ? `waypoints=${waypoints}` : "",
    `travelmode=driving`,
  ].filter(Boolean);

  return `https://www.google.com/maps/dir/?${params.join("&")}`;
}

export function getRedDotMarkerIcon(circlePath) {
  return {
    path: circlePath,
    fillColor: "#d63131",
    fillOpacity: 1,
    strokeColor: "#991b1b",
    strokeWeight: 1.5,
    scale: 5,
  };
}

export function getCategoryMarkerIcon(category, circlePath) {
  const isNature = category === "nature";
  return {
    path: circlePath,
    fillColor: isNature ? "#138a4f" : "#d63131",
    fillOpacity: 1,
    strokeColor: isNature ? "#0f6f41" : "#991b1b",
    strokeWeight: 1.5,
    scale: 5,
  };
}

export function createFixedRouteState(routeIds) {
  return Object.fromEntries(routeIds.map((id) => [id, false]));
}

export function toggleFixedRoute(routeState, routeId) {
  return {
    ...routeState,
    [routeId]: !routeState[routeId],
  };
}

export function splitStopsForDirections(stops, maxWaypoints = 8) {
  const maxStopsPerSegment = maxWaypoints + 2;
  if (stops.length <= maxStopsPerSegment) return [stops.slice()];

  const segments = [];
  let start = 0;
  while (start < stops.length - 1) {
    const end = Math.min(start + maxStopsPerSegment - 1, stops.length - 1);
    segments.push(stops.slice(start, end + 1));
    start = end;
  }
  return segments;
}

export function formatHours(hours) {
  const totalMinutes = Math.round(hours * 60);
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  if (!h) return `${m}分钟`;
  if (!m) return `${h}小时`;
  return `${h}小时${m}分钟`;
}
