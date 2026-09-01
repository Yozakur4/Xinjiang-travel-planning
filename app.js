import {
  buildGoogleMapsDirectionsUrl,
  createFixedRouteState,
  estimateRouteTotals,
  formatHours,
  getCategoryMarkerIcon,
  reorderStopIds,
  splitStopsForDirections,
  toggleFixedRoute,
} from "./planner-utils.mjs";
import { attractions, presetRoutes } from "./planner-data.mjs";

const STORAGE_KEY = "xinjiang-road-trip-plan";
const API_KEY_STORAGE = "xinjiang-google-maps-key";
const fallbackCenter = { lat: 42.9, lng: 84.8 };

const state = {
  activeFilter: "全部",
  query: "",
  selectedStopIds: loadSavedStops(),
  map: null,
  markers: new Map(),
  infoWindow: null,
  directionsService: null,
  currentRouteRenderers: [],
  currentRouteRequestId: 0,
  fixedRouteVisibility: createFixedRouteState(presetRoutes.map((route) => route.id)),
  fixedRouteLayers: new Map(),
};

const byId = new Map(attractions.map((item) => [item.id, item]));
const regions = ["全部", ...Array.from(new Set(attractions.map((item) => item.region.split("/")[0])))];

const elements = {
  apiKeyInput: document.querySelector("#apiKeyInput"),
  loadMapButton: document.querySelector("#loadMapButton"),
  clearKeyButton: document.querySelector("#clearKeyButton"),
  mapStatus: document.querySelector("#mapStatus"),
  fitMapButton: document.querySelector("#fitMapButton"),
  presetRoutes: document.querySelector("#presetRoutes"),
  routeCount: document.querySelector("#routeCount"),
  filters: document.querySelector("#filters"),
  searchInput: document.querySelector("#searchInput"),
  attractionList: document.querySelector("#attractionList"),
  attractionCount: document.querySelector("#attractionCount"),
  selectedStops: document.querySelector("#selectedStops"),
  legList: document.querySelector("#legList"),
  routeStats: document.querySelector("#routeStats"),
  reverseRouteButton: document.querySelector("#reverseRouteButton"),
  clearRouteButton: document.querySelector("#clearRouteButton"),
  openGoogleMaps: document.querySelector("#openGoogleMaps"),
};

window.initXinjiangMap = initMap;

elements.apiKeyInput.value = localStorage.getItem(API_KEY_STORAGE) || "";
elements.loadMapButton.addEventListener("click", loadMapFromInput);
elements.clearKeyButton.addEventListener("click", clearApiKey);
elements.fitMapButton.addEventListener("click", fitAllMarkers);
elements.searchInput.addEventListener("input", (event) => {
  state.query = event.target.value.trim();
  renderAttractions();
});
elements.reverseRouteButton.addEventListener("click", () => {
  state.selectedStopIds.reverse();
  persistStops();
  updatePlanner();
});
elements.clearRouteButton.addEventListener("click", () => {
  state.selectedStopIds = [];
  persistStops();
  updatePlanner();
});

renderFilters();
renderPresetRoutes();
renderAttractions();
updatePlanner();

if (elements.apiKeyInput.value) {
  loadMapFromInput();
}

function loadSavedStops() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
    return Array.isArray(saved) ? saved.filter((id) => byId.has(id)) : [];
  } catch {
    return [];
  }
}

function persistStops() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state.selectedStopIds));
}

function loadMapFromInput() {
  const key = elements.apiKeyInput.value.trim();
  if (!key) {
    elements.mapStatus.textContent = "请先输入 Google Maps API key。";
    return;
  }

  localStorage.setItem(API_KEY_STORAGE, key);
  if (window.google?.maps) {
    initMap();
    return;
  }

  elements.mapStatus.textContent = "正在加载 Google 地图...";
  const script = document.createElement("script");
  script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(
    key,
  )}&callback=initXinjiangMap&language=zh-CN&region=CN`;
  script.async = true;
  script.onerror = () => {
    elements.mapStatus.textContent = "Google 地图加载失败，请检查 API key、网络或浏览器限制。";
  };
  document.head.append(script);
}

function clearApiKey() {
  localStorage.removeItem(API_KEY_STORAGE);
  elements.apiKeyInput.value = "";
  elements.mapStatus.textContent = "API key 已清除。刷新页面后会回到本地估算模式。";
}

function initMap() {
  state.map = new google.maps.Map(document.querySelector("#map"), {
    center: fallbackCenter,
    zoom: 5.2,
    mapTypeControl: false,
    streetViewControl: false,
    fullscreenControl: true,
    gestureHandling: "greedy",
  });
  state.infoWindow = new google.maps.InfoWindow();
  state.directionsService = new google.maps.DirectionsService();

  attractions.forEach((attraction) => {
    const marker = new google.maps.Marker({
      position: { lat: attraction.lat, lng: attraction.lng },
      map: state.map,
      title: attraction.name,
      icon: getCategoryMarkerIcon(attraction.category, google.maps.SymbolPath.CIRCLE),
    });
    marker.addListener("mouseover", () => showInfo(attraction, marker));
    marker.addListener("click", () => {
      addStop(attraction.id);
      showInfo(attraction, marker);
    });
    state.markers.set(attraction.id, marker);
  });

  elements.mapStatus.textContent = "地图已加载。点击彩色小点可加入路线。";
  fitAllMarkers();
  renderFixedRoutes();
  updatePlanner();
}

function showInfo(attraction, marker) {
  if (!state.infoWindow) return;
  state.infoWindow.setContent(`
    <div style="max-width:240px">
      <strong>${attraction.name}</strong>
      <p style="margin:6px 0;color:#556070">${attraction.summary}</p>
      <small>${attraction.region} · ${attraction.type} · ${attraction.stay}</small>
      <br><small>推荐分 ${attraction.score}/10 · ${attraction.ratingBasis}</small>
    </div>
  `);
  state.infoWindow.open({ anchor: marker, map: state.map });
}

function fitAllMarkers() {
  if (!state.map || !window.google?.maps) return;
  const bounds = new google.maps.LatLngBounds();
  attractions.forEach((item) => bounds.extend({ lat: item.lat, lng: item.lng }));
  state.map.fitBounds(bounds, 48);
}

function renderFilters() {
  elements.filters.innerHTML = regions
    .map(
      (region) =>
        `<button type="button" class="filter-chip ${
          region === state.activeFilter ? "active" : ""
        }" data-region="${region}">${region}</button>`,
    )
    .join("");
  elements.filters.querySelectorAll("button").forEach((button) => {
    button.addEventListener("click", () => {
      state.activeFilter = button.dataset.region;
      renderFilters();
      renderAttractions();
    });
  });
}

function renderPresetRoutes() {
  elements.routeCount.textContent = `${presetRoutes.length}条`;
  elements.presetRoutes.innerHTML = presetRoutes
    .map(
      (route) => `
        <article class="route-card">
          <div>
            <h3>${route.name}</h3>
            <p class="meta">${route.days} · ${route.theme}</p>
          </div>
          <div class="route-actions">
            <button type="button" data-load-route="${route.id}">载入路线</button>
            <button type="button" class="ghost" data-fixed-route="${route.id}">
              ${state.fixedRouteVisibility[route.id] ? "隐藏路径" : "显示公路"}
            </button>
          </div>
        </article>
      `,
    )
    .join("");
  elements.presetRoutes.querySelectorAll("[data-load-route]").forEach((button) => {
    button.addEventListener("click", () => {
      const route = presetRoutes.find((item) => item.id === button.dataset.loadRoute);
      state.selectedStopIds = route.stopIds.slice();
      persistStops();
      updatePlanner();
    });
  });
  elements.presetRoutes.querySelectorAll("[data-fixed-route]").forEach((button) => {
    button.addEventListener("click", () => {
      state.fixedRouteVisibility = toggleFixedRoute(
        state.fixedRouteVisibility,
        button.dataset.fixedRoute,
      );
      renderPresetRoutes();
      renderFixedRoutes();
    });
  });
}

function renderAttractions() {
  const query = state.query.toLowerCase();
  const filtered = attractions.filter((item) => {
    const regionMatch =
      state.activeFilter === "全部" || item.region.includes(state.activeFilter);
    const queryMatch =
      !query ||
      [item.name, item.region, item.type, item.summary].some((value) =>
        value.toLowerCase().includes(query),
      );
    return regionMatch && queryMatch;
  });

  elements.attractionCount.textContent = `${filtered.length}个`;
  elements.attractionList.innerHTML = filtered
    .map(
      (item) => `
        <article class="attraction-card">
          <div>
            <h3>${item.name}</h3>
            <p class="meta">${item.summary}</p>
            <div class="tags">
              <span class="tag ${item.category}">${item.category === "nature" ? "自然" : "人文"}</span>
              <span class="tag score">${item.score}/10</span>
            </div>
          </div>
          <button type="button" data-id="${item.id}">加入</button>
        </article>
      `,
    )
    .join("");

  elements.attractionList.querySelectorAll("button").forEach((button) => {
    button.addEventListener("click", () => addStop(button.dataset.id));
  });
}

function renderFixedRoutes() {
  if (!state.map || !window.google?.maps) return;

  presetRoutes.forEach((route) => {
    if (!state.fixedRouteVisibility[route.id]) {
      hideFixedRoute(route.id);
      return;
    }

    const layer = ensureFixedRouteLayer(route);
    if (layer.status === "ready") {
      setLayerMap(layer, state.map);
      return;
    }

    drawFixedRoute(route, layer);
  });
}

async function drawFixedRoute(route, layer) {
  layer.status = "loading";
  elements.mapStatus.textContent = `正在用 Google 导航绘制「${route.name}」...`;
  const stops = route.stopIds.map((id) => byId.get(id)).filter(Boolean);

  try {
    const responses = await requestRoadRoute(stops);
    layer.renderers = responses.map((response) => makeDirectionsRenderer(route.color, 4, 0.72, response));
    layer.status = "ready";
    if (!state.fixedRouteVisibility[route.id]) setLayerMap(layer, null);
    elements.mapStatus.textContent = `「${route.name}」已按公路路径显示。`;
  } catch (error) {
    layer.status = "error";
    elements.mapStatus.textContent = `「${route.name}」无法显示公路路线：${error.message}。请确认 API key 已启用 Maps JavaScript API 和路线服务。`;
  }
}

function ensureFixedRouteLayer(route) {
  if (!state.fixedRouteLayers.has(route.id)) {
    state.fixedRouteLayers.set(route.id, {
      status: "idle",
      renderers: [],
    });
  }
  return state.fixedRouteLayers.get(route.id);
}

function hideFixedRoute(routeId) {
  const layer = state.fixedRouteLayers.get(routeId);
  if (!layer) return;
  setLayerMap(layer, null);
}

function setLayerMap(layer, map) {
  layer.renderers.forEach((renderer) => renderer.setMap(map));
}

function addStop(id) {
  state.selectedStopIds.push(id);
  persistStops();
  updatePlanner();
}

function updatePlanner() {
  renderSelectedStops();
  updateDirections();
}

function selectedStops() {
  return state.selectedStopIds.map((id) => byId.get(id)).filter(Boolean);
}

function renderSelectedStops() {
  const stops = selectedStops();
  elements.selectedStops.innerHTML = stops.length
    ? stops
        .map(
          (stop, index) => `
          <li class="stop-row">
            <span class="stop-index">${index + 1}</span>
            <strong>${stop.name}</strong>
            <button class="mini-button" type="button" data-move-up="${index}" aria-label="上移 ${stop.name}">↑</button>
            <button class="mini-button" type="button" data-remove="${index}" aria-label="移除 ${stop.name}">×</button>
          </li>
        `,
        )
        .join("")
    : `<p class="empty">从左侧选择景点，或载入一条经典路线。</p>`;

  elements.selectedStops.querySelectorAll("[data-move-up]").forEach((button) => {
    button.addEventListener("click", () => {
      const index = Number(button.dataset.moveUp);
      if (index === 0) return;
      state.selectedStopIds = reorderStopIds(state.selectedStopIds, index, index - 1);
      persistStops();
      updatePlanner();
    });
  });
  elements.selectedStops.querySelectorAll("[data-remove]").forEach((button) => {
    button.addEventListener("click", () => {
      state.selectedStopIds.splice(Number(button.dataset.remove), 1);
      persistStops();
      updatePlanner();
    });
  });
}

function updateDirections() {
  const stops = selectedStops();
  const navigationUrl = buildGoogleMapsDirectionsUrl(stops);
  elements.openGoogleMaps.href = navigationUrl;
  elements.openGoogleMaps.classList.toggle("disabled", stops.length < 2);

  if (stops.length < 2) {
    updateStats({ distanceKm: 0, durationHours: 0, legs: [] }, stops.length);
    clearCurrentRouteMap();
    return;
  }

  if (!state.directionsService) {
    clearCurrentRouteMap();
    updateStats(estimateRouteTotals(stops), stops.length, true);
    return;
  }

  updateCurrentRoadRoute(stops);
}

async function updateCurrentRoadRoute(stops) {
  const requestId = (state.currentRouteRequestId += 1);
  elements.mapStatus.textContent = "正在用 Google 导航计算当前路线...";

  try {
    const responses = await requestRoadRoute(stops);
    if (requestId !== state.currentRouteRequestId) return;
    clearCurrentRouteMap();
    state.currentRouteRenderers = responses.map((response) =>
      makeDirectionsRenderer("#0e6c68", 5, 0.86, response),
    );
    updateStats(getDirectionsTotals(responses), stops.length);
    elements.mapStatus.textContent = "已使用 Google 导航按公路绘制当前路线。";
  } catch (error) {
    if (requestId !== state.currentRouteRequestId) return;
    clearCurrentRouteMap();
    updateStats(estimateRouteTotals(stops), stops.length, true);
    elements.mapStatus.textContent = `无法显示公路路线：${error.message}。下方仅保留本地里程和时间估算，不再绘制直线。`;
  }
}

function requestRoadRoute(stops) {
  const segments = splitStopsForDirections(stops);
  return Promise.all(segments.map(requestDirectionsSegment));
}

function requestDirectionsSegment(stops) {
  const origin = point(stops[0]);
  const destination = point(stops[stops.length - 1]);
  const waypoints = stops.slice(1, -1).map((stop) => ({
    location: point(stop),
    stopover: true,
  }));

  return new Promise((resolve, reject) => {
    state.directionsService.route(
      {
        origin,
        destination,
        waypoints,
        travelMode: google.maps.TravelMode.DRIVING,
        optimizeWaypoints: false,
      },
      (response, status) => {
        if (status === "OK" && response) {
          resolve(response);
          return;
        }
        reject(new Error(status));
      },
    );
  });
}

function makeDirectionsRenderer(color, weight, opacity, response) {
  const renderer = new google.maps.DirectionsRenderer({
    suppressMarkers: true,
    preserveViewport: true,
    polylineOptions: {
      strokeColor: color,
      strokeWeight: weight,
      strokeOpacity: opacity,
    },
  });
  renderer.setMap(state.map);
  renderer.setDirections(response);
  return renderer;
}

function clearCurrentRouteMap() {
  state.currentRouteRenderers.forEach((renderer) => renderer.setMap(null));
  state.currentRouteRenderers = [];
}

function getDirectionsTotals(responses) {
  const googleLegs = responses.flatMap((response) => response.routes[0]?.legs || []);
  const legs = googleLegs.map((leg) => ({
    from: leg.start_address.split(",")[0],
    to: leg.end_address.split(",")[0],
    distanceKm: Math.round((leg.distance?.value || 0) / 1000),
    durationText: leg.duration?.text || "",
  }));
  const distanceKm = legs.reduce((total, leg) => total + leg.distanceKm, 0);
  const durationSeconds = googleLegs.reduce(
    (total, leg) => total + (leg.duration?.value || 0),
    0,
  );
  return {
    distanceKm,
    durationHours: Number((durationSeconds / 3600).toFixed(1)),
    legs,
  };
}

function point(stop) {
  return { lat: stop.lat, lng: stop.lng };
}

function updateStats(totals, stopCount, estimated = false) {
  const statValues = elements.routeStats.querySelectorAll("strong");
  statValues[0].textContent = totals.distanceKm ? `${totals.distanceKm} km` : "-";
  statValues[1].textContent = totals.durationHours
    ? `${formatHours(totals.durationHours)}${estimated ? " 估算" : ""}`
    : "-";
  statValues[2].textContent = String(stopCount);

  elements.legList.innerHTML = totals.legs.length
    ? totals.legs
        .map(
          (leg) => `
        <div class="leg-row">
          <span>${leg.from} → ${leg.to}</span>
          <strong>${leg.distanceKm} km · ${leg.durationText || formatHours(leg.durationHours)}</strong>
        </div>
      `,
        )
        .join("")
    : "";
}
