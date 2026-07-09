/**
 * DeliveryMap.jsx — Ride-sharing style navigation map
 *
 * • Only 2 pins: 🌾 farm origin (green, pulsing) + 🏠 consumer (orange, pulsing)
 * • Real road route fetched from OSRM (free, no API key required)
 * • Exact GPS coordinates shown on each pin popup
 * • onRouteReady(info) callback with { distance, duration } from OSRM
 * • "Open in Google Maps" navigation button
 * • Expandable turn-by-turn directions
 * • Robust coordinate validation — never crashes on undefined/null lat-lng
 */
import React, { useEffect, useRef, useState } from 'react';

let L;
if (typeof window !== 'undefined') {
  L = require('leaflet');
  delete L.Icon.Default.prototype._getIconUrl;
  L.Icon.Default.mergeOptions({
    iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
    iconUrl:       'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
    shadowUrl:     'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
  });
}

/** Validate that a value is a finite, in-range lat or lng */
function validLat(v) { const n = parseFloat(v); return isFinite(n) && n >= -90  && n <= 90;  }
function validLng(v) { const n = parseFloat(v); return isFinite(n) && n >= -180 && n <= 180; }
function validCoords(wp) {
  return wp && validLat(wp.lat) && validLng(wp.lng);
}

/* Pulsing ride-sharing pin */
function makePinIcon(color, emoji, pulse = false) {
  if (!L) return null;
  return L.divIcon({
    className: '',
    html: `
      <div style="position:relative;display:flex;flex-direction:column;align-items:center;">
        ${pulse ? `<div style="position:absolute;top:-8px;left:-8px;width:50px;height:50px;
          border-radius:50%;background:${color};opacity:0.2;
          animation:rpl 1.8s ease-out infinite;"></div>` : ''}
        <div style="width:36px;height:36px;border-radius:50%;background:${color};
          border:3px solid white;box-shadow:0 4px 16px rgba(0,0,0,0.35);
          display:flex;align-items:center;justify-content:center;
          font-size:17px;position:relative;z-index:2;">${emoji}</div>
        <div style="width:0;height:0;border-left:8px solid transparent;
          border-right:8px solid transparent;border-top:11px solid ${color};
          margin-top:-2px;"></div>
      </div>
      <style>
        @keyframes rpl {
          0%   { transform:scale(0.7); opacity:0.4; }
          100% { transform:scale(2.5); opacity:0;   }
        }
      </style>
    `,
    iconSize:    [36, 50],
    iconAnchor:  [18, 50],
    popupAnchor: [0, -54],
  });
}

function fmtMins(sec) {
  const m = Math.round(sec / 60);
  return m < 60 ? `${m} min` : `${Math.floor(m / 60)}h ${m % 60}m`;
}

export default function DeliveryMap({
  waypoints,
  height = '420px',
  travelMode = 'driving',
  onRouteReady = null,   // callback(info) where info = { distance, duration }
}) {
  const leafletRef  = useRef(null);
  const containerId = useRef(`map-${Math.random().toString(36).slice(2)}`);
  const [routeInfo, setRouteInfo] = useState(null);
  const [loading,   setLoading]   = useState(false);
  const [steps,     setSteps]     = useState([]);
  const [showSteps, setShowSteps] = useState(false);

  /* Use only first and last waypoint — ignore any intermediate hubs */
  const origin = waypoints?.[0];
  const dest   = waypoints?.[waypoints?.length - 1];

  /* Validate coordinates — bail early if anything is missing or NaN */
  const coordsOk = validCoords(origin) && validCoords(dest);

  useEffect(() => {
    if (!L || !coordsOk) return;

    const oLat = parseFloat(origin.lat);
    const oLng = parseFloat(origin.lng);
    const dLat = parseFloat(dest.lat);
    const dLng = parseFloat(dest.lng);

    /* Tear down previous map instance */
    if (leafletRef.current) { leafletRef.current.remove(); leafletRef.current = null; }

    const el = document.getElementById(containerId.current);
    if (!el) return;

    let map;
    try {
      map = L.map(el, { zoomControl: true, scrollWheelZoom: true });
    } catch (err) {
      console.error('[DeliveryMap] Failed to init map:', err);
      return;
    }
    leafletRef.current = map;

    /* OSM tiles */
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      maxZoom: 19,
    }).addTo(map);

    /* ── Farm marker — green, pulsing ── */
    try {
      L.marker([oLat, oLng], { icon: makePinIcon('#16a34a', '🌾', true) })
        .addTo(map)
        .bindPopup(`
          <div style="font-family:'DM Sans',sans-serif;min-width:200px;padding:2px 0;">
            <div style="font-weight:800;color:#16a34a;font-size:15px;margin-bottom:3px;">🌾 ${origin.label || 'Farm'}</div>
            <div style="color:#777;font-size:11px;margin-bottom:8px;font-style:italic;">Farm Origin</div>
            <div style="background:#f0fdf4;border-radius:8px;padding:8px 10px;font-size:11px;color:#166534;line-height:2;">
              <b>Latitude:</b>  ${oLat.toFixed(6)}°N<br/>
              <b>Longitude:</b> ${oLng.toFixed(6)}°E
            </div>
            <a href="https://www.google.com/maps?q=${oLat},${oLng}" target="_blank"
              style="display:block;margin-top:8px;text-align:center;background:#16a34a;color:white;
              border-radius:8px;padding:7px;font-size:11px;font-weight:700;text-decoration:none;">
              📍 Open Farm in Google Maps
            </a>
          </div>
        `);
    } catch (e) { console.warn('[DeliveryMap] Farm marker error:', e); }

    /* ── Consumer marker — orange, pulsing ── */
    try {
      L.marker([dLat, dLng], { icon: makePinIcon('#ea580c', '🏠', true) })
        .addTo(map)
        .bindPopup(`
          <div style="font-family:'DM Sans',sans-serif;min-width:200px;padding:2px 0;">
            <div style="font-weight:800;color:#ea580c;font-size:15px;margin-bottom:3px;">🏠 ${dest.label || 'Customer'}</div>
            <div style="color:#777;font-size:11px;margin-bottom:8px;font-style:italic;">Delivery Destination</div>
            <div style="background:#fff7ed;border-radius:8px;padding:8px 10px;font-size:11px;color:#9a3412;line-height:2;">
              <b>Latitude:</b>  ${dLat.toFixed(6)}°N<br/>
              <b>Longitude:</b> ${dLng.toFixed(6)}°E
            </div>
            <a href="https://www.google.com/maps?q=${dLat},${dLng}" target="_blank"
              style="display:block;margin-top:8px;text-align:center;background:#ea580c;color:white;
              border-radius:8px;padding:7px;font-size:11px;font-weight:700;text-decoration:none;">
              📍 Open Destination in Google Maps
            </a>
          </div>
        `);
    } catch (e) { console.warn('[DeliveryMap] Dest marker error:', e); }

    /* Fit both pins before route loads */
    try {
      map.fitBounds(
        L.latLngBounds([[oLat, oLng], [dLat, dLng]]),
        { padding: [60, 60] }
      );
    } catch (e) {
      map.setView([(oLat + dLat) / 2, (oLng + dLng) / 2], 10);
    }

    /* ── Fetch real route from OSRM ── */
    const profile = travelMode === 'walking' ? 'foot' : 'driving';
    const osrmUrl = [
      `https://router.project-osrm.org/route/v1/${profile}/`,
      `${oLng},${oLat};${dLng},${dLat}`,
      `?geometries=geojson&overview=full&steps=true`,
    ].join('');

    setLoading(true);
    fetch(osrmUrl)
      .then(r => r.json())
      .then(data => {
        if (!data.routes?.length) return;

        const route   = data.routes[0];
        const rawCoords = route.geometry?.coordinates;
        if (!rawCoords?.length) return;

        /* Validate every coordinate pair from OSRM before drawing */
        const coords = rawCoords
          .filter(([lng, lat]) => isFinite(lat) && isFinite(lng))
          .map(([lng, lat]) => [lat, lng]);

        if (coords.length < 2) return;

        const distKm  = (route.distance / 1000).toFixed(2);
        const dur     = fmtMins(route.duration);
        const info    = { distance: distKm, duration: dur };

        setRouteInfo(info);
        if (onRouteReady) onRouteReady(info);

        /* Shadow line */
        try { L.polyline(coords, { color:'#000', weight:9, opacity:0.07, lineJoin:'round' }).addTo(map); }
        catch (e) { console.warn('[DeliveryMap] Shadow polyline error:', e); }

        /* Route line */
        try {
          L.polyline(coords, {
            color:   travelMode === 'walking' ? '#7c3aed' : '#2563eb',
            weight:  5,
            opacity: 0.92,
            lineJoin:'round',
          }).addTo(map);
        } catch (e) { console.warn('[DeliveryMap] Route polyline error:', e); }

        /* Turn-by-turn steps */
        const allSteps = route.legs
          .flatMap(leg => leg.steps || [])
          .map(s => ({
            instruction: s.maneuver?.instruction || s.name || '—',
            name:        s.name || '',
            distance:    s.distance > 1000
              ? `${(s.distance / 1000).toFixed(1)} km`
              : `${Math.round(s.distance)} m`,
          }))
          .filter(s => s.instruction);
        setSteps(allSteps);

        /* Map overlay */
        try {
          const ctrl = L.control({ position: 'bottomleft' });
          ctrl.onAdd = () => {
            const div = L.DomUtil.create('div');
            div.innerHTML = `
              <div style="background:white;border-radius:14px;padding:12px 16px;
                box-shadow:0 4px 20px rgba(0,0,0,0.18);
                font-family:'DM Sans',sans-serif;min-width:220px;">
                <div style="font-weight:800;font-size:13px;
                  color:${travelMode==='walking'?'#7c3aed':'#2563eb'};margin-bottom:8px;">
                  ${travelMode==='walking'?'🚶 Walking Route':'🚗 Driving Route'} · OSRM
                </div>
                <div style="display:flex;gap:24px;">
                  <div>
                    <div style="font-size:22px;font-weight:900;color:#1a1410;">${distKm} km</div>
                    <div style="font-size:10px;color:#8b7050;">Exact road distance</div>
                  </div>
                  <div>
                    <div style="font-size:22px;font-weight:900;color:#1a1410;">${dur}</div>
                    <div style="font-size:10px;color:#8b7050;">Est. travel time</div>
                  </div>
                </div>
              </div>`;
            return div;
          };
          ctrl.addTo(map);
        } catch (e) { console.warn('[DeliveryMap] Overlay error:', e); }

        /* Refit to route */
        try { map.fitBounds(L.latLngBounds(coords), { padding: [60, 60] }); }
        catch (e) { console.warn('[DeliveryMap] Refit error:', e); }
      })
      .catch(() => {
        /* Fallback: straight dashed line */
        try {
          L.polyline([[oLat, oLng], [dLat, dLng]], {
            color:'#9ca3af', weight:3, dashArray:'10 7', opacity:0.7,
          }).addTo(map);
        } catch (e) {}
        const info = { distance: 'N/A', duration: 'N/A (offline)' };
        setRouteInfo(info);
        if (onRouteReady) onRouteReady(info);
      })
      .finally(() => setLoading(false));

    return () => {
      if (leafletRef.current) { leafletRef.current.remove(); leafletRef.current = null; }
    };
  }, [waypoints, travelMode]);   // eslint-disable-line

  /* ── Invalid / missing coordinates state ── */
  if (!origin || !dest || !coordsOk) {
    const missingOrigin = !validCoords(origin);
    const missingDest   = !validCoords(dest);
    return (
      <div className="flex items-center justify-center bg-earth-50 rounded-2xl border-2 border-dashed border-earth-200"
        style={{ height }}>
        <div className="text-center text-earth-400 font-body px-6">
          <div className="text-4xl mb-2">📍</div>
          {(!origin && !dest) ? (
            <p className="text-sm">Enter coordinates and click "Get Route"</p>
          ) : (
            <>
              <p className="text-sm font-semibold text-earth-600 mb-1">Location data unavailable</p>
              {missingOrigin && <p className="text-xs text-red-500">🌾 Farm location is missing or invalid.</p>}
              {missingDest   && <p className="text-xs text-red-500">🏠 Customer location is missing or invalid.</p>}
              <p className="text-xs mt-2 text-earth-400">
                Update user profiles with GPS coordinates to enable map routing.
              </p>
            </>
          )}
        </div>
      </div>
    );
  }

  const oLat = parseFloat(origin.lat);
  const oLng = parseFloat(origin.lng);
  const dLat = parseFloat(dest.lat);
  const dLng = parseFloat(dest.lng);

  const googleMapsUrl = `https://www.google.com/maps/dir/?api=1`
    + `&origin=${oLat},${oLng}`
    + `&destination=${dLat},${dLng}`
    + `&travelmode=${travelMode==='walking'?'walking':'driving'}`;

  return (
    <div className="space-y-4">

      {/* Location cards */}
      <div className="grid sm:grid-cols-2 gap-3">
        <div className="flex items-start gap-3 p-4 bg-leaf-50 border border-leaf-200 rounded-2xl">
          <div className="w-10 h-10 bg-leaf-500 rounded-xl flex items-center justify-center text-xl shrink-0">🌾</div>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-body text-leaf-600 font-bold uppercase tracking-wide mb-0.5">Farm Origin</p>
            <p className="font-display font-bold text-earth-800 text-sm truncate">{origin.label}</p>
            <p className="text-xs text-earth-500 font-mono mt-1">
              {oLat.toFixed(6)}°N, {oLng.toFixed(6)}°E
            </p>
          </div>
        </div>
        <div className="flex items-start gap-3 p-4 bg-orange-50 border border-orange-200 rounded-2xl">
          <div className="w-10 h-10 bg-orange-500 rounded-xl flex items-center justify-center text-xl shrink-0">🏠</div>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-body text-orange-600 font-bold uppercase tracking-wide mb-0.5">Delivery Destination</p>
            <p className="font-display font-bold text-earth-800 text-sm truncate">{dest.label}</p>
            <p className="text-xs text-earth-500 font-mono mt-1">
              {dLat.toFixed(6)}°N, {dLng.toFixed(6)}°E
            </p>
          </div>
        </div>
      </div>

      {/* Map */}
      <div className="rounded-2xl overflow-hidden border border-earth-200 shadow-md relative">
        {loading && (
          <div className="absolute inset-0 z-20 bg-white/75 flex items-center justify-center backdrop-blur-sm rounded-2xl">
            <div className="flex flex-col items-center gap-3">
              <div className="spinner"/>
              <p className="text-sm text-earth-600 font-body">
                {travelMode==='walking' ? '🚶 Fetching walking route from OSRM…' : '🚗 Fetching driving route from OSRM…'}
              </p>
            </div>
          </div>
        )}
        <div id={containerId.current} style={{ height, width:'100%' }}/>
      </div>

      {/* Action buttons */}
      <div className="flex flex-wrap gap-3">
        <a href={googleMapsUrl} target="_blank" rel="noopener noreferrer"
          className="btn-primary flex items-center gap-2 text-sm">
          🗺️ Open Navigation in Google Maps
        </a>
        {steps.length > 0 && (
          <button onClick={() => setShowSteps(s => !s)}
            className="btn-secondary flex items-center gap-2 text-sm">
            {showSteps ? '▲ Hide' : '▼ Show'} Turn-by-Turn ({steps.length} steps)
          </button>
        )}
      </div>

      {/* Turn-by-turn directions */}
      {showSteps && steps.length > 0 && (
        <div className="bg-white border border-earth-100 rounded-2xl overflow-hidden shadow-sm">
          <div className="px-4 py-3 border-b border-earth-100 bg-earth-50 flex items-center justify-between">
            <h4 className="font-display font-semibold text-earth-800 text-sm">
              {travelMode==='walking'?'🚶':'🚗'} Turn-by-Turn Directions
            </h4>
            {routeInfo && (
              <span className="text-xs text-earth-500 font-body">
                {routeInfo.distance} km · {routeInfo.duration}
              </span>
            )}
          </div>
          <div className="max-h-72 overflow-y-auto divide-y divide-earth-50">
            {steps.map((step, i) => (
              <div key={i} className="flex items-start gap-3 px-4 py-2.5 hover:bg-earth-50 transition-colors">
                <div className="w-5 h-5 rounded-full bg-earth-100 flex items-center justify-center text-xs font-mono font-bold text-earth-600 shrink-0 mt-0.5">
                  {i + 1}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-body text-earth-800">{step.instruction}</p>
                  {step.name && step.name !== step.instruction && (
                    <p className="text-xs text-earth-400 font-body mt-0.5">on {step.name}</p>
                  )}
                </div>
                <span className="text-xs font-mono text-earth-400 shrink-0 mt-0.5">{step.distance}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
