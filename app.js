import {
  buildAmapDirectionsUrl,
  createFixedRouteState,
  estimateRouteTotals,
  formatHours,
  reorderStopIds,
  splitStopsForDirections,
  toGcj02,
  toggleFixedRoute,
} from "./planner-utils.mjs";
import { attractions, presetRoutes } from "./planner-data.mjs";

const STORAGE_KEY = "xinjiang-road-trip-plan";
const AMAP_KEY_STORAGE = "xinjiang-amap-key";
const AMAP_SECURITY_STORAGE = "xinjiang-amap-security-code";
const fallbackCenter = [84.8, 42.9];

const state = {
  activeFilter: "全部",
  query: "",
  selectedStopIds: loadSavedStops(),
  map: null,
  markers: new Map(),
  infoWindow: null,
  currentRouteLines: [],
  currentRouteRequestId: 0,
  fixedRouteVisibility: createFixedRouteState(presetRoutes.map((route) => route.id)),
  fixedRouteLayers: new Map(),
};

const byId = new Map(attractions.map((item) => [item.id, item]));
const regions = [
  "全部",
  ...Array.from(new Set(attractions.map((item) => item.region.split("/")[0]))),
];

const elements = {
  apiKeyInput: document.querySelector("#apiKeyInput"),
  securityCodeInput: document.querySelector("#securityCodeInput"),
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
  openAmap: document.querySelector("#openAmap"),
};

window.initXinjiangMap = initMap;

elements.apiKeyInput.value = localStorage.getItem(AMAP_KEY_STORAGE) || "";
elements.securityCodeInput.value =
  localStorage.getItem(AMAP_SECURITY_STORAGE) || "";
elements.loadMapButton.addEventListener("click", loadMapFromInput);
elements.clearKeyButton.addEventListener("click", clearMapCredentials);
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

if (elements.apiKeyInput.value && elements.securityCodeInput.value) {
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
  const securityCode = elements.securityCodeInput.value.trim();
  if (!key || !securityCode) {
    elements.mapStatus.textContent = "请先输入高德地图 Key 和安全密钥。";
    return;
  }

  localStorage.setItem(AMAP_KEY_STORAGE, key);
  localStorage.setItem(AMAP_SECURITY_STORAGE, securityCode);
  window._AMapSecurityConfig = { securityJsCode: securityCode };

  if (window.AMap) {
    initMap();
    return;
  }

  elements.mapStatus.textContent = "正在加载高德地图...";
  const script = document.createElement("script");
  script.src = `https://webapi.amap.com/maps?v=2.0&key=${encodeURIComponent(
    key,
  )}&plugin=AMap.Driving&callback=initXinjiangMap`;
  script.async = true;
  script.onerror = () => {
    elements.mapStatus.textContent =
      "高德地图加载失败，请检查 Key、安全密钥、网络或浏览器限制。";
  };
  document.head.append(script);
}

function clearMapCredentials() {
  localStorage.removeItem(AMAP_KEY_STORAGE);
  localStorage.removeItem(AMAP_SECURITY_STORAGE);
  elements.apiKeyInput.value = "";
  elements.securityCodeInput.value = "";
  elements.mapStatus.textContent = "高德 Key 和安全密钥已清除。";
}

function initMap() {
  state.map = new AMap.Map("map", {
    center: fallbackCenter,
    zoom: 5,
    viewMode: "2D",
    mapStyle: "amap://styles/normal",
  });
  state.infoWindow = new AMap.InfoWindow({
    offset: new AMap.Pixel(0, -10),
  });

  attractions.forEach((attraction) => {
    const marker = new AMap.Marker({
      position: amapPoint(attraction),
      title: attraction.name,
      content: `<span class="amap-dot ${attraction.category}" aria-label="${attraction.name}"></span>`,
      offset: new AMap.Pixel(-5, -5),
    });
    marker.on("mouseover", () => showInfo(attraction, marker));
    marker.on("click", () => {
      addStop(attraction.id);
      showInfo(attraction, marker);
    });
    state.markers.set(attraction.id, marker);
  });

  state.map.add(Array.from(state.markers.values()));
  elements.mapStatus.textContent = "高德地图已加载。点击彩色小点可加入路线。";
  fitAllMarkers();
  renderFixedRoutes();
  updatePlanner();
}

function showInfo(attraction, marker) {
  if (!state.infoWindow) return;
  state.infoWindow.setContent(`
    <div class="info-window">
      <strong>${attraction.name}</strong>
      <p>${attraction.summary}</p>
      <small>${attraction.region} · ${attraction.type} · ${attraction.stay}</small>
      <br><small>推荐分 ${attraction.score}/10 · ${attraction.ratingBasis}</small>
    </div>
  `);
  state.infoWindow.open(state.map, marker.getPosition());
}

function fitAllMarkers() {
  if (!state.map || !window.AMap) return;
  state.map.setFitView(Array.from(state.markers.values()), false, [48, 48, 48, 48]);
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
  if (!state.map || !window.AMap) return;

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
  elements.mapStatus.textContent = `正在用高德驾车规划绘制「${route.name}」...`;
  const stops = route.stopIds.map((id) => byId.get(id)).filter(Boolean);

  try {
    const results = await requestRoadRoute(stops);
    layer.lines = results.map((result) =>
      makeRoadPolyline(extractAmapPath(result), route.color, 4, 0.72),
    );
    layer.status = "ready";
    if (!state.fixedRouteVisibility[route.id]) setLayerMap(layer, null);
    elements.mapStatus.textContent = `「${route.name}」已按高德公路路径显示。`;
  } catch (error) {
    layer.status = "error";
    elements.mapStatus.textContent = `「${route.name}」无法显示公路路线：${error.message}。请确认高德 Key 已启用 JS API 和驾车路线规划。`;
  }
}

function ensureFixedRouteLayer(route) {
  if (!state.fixedRouteLayers.has(route.id)) {
    state.fixedRouteLayers.set(route.id, {
      status: "idle",
      lines: [],
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
  layer.lines.forEach((line) => line.setMap(map));
}

function addStop(id) {
  state.selectedStopIds.push(id);
  persistStops();
  updatePlanner();
}

function updatePlanner() {
  renderSelectedStops();
  updateDrivingRoute();
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

function updateDrivingRoute() {
  const stops = selectedStops();
  const navigationUrl = buildAmapDirectionsUrl(stops);
  elements.openAmap.href = navigationUrl;
  elements.openAmap.classList.toggle("disabled", stops.length < 2);

  if (stops.length < 2) {
    updateStats({ distanceKm: 0, durationHours: 0, legs: [] }, stops.length);
    clearCurrentRouteMap();
    return;
  }

  if (!state.map || !window.AMap) {
    clearCurrentRouteMap();
    updateStats(estimateRouteTotals(stops), stops.length, true);
    return;
  }

  updateCurrentRoadRoute(stops);
}

async function updateCurrentRoadRoute(stops) {
  const requestId = (state.currentRouteRequestId += 1);
  elements.mapStatus.textContent = "正在用高德驾车规划计算当前路线...";

  try {
    const results = await requestRoadRoute(stops);
    if (requestId !== state.currentRouteRequestId) return;
    clearCurrentRouteMap();
    state.currentRouteLines = results.map((result) =>
      makeRoadPolyline(extractAmapPath(result), "#0e6c68", 5, 0.86),
    );
    updateStats(getAmapRouteTotals(results), stops.length);
    elements.mapStatus.textContent = "已使用高德驾车规划按公路绘制当前路线。";
  } catch (error) {
    if (requestId !== state.currentRouteRequestId) return;
    clearCurrentRouteMap();
    updateStats(estimateRouteTotals(stops), stops.length, true);
    elements.mapStatus.textContent = `无法显示公路路线：${error.message}。下方仅保留本地里程和时间估算，不绘制直线。`;
  }
}

function requestRoadRoute(stops) {
  const segments = splitStopsForDirections(stops, 14);
  return Promise.all(segments.map(requestDrivingSegment));
}

function requestDrivingSegment(stops) {
  const driving = new AMap.Driving({
    policy: AMap.DrivingPolicy.LEAST_TIME,
  });
  const start = amapPoint(stops[0]);
  const end = amapPoint(stops[stops.length - 1]);
  const waypoints = stops.slice(1, -1).map(amapPoint);

  return new Promise((resolve, reject) => {
    driving.search(start, end, { waypoints }, (status, result) => {
      if (status === "complete" && result?.routes?.length) {
        resolve(result);
        return;
      }
      reject(new Error(result?.info || status || "AMap driving route failed"));
    });
  });
}

function makeRoadPolyline(path, color, weight, opacity) {
  const line = new AMap.Polyline({
    path,
    strokeColor: color,
    strokeWeight: weight,
    strokeOpacity: opacity,
    showDir: true,
    lineJoin: "round",
    lineCap: "round",
  });
  state.map.add(line);
  return line;
}

function extractAmapPath(result) {
  return result.routes
    .flatMap((route) => route.steps || [])
    .flatMap((step) => step.path || []);
}

function clearCurrentRouteMap() {
  state.currentRouteLines.forEach((line) => state.map?.remove(line));
  state.currentRouteLines = [];
}

function getAmapRouteTotals(results) {
  const routes = results.map((result) => result.routes[0]).filter(Boolean);
  const legs = routes.map((route) => ({
    from: "路段起点",
    to: "路段终点",
    distanceKm: Math.round(Number(route.distance || 0) / 1000),
    durationText: formatSeconds(Number(route.time || 0)),
  }));
  const distanceKm = legs.reduce((total, leg) => total + leg.distanceKm, 0);
  const durationSeconds = routes.reduce(
    (total, route) => total + Number(route.time || 0),
    0,
  );
  return {
    distanceKm,
    durationHours: Number((durationSeconds / 3600).toFixed(1)),
    legs,
  };
}

function amapPoint(stop) {
  const point = toGcj02(stop);
  return [point.lng, point.lat];
}

function formatSeconds(seconds) {
  return formatHours(seconds / 3600);
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
          (leg, index) => `
        <div class="leg-row">
          <span>${leg.from || `路段 ${index + 1}`} → ${leg.to || `路段 ${index + 2}`}</span>
          <strong>${leg.distanceKm} km · ${leg.durationText || formatHours(leg.durationHours)}</strong>
        </div>
      `,
        )
        .join("")
    : "";
}
