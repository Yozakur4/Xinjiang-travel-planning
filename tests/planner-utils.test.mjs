import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildAmapDirectionsUrl,
  createFixedRouteState,
  getCategoryMarkerIcon,
  getRedDotMarkerIcon,
  estimateRouteTotals,
  reorderStopIds,
  splitStopsForDirections,
  toggleFixedRoute,
  toGcj02,
} from "../planner-utils.mjs";

const stops = [
  { id: "urumqi", name: "乌鲁木齐", lat: 43.8256, lng: 87.6168 },
  { id: "kanas", name: "喀纳斯", lat: 48.7495, lng: 87.0396 },
  { id: "hemu", name: "禾木", lat: 48.5791, lng: 87.4304 },
];

describe("planner utils", () => {
  it("estimates route totals from sequential stops", () => {
    const totals = estimateRouteTotals(stops, 72);

    assert.equal(totals.legs.length, 2);
    assert.ok(totals.distanceKm > 650);
    assert.ok(totals.durationHours > 9);
    assert.equal(totals.legs[0].from, "乌鲁木齐");
    assert.equal(totals.legs[1].to, "禾木");
  });

  it("reorders selected stop ids without losing entries", () => {
    assert.deepEqual(reorderStopIds(["a", "b", "c"], 0, 2), ["b", "c", "a"]);
    assert.deepEqual(reorderStopIds(["a", "b", "c"], 2, 0), ["c", "a", "b"]);
  });

  it("builds an AMap directions url with waypoints", () => {
    const url = buildAmapDirectionsUrl(stops);

    assert.match(url, /^https:\/\/uri\.amap\.com\/navigation\/cascade\?/);
    assert.match(url, /from=/);
    assert.match(url, /to=/);
    assert.match(url, /via=/);
    assert.match(url, /mode=car/);
  });

  it("uses a compact red dot marker icon", () => {
    const icon = getRedDotMarkerIcon("CIRCLE");

    assert.equal(icon.path, "CIRCLE");
    assert.equal(icon.fillColor, "#d63131");
    assert.equal(icon.scale, 5);
    assert.equal(icon.rotation, undefined);
  });

  it("uses green dots for nature and red dots for culture", () => {
    const natureIcon = getCategoryMarkerIcon("nature", "CIRCLE");
    const cultureIcon = getCategoryMarkerIcon("culture", "CIRCLE");

    assert.equal(natureIcon.fillColor, "#138a4f");
    assert.equal(cultureIcon.fillColor, "#d63131");
    assert.equal(natureIcon.path, "CIRCLE");
    assert.equal(cultureIcon.scale, 5);
  });

  it("keeps fixed routes hidden until toggled", () => {
    const state = createFixedRouteState(["north", "south"]);

    assert.deepEqual(state, { north: false, south: false });
    assert.deepEqual(toggleFixedRoute(state, "north"), { north: true, south: false });
    assert.deepEqual(toggleFixedRoute({ north: true, south: false }, "north"), {
      north: false,
      south: false,
    });
  });

  it("splits long routes into overlapping driving route segments", () => {
    const manyStops = Array.from({ length: 13 }, (_, index) => ({
      id: String(index),
      name: `Stop ${index}`,
    }));
    const segments = splitStopsForDirections(manyStops, 3);

    assert.deepEqual(
      segments.map((segment) => segment.map((stop) => stop.id)),
      [
        ["0", "1", "2", "3", "4"],
        ["4", "5", "6", "7", "8"],
        ["8", "9", "10", "11", "12"],
      ],
    );
  });

  it("converts WGS84 coordinates in China to GCJ-02 for AMap", () => {
    const converted = toGcj02({ lat: 43.8256, lng: 87.6168 });

    assert.notEqual(converted.lat, 43.8256);
    assert.notEqual(converted.lng, 87.6168);
    assert.ok(Math.abs(converted.lat - 43.827) < 0.03);
    assert.ok(Math.abs(converted.lng - 87.62) < 0.03);
  });
});
