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

export function buildAmapDirectionsUrl(stops) {
  if (stops.length < 2) return "https://uri.amap.com";

  const encodePoint = (stop) => {
    const point = toGcj02(stop);
    return encodeURIComponent(`${point.lng},${point.lat},${stop.name}`);
  };
  const origin = encodePoint(stops[0]);
  const destination = encodePoint(stops[stops.length - 1]);
  const via = stops.slice(1, -1).map(encodePoint).join(";");
  const params = [
    `from=${origin}`,
    `to=${destination}`,
    via ? `via=${via}` : "",
    `mode=car`,
    `policy=1`,
    `src=xinjiang-road-trip-planner`,
  ].filter(Boolean);

  return `https://uri.amap.com/navigation/cascade?${params.join("&")}`;
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

export function toGcj02(point) {
  const lat = Number(point.lat);
  const lng = Number(point.lng);
  if (isOutsideChina(lat, lng)) return { lat, lng };

  const dLat = transformLat(lng - 105, lat - 35);
  const dLng = transformLng(lng - 105, lat - 35);
  const radLat = (lat / 180) * Math.PI;
  let magic = Math.sin(radLat);
  magic = 1 - 0.006693421622965943 * magic * magic;
  const sqrtMagic = Math.sqrt(magic);
  const mgLat =
    lat +
    (dLat * 180) /
      (((6378245 * (1 - 0.006693421622965943)) / (magic * sqrtMagic)) *
        Math.PI);
  const mgLng =
    lng +
    (dLng * 180) /
      ((6378245 / sqrtMagic) * Math.cos(radLat) * Math.PI);
  return {
    lat: Number(mgLat.toFixed(6)),
    lng: Number(mgLng.toFixed(6)),
  };
}

function isOutsideChina(lat, lng) {
  return lng < 72.004 || lng > 137.8347 || lat < 0.8293 || lat > 55.8271;
}

function transformLat(x, y) {
  let ret =
    -100 +
    2 * x +
    3 * y +
    0.2 * y * y +
    0.1 * x * y +
    0.2 * Math.sqrt(Math.abs(x));
  ret += ((20 * Math.sin(6 * x * Math.PI) + 20 * Math.sin(2 * x * Math.PI)) * 2) / 3;
  ret += ((20 * Math.sin(y * Math.PI) + 40 * Math.sin((y / 3) * Math.PI)) * 2) / 3;
  ret +=
    ((160 * Math.sin((y / 12) * Math.PI) + 320 * Math.sin((y * Math.PI) / 30)) *
      2) /
    3;
  return ret;
}

function transformLng(x, y) {
  let ret =
    300 +
    x +
    2 * y +
    0.1 * x * x +
    0.1 * x * y +
    0.1 * Math.sqrt(Math.abs(x));
  ret += ((20 * Math.sin(6 * x * Math.PI) + 20 * Math.sin(2 * x * Math.PI)) * 2) / 3;
  ret += ((20 * Math.sin(x * Math.PI) + 40 * Math.sin((x / 3) * Math.PI)) * 2) / 3;
  ret +=
    ((150 * Math.sin((x / 12) * Math.PI) + 300 * Math.sin((x / 30) * Math.PI)) *
      2) /
    3;
  return ret;
}

export function formatHours(hours) {
  const totalMinutes = Math.round(hours * 60);
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  if (!h) return `${m}分钟`;
  if (!m) return `${h}小时`;
  return `${h}小时${m}分钟`;
}
