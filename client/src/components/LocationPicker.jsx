/**
 * LocationPicker.jsx
 * Type a place name → Nominatim autocomplete → auto-fill lat/lng
 * Shows an OpenStreetMap iframe preview of the selected location
 */
import React, { useState, useRef, useEffect, useCallback } from 'react';

export default function LocationPicker({ value, onChange, placeholder = 'Search place name…', label = 'Location' }) {
  const [query,       setQuery]       = useState(value?.city || '');
  const [suggestions, setSuggestions] = useState([]);
  const [loading,     setLoading]     = useState(false);
  const [open,        setOpen]        = useState(false);
  const [selected,    setSelected]    = useState(value || null);
  const debounceRef = useRef(null);
  const wrapRef     = useRef(null);

  /* Close dropdown when clicking outside */
  useEffect(() => {
    const handler = (e) => { if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  /* Sync external value */
  useEffect(() => {
    if (value?.city && value.city !== query) setQuery(value.city);
  }, [value?.city]);

  const searchNominatim = useCallback(async (q) => {
    if (!q || q.length < 2) { setSuggestions([]); setOpen(false); return; }
    setLoading(true);
    try {
      const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(q)}&format=json&limit=6&addressdetails=1`;
      const res  = await fetch(url, { headers: { 'Accept-Language': 'en' } });
      const data = await res.json();
      setSuggestions(data);
      setOpen(data.length > 0);
    } catch {
      setSuggestions([]);
    } finally {
      setLoading(false);
    }
  }, []);

  const handleInput = (e) => {
    const q = e.target.value;
    setQuery(q);
    setSelected(null);
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => searchNominatim(q), 500);
  };

  const handleSelect = (item) => {
    const lat  = parseFloat(parseFloat(item.lat).toFixed(6));
    const lng  = parseFloat(parseFloat(item.lon).toFixed(6));
    // Build a clean city/place name
    const addr = item.address || {};
    const city = addr.city || addr.town || addr.village || addr.hamlet || addr.county || item.display_name.split(',')[0];
    const locationObj = { city, lat, lng, displayName: item.display_name };

    setQuery(city);
    setSelected(locationObj);
    setSuggestions([]);
    setOpen(false);
    onChange && onChange(locationObj);
  };

  const getIcon = (type) => {
    const map = { village:'🏡', town:'🏘️', city:'🏙️', hamlet:'🌾', farm:'👨‍🌾', administrative:'📍', county:'🗺️' };
    return map[type] || '📍';
  };

  // Build map iframe src only when we have a selected location
  const mapSrc = selected
    ? `https://www.openstreetmap.org/export/embed.html?bbox=${selected.lng-0.03},${selected.lat-0.03},${selected.lng+0.03},${selected.lat+0.03}&layer=mapnik&marker=${selected.lat},${selected.lng}`
    : null;

  return (
    <div>
      <label className="label">{label}</label>
      <div ref={wrapRef} className="relative">
        {/* Search input */}
        <div className="relative">
          <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-earth-400 text-lg">📍</span>
          <input
            className="input pl-10 pr-10"
            placeholder={placeholder}
            value={query}
            onChange={handleInput}
            onFocus={() => { if (suggestions.length) setOpen(true); }}
            autoComplete="off"
          />
          {loading && (
            <span className="absolute right-3 top-1/2 -translate-y-1/2">
              <span className="spinner spinner-sm" style={{ width:16, height:16 }} />
            </span>
          )}
          {selected && !loading && (
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-leaf-500 text-base">✓</span>
          )}
        </div>

        {/* Dropdown */}
        {open && suggestions.length > 0 && (
          <div className="location-dropdown">
            {suggestions.map((item) => (
              <div
                key={item.place_id}
                className="location-option"
                onMouseDown={() => handleSelect(item)}
              >
                <span className="text-lg shrink-0 mt-0.5">{getIcon(item.type)}</span>
                <div>
                  <div className="font-medium text-earth-800 leading-snug">
                    {item.address?.city || item.address?.town || item.address?.village || item.display_name.split(',')[0]}
                  </div>
                  <div className="text-xs text-earth-400 mt-0.5 leading-snug line-clamp-1">
                    {item.display_name}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Coordinates display */}
      {selected && (
        <div className="mt-2 flex items-center gap-4 animate-fade-in">
          <div className="flex items-center gap-2 text-xs font-mono text-earth-500 bg-earth-50 px-3 py-1.5 rounded-lg border border-earth-200">
            <span className="text-leaf-500">Lat:</span>
            <span className="text-earth-700 font-semibold">{selected.lat}</span>
            <span className="mx-1 text-earth-300">|</span>
            <span className="text-leaf-500">Lng:</span>
            <span className="text-earth-700 font-semibold">{selected.lng}</span>
          </div>
          <span className="badge-green text-xs">✓ Coordinates set</span>
        </div>
      )}

      {/* OpenStreetMap iframe preview */}
      {mapSrc && (
        <div className="mt-3 rounded-xl overflow-hidden border border-earth-200 shadow-sm animate-slide-up">
          <div className="bg-earth-50 px-3 py-1.5 flex items-center gap-2 border-b border-earth-200">
            <span className="text-sm">🗺️</span>
            <span className="text-xs font-medium text-earth-600 font-body">Location Preview — OpenStreetMap</span>
          </div>
          <iframe
            title="Location map"
            src={mapSrc}
            style={{ width: '100%', height: '200px', border: 'none', display: 'block' }}
            loading="lazy"
          />
          <div className="bg-earth-50 px-3 py-1 text-xs text-earth-400 font-body">
            © OpenStreetMap contributors
          </div>
        </div>
      )}

      {!selected && query.length > 1 && !loading && suggestions.length === 0 && (
        <p className="mt-1.5 text-xs text-earth-400 font-body">No results found. Try a different spelling.</p>
      )}
    </div>
  );
}
