import React, { useState, useEffect, useRef } from 'react';
import { MdLocationOn, MdDirections, MdPerson, MdStar, MdRefresh, MdStorefront } from 'react-icons/md';
import { GiFarmer, GiWheat } from 'react-icons/gi';
import { routeAPI, chatAPI } from '../utils/api';
import { useAuth } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';
import { npr } from '../utils/currency';

let L;
if (typeof window !== 'undefined') {
  L = require('leaflet');
  delete L.Icon.Default.prototype._getIconUrl;
  L.Icon.Default.mergeOptions({
    iconRetinaUrl:'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
    iconUrl:'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
    shadowUrl:'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
  });
}

function makeIcon(color, emoji) {
  if (!L) return null;
  return L.divIcon({
    className:'',
    html:`<div style="background:${color};width:36px;height:36px;border-radius:50% 50% 50% 0;transform:rotate(-45deg);border:3px solid white;box-shadow:0 3px 12px rgba(0,0,0,0.3);display:flex;align-items:center;justify-content:center;font-size:14px;"><span style="transform:rotate(45deg)">${emoji}</span></div>`,
    iconSize:[36,36], iconAnchor:[18,36], popupAnchor:[0,-38],
  });
}

function FarmerCard({ result, rank, onViewRoute, onChat }) {
  const { farmer, distance, estimatedTime, directKm } = result;
  return (
    <div className="card-hover flex gap-4 items-start">
      <div className={`w-8 h-8 rounded-full flex items-center justify-center text-white font-bold text-sm shrink-0
        ${rank===1?'bg-harvest-500':rank===2?'bg-earth-400':'bg-leaf-400'}`}>
        {rank}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          {farmer.avatar
            ? <img src={farmer.avatar} alt="" className="w-8 h-8 rounded-full object-cover"/>
            : <div className="w-8 h-8 rounded-full bg-leaf-200 flex items-center justify-center"><GiFarmer size={16} className="text-leaf-600"/></div>}
          <div>
            <h3 className="font-display font-semibold text-earth-800 text-sm">{farmer.name}</h3>
            <p className="text-xs text-earth-400 font-body flex items-center gap-1">
              <MdLocationOn size={10}/>{farmer.location?.city}
            </p>
          </div>
        </div>
        {farmer.avgRating > 0 && (
          <div className="flex items-center gap-1 mb-1">
            <MdStar size={12} className="text-harvest-400"/>
            <span className="text-xs text-earth-500 font-body">{farmer.avgRating.toFixed(1)} rating</span>
          </div>
        )}
        <div className="flex flex-wrap gap-2 text-xs font-body mb-3">
          <span className="badge-green">🗺️ {distance} km road</span>
          <span className="badge-earth">⏱ {estimatedTime}</span>
          <span className="badge-blue">📦 {farmer.productCount || 0} products</span>
        </div>
        <div className="flex gap-2">
          <button onClick={() => onViewRoute(result)} className="btn-primary text-xs py-1.5 px-3 flex items-center gap-1">
            <MdDirections size={14}/> View Route
          </button>
          <button onClick={() => onChat(farmer)} className="btn-secondary text-xs py-1.5 px-3 flex items-center gap-1">
            💬 Chat
          </button>
        </div>
      </div>
    </div>
  );
}

export default function NearestFarmersMap() {
  const { user }    = useAuth();
  const navigate    = useNavigate();
  const mapRef      = useRef(null);
  const leafletRef  = useRef(null);
  const mapContainerId = useRef(`nfmap-${Math.random().toString(36).slice(2)}`);

  const [farmers,   setFarmers]   = useState([]);
  const [loading,   setLoading]   = useState(false);
  const [activeRoute, setActiveRoute] = useState(null);
  const [error,     setError]     = useState('');

  const userLat = user?.location?.lat || 27.7172;
  const userLng = user?.location?.lng || 85.3240;

  const loadFarmers = async () => {
    if (!userLat || !userLng) { setError('Please set your location in Profile first.'); return; }
    setLoading(true); setError('');
    try {
      const { data } = await routeAPI.nearestFarmers(userLat, userLng, 8);
      setFarmers(data.farmers || []);
    } catch(e) {
      setError(e.response?.data?.message || 'Failed to load nearest farmers');
    } finally { setLoading(false); }
  };

  useEffect(() => { loadFarmers(); }, []);

  // Render Leaflet map whenever activeRoute or farmers change
  useEffect(() => {
    if (!L) return;
    if (leafletRef.current) { leafletRef.current.remove(); leafletRef.current = null; }
    const el = document.getElementById(mapContainerId.current);
    if (!el) return;

    const map = L.map(el, { scrollWheelZoom: true });
    leafletRef.current = map;
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution:'© OpenStreetMap contributors', maxZoom:18,
    }).addTo(map);

    const bounds = [];

    // Consumer marker
    const consumerMarker = L.marker([userLat, userLng], { icon: makeIcon('#068ae0','🏠') });
    consumerMarker.bindPopup(`<div style="font-family:'DM Sans',sans-serif"><b style="color:#068ae0">📍 Your Location</b><br><small>${user?.name || 'You'}</small><br><small>${user?.location?.city || ''}</small></div>`);
    consumerMarker.addTo(map);
    bounds.push([userLat, userLng]);

    if (activeRoute) {
      // Draw the selected route
      const { waypoints, distance, estimatedTime, farmer: f } = activeRoute;
      if (waypoints?.length > 1) {
        const latlngs = waypoints.map(w => [w.lat, w.lng]);
        L.polyline(latlngs, { color:'#000', weight:7, opacity:0.1 }).addTo(map);
        L.polyline(latlngs, { color:'#2a8f2a', weight:5, opacity:0.9, lineJoin:'round' }).addTo(map);

        waypoints.forEach((wp, i) => {
          const isFarm = i === 0, isDest = i === waypoints.length - 1;
          const color  = isFarm ? '#2a8f2a' : isDest ? '#068ae0' : '#f59e0b';
          const icon   = isFarm ? '🏡' : isDest ? '🏠' : '🔄';
          const m = L.marker([wp.lat, wp.lng], { icon: makeIcon(color, icon) });
          m.bindPopup(`<div style="font-family:'DM Sans',sans-serif"><b>${wp.label}</b><br><small>Stop ${i+1} of ${waypoints.length}</small></div>`);
          m.addTo(map);
          bounds.push([wp.lat, wp.lng]);
        });

        // Distance overlay
        const info = L.control({ position:'bottomright' });
        info.onAdd = () => {
          const d = L.DomUtil.create('div');
          d.innerHTML = `<div style="background:white;border-radius:12px;padding:10px 14px;box-shadow:0 2px 12px rgba(0,0,0,0.15);font-family:'DM Sans',sans-serif;min-width:170px"><div style="font-weight:700;color:#2a8f2a;font-size:13px">🗺️ Route to ${f.name}</div><div style="display:flex;gap:16px;margin-top:6px"><div><div style="font-size:17px;font-weight:800;color:#3a2a1f">${distance} km</div><div style="font-size:10px;color:#8b7050">Road dist.</div></div><div><div style="font-size:17px;font-weight:800;color:#3a2a1f">${estimatedTime}</div><div style="font-size:10px;color:#8b7050">Est. time</div></div></div></div>`;
          return d;
        };
        info.addTo(map);
      }
    } else {
      // Show all farmer markers
      farmers.forEach((result, i) => {
        const { farmer: f, distance } = result;
        if (!f.location?.lat) return;
        const m = L.marker([f.location.lat, f.location.lng], { icon: makeIcon('#2a8f2a','👨‍🌾') });
        m.bindPopup(`<div style="font-family:'DM Sans',sans-serif;min-width:150px"><b style="color:#2a8f2a">${f.name}</b><br><small>📍 ${f.location.city}</small><br><small>📦 ${f.productCount} products</small><br><small>🗺️ ${distance} km road distance</small></div>`);
        m.addTo(map);
        bounds.push([f.location.lat, f.location.lng]);
      });
    }

    if (bounds.length > 0) {
      map.fitBounds(L.latLngBounds(bounds), { padding:[40,40] });
    } else {
      map.setView([userLat, userLng], 8);
    }

    return () => { if (leafletRef.current) { leafletRef.current.remove(); leafletRef.current = null; } };
  }, [farmers, activeRoute, userLat, userLng]);

  const handleChat = async (farmer) => {
    try {
      await chatAPI.startConversation(farmer._id, null);
      navigate('/dashboard/chat');
    } catch(e) { alert('Could not start conversation'); }
  };

  return (
    <div className="space-y-6 animate-fade-in max-w-7xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="section-title text-3xl flex items-center gap-2">
            <MdLocationOn className="text-leaf-500" size={32}/> Nearest Farmers
          </h1>
          <p className="section-sub">
            Farmers sorted by optimal road route from your location
            {user?.location?.city && <span className="text-leaf-600 font-medium"> · {user.location.city}</span>}
          </p>
        </div>
        <button onClick={loadFarmers} disabled={loading} className="btn-secondary flex items-center gap-2 self-start">
          <MdRefresh size={18} className={loading?'animate-spin':''}/> Refresh
        </button>
      </div>

      {error && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-xl text-red-600 text-sm font-body">{error}</div>
      )}

      <div className="grid lg:grid-cols-5 gap-6">
        {/* Farmer list */}
        <div className="lg:col-span-2 space-y-4">
          {activeRoute && (
            <button onClick={() => setActiveRoute(null)}
              className="w-full text-sm font-body text-leaf-600 bg-leaf-50 border border-leaf-200 rounded-xl px-4 py-2.5 hover:bg-leaf-100 transition-colors flex items-center gap-2">
              ← Back to all farmers
            </button>
          )}

          {loading ? (
            <div className="flex justify-center py-12"><div className="spinner"/></div>
          ) : farmers.length === 0 ? (
            <div className="card text-center py-12">
              <GiFarmer size={48} className="mx-auto mb-3 text-earth-200"/>
              <p className="text-earth-400 font-body">No farmers found nearby</p>
            </div>
          ) : (
            (activeRoute ? [activeRoute] : farmers).map((result, i) => (
              <FarmerCard
                key={result.farmer._id}
                result={result}
                rank={i+1}
                onViewRoute={r => setActiveRoute(r)}
                onChat={handleChat}
              />
            ))
          )}
        </div>

        {/* Map */}
        <div className="lg:col-span-3">
          <div className="rounded-2xl overflow-hidden border border-earth-200 shadow-card sticky top-24">
            <div className="bg-earth-50 px-4 py-2.5 border-b border-earth-200 flex items-center gap-2">
              <MdLocationOn size={16} className="text-leaf-500"/>
              <span className="text-xs font-medium text-earth-600 font-body">
                {activeRoute ? `Route to ${activeRoute.farmer.name}` : `${farmers.length} farmers on map`}
              </span>
              <span className="ml-auto text-xs text-earth-400 font-body">© OpenStreetMap</span>
            </div>
            <div id={mapContainerId.current} style={{ height:'480px', width:'100%' }}/>
          </div>
        </div>
      </div>

      {/* Legend */}
      <div className="card">
        <h3 className="font-display font-semibold text-earth-800 mb-3 text-sm">Map Legend</h3>
        <div className="flex flex-wrap gap-4 text-sm font-body">
          {[['🏠','Your Location (blue)'],['👨‍🌾','Farmer (green)'],['🔄','Route Hub (orange)'],['🗺️','Road distance via Nepal hub network']].map(([icon,label])=>(
            <div key={label} className="flex items-center gap-2 text-earth-600">
              <span>{icon}</span><span>{label}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
