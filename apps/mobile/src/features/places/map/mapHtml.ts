// Straight from the tokens file: the UI barrel pulls in React Native, which tests cannot load.
import { mapColors } from '@/shared/ui/theme/tokens';

/**
 * The map page: MapLibre GL JS (ADR-0010) with our pins drawn on the map's own canvas.
 * Built once per map; everything after that goes through messages (`protocol.ts`).
 */

/** Pinned library version and its integrity hashes: the phone refuses a file that was tampered with. */
export const MAPLIBRE = {
  version: '5.24.0',
  js: 'https://cdn.jsdelivr.net/npm/maplibre-gl@5.24.0/dist/maplibre-gl.js',
  jsIntegrity: 'sha384-5+cfbwT0iiub6VsQAdn6yz16nr6sDiQoHx6tm4O8OVYXHYOxcffFmCJBL0dgdvGp',
  css: 'https://cdn.jsdelivr.net/npm/maplibre-gl@5.24.0/dist/maplibre-gl.css',
  cssIntegrity: 'sha384-uTttxo/aOKbdE5RlD/SPzSDoDmNvGlUYPjONi2MN/b7c9HPSvW07OIuyP7uL6jxK',
} as const;

/** Free tiles until our own server serves PMTiles (ADR-0010); then only this URL changes. */
export const DEFAULT_STYLE_URL = 'https://tiles.openfreemap.org/styles/positron';

export interface MapPageOptions {
  styleUrl: string;
  center: { lat: number; lon: number };
  zoom: number;
  /** Glyph font that the style's server has; used for cluster counts and pin labels. */
  font: string;
  /** Show the map's own zoom buttons (off on phones: pinch is enough). */
  interactiveHint?: boolean;
}

/** Category glyphs, 24×24 stroke paths, the same shapes as the app's icons. */
export const GLYPHS: Record<string, string[]> = {
  clinic: ['M9.5 4h5v5.5H20v5h-5.5V20h-5v-5.5H4v-5h5.5z'],
  pharmacy: ['M10.5 3.5a5 5 0 0 1 7 7l-7 7a5 5 0 0 1-7-7z', 'M7 7l10 10'],
  dog_park: ['M12 22v-7', 'M12 15a5 5 0 0 0 4.5-7.5A4.5 4.5 0 0 0 7.5 7.5 5 5 0 0 0 12 15z'],
  shop: ['M6 8h12l-1 12H7z', 'M9 8a3 3 0 0 1 6 0'],
  groomer: [
    'M3 6a3 3 0 1 0 6 0a3 3 0 1 0-6 0',
    'M3 18a3 3 0 1 0 6 0a3 3 0 1 0-6 0',
    'M8.5 7.5L20 18',
    'M8.5 16.5L20 6',
  ],
  trainer: ['M5 9l2-5 3 4h4l3-4 2 5v5a7 7 0 0 1-14 0z'],
  cafe: ['M5 8h11v5a5 5 0 0 1-5 5h-1a5 5 0 0 1-5-5z', 'M16 9h1a3 3 0 0 1 0 6h-1'],
  other: [
    'M12 21s7-6.2 7-11a7 7 0 0 0-14 0c0 4.8 7 11 7 11z',
    'M14.5 10a2.5 2.5 0 1 1-5 0a2.5 2.5 0 1 1 5 0',
  ],
};

/** Everything the page script needs, in one JSON object. */
function pageConfig(options: MapPageOptions) {
  return {
    styleUrl: options.styleUrl,
    center: [options.center.lon, options.center.lat],
    zoom: options.zoom,
    font: options.font,
    colors: mapColors,
    glyphs: GLYPHS,
  };
}

/**
 * The page script. Plain ES2017 run inside the WebView; it only draws and reports — every
 * decision (what to load, what is selected) stays in the app.
 */
const PAGE_SCRIPT = String.raw`
(function () {
  var config = window.__PET_MAP_CONFIG__;
  var C = config.colors;
  function post(message) {
    var text = JSON.stringify(message);
    if (window.ReactNativeWebView) window.ReactNativeWebView.postMessage(text);
    else if (window.parent && window.parent !== window) window.parent.postMessage(text, '*');
  }
  var errorSent = false;
  function fail(fatal, message) {
    if (!fatal && errorSent) return;
    errorSent = true;
    post({ type: 'error', fatal: fatal, message: String(message || 'unknown').slice(0, 300) });
  }
  if (!window.maplibregl) { fail(true, 'maplibre_not_loaded'); return; }

  var map;
  try {
    map = new maplibregl.Map({
      container: 'map',
      style: config.styleUrl,
      center: config.center,
      zoom: config.zoom,
      attributionControl: false,
      dragRotate: false,
      pitchWithRotate: false,
      touchPitch: false,
      maxPitch: 0,
      fadeDuration: 0,
    });
  } catch (e) { fail(true, e && e.message); return; }
  map.touchZoomRotate.disableRotation();
  map.keyboard.disableRotation();

  var loaded = false;
  map.on('error', function (e) { fail(!loaded, e && e.error && e.error.message); });

  /** Our colors and Ukrainian labels on top of the base style. */
  function restyle() {
    map.getStyle().layers.forEach(function (layer) {
      var id = layer.id;
      try {
        if (layer.type === 'background') map.setPaintProperty(id, 'background-color', C.land);
        else if (layer.type === 'fill') {
          if (/park|wood|grass|cemetery/.test(id)) map.setPaintProperty(id, 'fill-color', C.park);
          else if (/^water/.test(id)) map.setPaintProperty(id, 'fill-color', C.water);
          else if (/building/.test(id)) map.setPaintProperty(id, 'fill-color', C.building);
          else if (/residential|landuse/.test(id)) map.setPaintProperty(id, 'fill-color', C.land);
        } else if (layer.type === 'line' && /^waterway/.test(id)) {
          map.setPaintProperty(id, 'line-color', C.water);
        } else if (layer.type === 'line' && /^highway_(minor|path)/.test(id)) {
          map.setPaintProperty(id, 'line-color', C.road);
        } else if (layer.type === 'symbol') {
          if (/^poi/.test(id)) { map.setLayoutProperty(id, 'visibility', 'none'); return; }
          var field = map.getLayoutProperty(id, 'text-field');
          if (field && JSON.stringify(field).indexOf('"name') !== -1) {
            map.setLayoutProperty(id, 'text-field', ['coalesce', ['get', 'name:uk'], ['get', 'name']]);
          }
        }
      } catch (e) { /* a layer the base style does not have in this form */ }
    });
  }

  /** A round pin: a dark disc, a light ring and the category glyph — drawn once per kind. */
  function pinImage(size, fill, ring, glyph, paths) {
    var dpr = 2;
    var canvas = document.createElement('canvas');
    canvas.width = canvas.height = size * dpr;
    var g = canvas.getContext('2d');
    g.scale(dpr, dpr);
    g.beginPath();
    g.arc(size / 2, size / 2, size / 2 - 1.5, 0, Math.PI * 2);
    g.fillStyle = fill;
    g.fill();
    g.lineWidth = 3;
    g.strokeStyle = ring;
    g.stroke();
    var s = size * 0.52;
    g.save();
    g.translate((size - s) / 2, (size - s) / 2);
    g.scale(s / 24, s / 24);
    g.lineWidth = 2.2;
    g.lineCap = 'round';
    g.lineJoin = 'round';
    g.strokeStyle = glyph;
    paths.forEach(function (d) { g.stroke(new Path2D(d)); });
    g.restore();
    return { image: g.getImageData(0, 0, canvas.width, canvas.height), pixelRatio: dpr };
  }

  function addPinImages() {
    Object.keys(config.glyphs).forEach(function (category) {
      var paths = config.glyphs[category];
      var kinds = {
        pin: pinImage(34, C.pin, C.pinRing, C.pinGlyph, paths),
        mine: pinImage(34, C.mine, C.pin, C.mineGlyph, paths),
        sel: pinImage(46, C.pin, C.pinGlyph, C.pinGlyph, paths),
        selmine: pinImage(46, C.mine, C.pin, C.mineGlyph, paths),
      };
      Object.keys(kinds).forEach(function (kind) {
        var name = kind + '-' + category;
        if (!map.hasImage(name)) map.addImage(name, kinds[kind].image, { pixelRatio: kinds[kind].pixelRatio });
      });
    });
  }

  var empty = { type: 'FeatureCollection', features: [] };
  function addLayers() {
    map.addSource('places', { type: 'geojson', data: empty, cluster: true, clusterRadius: 44, clusterMaxZoom: 15 });
    map.addSource('selected', { type: 'geojson', data: empty });
    map.addSource('user', { type: 'geojson', data: empty });
    map.addLayer({
      id: 'user', type: 'circle', source: 'user',
      paint: { 'circle-radius': 8, 'circle-color': C.mine, 'circle-stroke-color': C.pin, 'circle-stroke-width': 3 },
    });
    map.addLayer({
      id: 'clusters', type: 'circle', source: 'places', filter: ['has', 'point_count'],
      paint: {
        'circle-color': C.pin,
        'circle-radius': ['step', ['get', 'point_count'], 18, 10, 22, 50, 26],
        'circle-stroke-color': C.pinRing,
        'circle-stroke-width': 3,
      },
    });
    map.addLayer({
      id: 'cluster-count', type: 'symbol', source: 'places', filter: ['has', 'point_count'],
      layout: {
        'text-field': ['get', 'point_count_abbreviated'],
        'text-font': [config.font],
        'text-size': 13,
        'text-allow-overlap': true,
      },
      paint: { 'text-color': C.pinGlyph },
    });
    map.addLayer({
      id: 'pins', type: 'symbol', source: 'places', filter: ['!', ['has', 'point_count']],
      layout: {
        'icon-image': ['concat', ['case', ['get', 'mine'], 'mine-', 'pin-'], ['get', 'category']],
        'icon-allow-overlap': true,
        'icon-ignore-placement': true,
      },
    });
    map.addLayer({
      id: 'pin-selected', type: 'symbol', source: 'selected',
      layout: {
        'icon-image': ['concat', ['case', ['get', 'mine'], 'selmine-', 'sel-'], ['get', 'category']],
        'icon-allow-overlap': true,
        'icon-ignore-placement': true,
        'text-field': ['coalesce', ['get', 'label'], ''],
        'text-font': [config.font],
        'text-size': 12,
        'text-offset': [0, 2.4],
        'text-allow-overlap': true,
      },
      paint: { 'text-color': C.label, 'text-halo-color': C.pin, 'text-halo-width': 6 },
    });
  }

  function report() {
    var b = map.getBounds();
    var c = map.getCenter();
    post({
      type: 'region',
      bbox: [b.getWest(), b.getSouth(), b.getEast(), b.getNorth()].map(function (n) { return Math.round(n * 1e5) / 1e5; }),
      center: { lat: Math.round(c.lat * 1e5) / 1e5, lon: Math.round(c.lng * 1e5) / 1e5 },
      zoom: Math.round(map.getZoom() * 100) / 100,
    });
  }

  map.on('load', function () {
    loaded = true;
    restyle();
    addPinImages();
    addLayers();
    post({ type: 'ready' });
    report();
  });
  map.on('moveend', report);
  map.on('dragstart', function () { post({ type: 'drag' }); });

  map.on('click', function (e) {
    var hits = map.queryRenderedFeatures(e.point, { layers: ['pin-selected', 'pins', 'clusters'] });
    var hit = hits[0];
    if (!hit) { post({ type: 'tapEmpty' }); return; }
    if (hit.layer.id === 'clusters') {
      map.getSource('places').getClusterExpansionZoom(hit.properties.cluster_id).then(function (zoom) {
        map.easeTo({ center: hit.geometry.coordinates, zoom: zoom + 0.5 });
      });
      return;
    }
    post({ type: 'select', id: String(hit.properties.id) });
  });

  // Long press on the map = a person's own marker here (USER_FLOWS, scenario 6).
  var pressTimer = null;
  var pressStart = null;
  function cancelPress() { if (pressTimer) clearTimeout(pressTimer); pressTimer = null; }
  map.on('touchstart', function (e) {
    cancelPress();
    if (e.originalEvent.touches.length !== 1) return;
    pressStart = e.point;
    var lngLat = e.lngLat;
    pressTimer = setTimeout(function () {
      pressTimer = null;
      post({ type: 'longPress', lat: lngLat.lat, lon: lngLat.lng });
    }, 550);
  });
  map.on('touchmove', function (e) {
    if (pressStart && (Math.abs(e.point.x - pressStart.x) > 8 || Math.abs(e.point.y - pressStart.y) > 8)) cancelPress();
  });
  map.on('touchend', cancelPress);
  map.on('touchcancel', cancelPress);
  map.on('contextmenu', function (e) { post({ type: 'longPress', lat: e.lngLat.lat, lon: e.lngLat.lng }); });

  var queue = [];
  function apply(command) {
    switch (command.type) {
      case 'places': map.getSource('places').setData(command.pins); break;
      case 'select': map.getSource('selected').setData(command.pin ? { type: 'FeatureCollection', features: [command.pin] } : empty); break;
      case 'user': map.getSource('user').setData({ type: 'FeatureCollection', features: [{ type: 'Feature', geometry: { type: 'Point', coordinates: [command.lon, command.lat] }, properties: {} }] }); break;
      case 'flyTo': map.flyTo({ center: [command.lon, command.lat], zoom: command.zoom || Math.max(map.getZoom(), 15), speed: 1.6 }); break;
      case 'padding': map.setPadding({ top: command.top, bottom: command.bottom, left: 0, right: 0 }); report(); break;
    }
  }
  window.__petMap = {
    receive: function (command) {
      if (!loaded) { queue.push(command); return; }
      try { apply(command); } catch (e) { fail(false, e && e.message); }
    },
  };
  map.once('load', function () { queue.splice(0).forEach(window.__petMap.receive); });
})();
`;

/** The whole page. The config is JSON with `<` escaped, so data can never end the script early. */
export function buildMapHtml(options: MapPageOptions): string {
  const config = JSON.stringify(pageConfig(options)).replace(/</g, '\\u003c');
  return [
    '<!doctype html><html><head><meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no">',
    `<link rel="stylesheet" href="${MAPLIBRE.css}" integrity="${MAPLIBRE.cssIntegrity}" crossorigin="anonymous">`,
    `<style>html,body,#map{margin:0;width:100%;height:100%;background:${mapColors.land};overflow:hidden;-webkit-user-select:none;user-select:none;-webkit-touch-callout:none}</style>`,
    '</head><body><div id="map"></div>',
    `<script>window.__PET_MAP_CONFIG__=${config};</script>`,
    `<script src="${MAPLIBRE.js}" integrity="${MAPLIBRE.jsIntegrity}" crossorigin="anonymous"></script>`,
    `<script>${PAGE_SCRIPT}</script>`,
    '</body></html>',
  ].join('');
}
