import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { MdLocalShipping, MdCheckCircle, MdPending, MdCancel, MdRoute, MdTimer, MdStraighten, MdChat, MdPerson } from 'react-icons/md';
import { GiWheat } from 'react-icons/gi';
import { ordersAPI, routeAPI, chatAPI } from '../utils/api';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import { npr } from '../utils/currency';
import DeliveryMap from './DeliveryMap';

const STATUS_COLOR = { Pending: 'badge-yellow', 'In-Transit': 'badge-blue', Delivered: 'badge-green', Cancelled: 'badge-red' };
const STATUS_ICON_CMP = { Pending: <MdPending size={13} />, 'In-Transit': <MdLocalShipping size={13} />, Delivered: <MdCheckCircle size={13} />, Cancelled: <MdCancel size={13} /> };
const PAY_COLOR = { Unpaid: 'badge-red', Initiated: 'badge-yellow', AdvancePaid: 'badge-yellow', Paid: 'badge-green', Failed: 'badge-red', Refunded: 'badge-earth' };
const PAY_ICON = { Khalti: '💜', 'Khalti-Advance': '💜', COD: '💵', '': '—' };

function RoutePreview() {
  const EMPTY = { farmLat: '', farmLng: '', destLat: '', destLng: '', farmLabel: '', destLabel: '' };
  const [form, setForm] = useState(EMPTY);
  const [waypoints, setWaypoints] = useState(null);  // set after "Get Route"
  const [travelMode, setTravelMode] = useState('driving');
  const [routeInfo, setRouteInfo] = useState(null);  // filled by DeliveryMap via callback
  const [formError, setFormError] = useState('');

  const set = k => e => setForm(p => ({ ...p, [k]: e.target.value }));

  const handleSubmit = (e) => {
    e.preventDefault();
    setFormError('');
    const fLat = parseFloat(form.farmLat);
    const fLng = parseFloat(form.farmLng);
    const dLat = parseFloat(form.destLat);
    const dLng = parseFloat(form.destLng);

    if (isNaN(fLat) || isNaN(fLng) || isNaN(dLat) || isNaN(dLng)) {
      setFormError('Please enter valid coordinates for both locations.');
      return;
    }
    if (fLat < -90 || fLat > 90 || dLat < -90 || dLat > 90) {
      setFormError('Latitude must be between -90 and 90.');
      return;
    }
    if (fLng < -180 || fLng > 180 || dLng < -180 || dLng > 180) {
      setFormError('Longitude must be between -180 and 180.');
      return;
    }

    setRouteInfo(null);
    setWaypoints([
      { id: 'FARM', label: form.farmLabel || 'Farm', lat: fLat, lng: fLng },
      { id: 'DEST', label: form.destLabel || 'Customer', lat: dLat, lng: dLng },
    ]);
  };

  return (
    <div className="card">
      <h2 className="text-xl font-display font-semibold text-earth-800 mb-1 flex items-center gap-2">
        <MdRoute className="text-leaf-500" size={24} /> Route Planner
      </h2>
      <p className="text-sm text-earth-400 mb-5 font-body">
        Enter exact GPS coordinates for the farm and customer to get a real road distance and turn-by-turn directions.
      </p>

      <form onSubmit={handleSubmit} className="space-y-4 mb-5">
        {/* Name fields */}
        <div className="grid sm:grid-cols-2 gap-4">
          <div>
            <label className="label text-xs">Farm / Farmer Name</label>
            <input className="input text-sm" placeholder="e.g. Ram's Organic Farm"
              value={form.farmLabel} onChange={set('farmLabel')} />
          </div>
          <div>
            <label className="label text-xs">Customer Name</label>
            <input className="input text-sm" placeholder="e.g. Sita's Home"
              value={form.destLabel} onChange={set('destLabel')} />
          </div>
        </div>

        {/* Farm coordinates */}
        <div>
          <p className="text-xs font-semibold text-leaf-700 mb-2 flex items-center gap-1.5">
            Farm Location Coordinates
          </p>
          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <label className="label text-xs">Farm Latitude</label>
              <input className="input text-sm" type="number" step="any"
                placeholder="e.g. 28.2096" value={form.farmLat} onChange={set('farmLat')} required />
            </div>
            <div>
              <label className="label text-xs">Farm Longitude</label>
              <input className="input text-sm" type="number" step="any"
                placeholder="e.g. 83.9856" value={form.farmLng} onChange={set('farmLng')} required />
            </div>
          </div>
        </div>

        {/* Consumer coordinates */}
        <div>
          <p className="text-xs font-semibold text-orange-600 mb-2 flex items-center gap-1.5">
            Customer Location Coordinates
          </p>
          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <label className="label text-xs">Customer Latitude</label>
              <input className="input text-sm" type="number" step="any"
                placeholder="e.g. 27.7172" value={form.destLat} onChange={set('destLat')} required />
            </div>
            <div>
              <label className="label text-xs">Customer Longitude</label>
              <input className="input text-sm" type="number" step="any"
                placeholder="e.g. 85.3240" value={form.destLng} onChange={set('destLng')} required />
            </div>
          </div>
        </div>



        {/* Travel mode + submit */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-1 bg-earth-50 border border-earth-100 rounded-xl p-1">
            {[
              { id: 'driving', label: ' Driving' },
              { id: 'walking', label: ' Walking' },
            ].map(m => (
              <button key={m.id} type="button" onClick={() => { setTravelMode(m.id); setWaypoints(null); setRouteInfo(null); }}
                className={`px-4 py-1.5 rounded-lg text-sm font-body font-medium transition-all
                  ${travelMode === m.id ? 'bg-white shadow-sm text-earth-800' : 'text-earth-500 hover:text-earth-700'}`}>
                {m.label}
              </button>
            ))}
          </div>
          <button type="submit" className="btn-primary flex items-center gap-2">
            <MdRoute size={18} /> Get Route
          </button>
        </div>

        {formError && (
          <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-red-600 text-sm font-body">{formError}</div>
        )}
      </form>

      {/* Route result — distance/time come from OSRM via DeliveryMap callback */}
      {waypoints && (
        <div className="space-y-4 animate-slide-up">

          {/* Stats — populated once OSRM responds */}
          {routeInfo && (
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-earth-50 rounded-xl p-4 flex flex-col items-center text-center gap-1">
                <MdStraighten size={20} className="text-leaf-500" />
                <p className="text-xs text-earth-400 font-body">Real Road Distance</p>
                <p className="text-xl font-display font-bold text-earth-800">{routeInfo.distance} km</p>
              </div>
              <div className="bg-earth-50 rounded-xl p-4 flex flex-col items-center text-center gap-1">
                <MdTimer size={20} className="text-harvest-500" />
                <p className="text-xs text-earth-400 font-body">Est. {travelMode === 'walking' ? 'Walking' : 'Driving'} Time</p>
                <p className="text-xl font-display font-bold text-earth-800">{routeInfo.duration}</p>
              </div>
            </div>
          )}

          {/* Route labels */}
          <div className="flex items-center gap-3 flex-wrap">
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-body font-medium bg-leaf-100 text-leaf-700">
              🌾 {waypoints[0].label}
            </div>
            <span className="text-earth-300 text-lg">→</span>
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-body font-medium bg-orange-100 text-orange-700">
              🏠 {waypoints[1].label}
            </div>
          </div>

          {/* Map — fetches OSRM and reports back via onRouteReady */}
          <DeliveryMap
            waypoints={waypoints}
            height="460px"
            travelMode={travelMode}
            onRouteReady={setRouteInfo}
          />
        </div>
      )}
    </div>
  );
}

export default function LogisticsTracker() {
  const { user } = useAuth();
  const { t } = useLanguage();
  const navigate = useNavigate();
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [routes, setRoutes] = useState({});
  const [expanding, setExpanding] = useState(null);
  const [chatLoading, setChatLoading] = useState(null); // orderId being opened
  const [farmerPanel, setFarmerPanel] = useState(null); // orderId with farmer panel open

  useEffect(() => {
    (async () => {
      try { const { data } = await ordersAPI.getAll(); setOrders(data); }
      catch (e) { console.error(e); }
      finally { setLoading(false); }
    })();
  }, []);

  const loadRoute = async (orderId) => {
    if (routes[orderId]) { setExpanding(p => p === orderId ? null : orderId); return; }
    setExpanding(orderId);
    try {
      const { data } = await routeAPI.optimise(orderId);
      setRoutes(p => ({ ...p, [orderId]: data }));
    } catch (e) { alert(e.response?.data?.message || 'Failed to load route'); setExpanding(null); }
  };

  const updateStatus = async (id, status) => {
    const { data } = await ordersAPI.setStatus(id, status);
    setOrders(p => p.map(o => o._id === id ? { ...o, status: data.status } : o));
  };

  const startChat = async (order) => {
    setChatLoading(order._id);
    try {
      await chatAPI.startConversation(order.farmerID._id, order.productID?._id);
      // tells ChatPage to immediately open the freshest conversation
      navigate('/dashboard/chat?autoOpen=newest');
    } catch (e) {
      alert(e.response?.data?.message || 'Could not open chat');
    } finally { setChatLoading(null); }
  };

  return (
    <div className="space-y-6 animate-fade-in max-w-7xl mx-auto">
      <div>
        <h1 className="section-title text-3xl flex items-center gap-2">
          <MdLocalShipping className="text-leaf-500" size={32} /> Logistics & Delivery
        </h1>
        {/* <p className="section-sub">Real road routes via OSRM · Exact GPS pins · Walking or driving</p> */}
      </div>

      <RoutePreview />

      <div className="card">
        <h2 className="text-xl font-display font-semibold text-earth-800 mb-5 flex items-center gap-2">
          {user?.role === 'Farmer'
            ? <><MdLocalShipping className="text-leaf-500" /> Incoming Orders</>
            : <><MdLocalShipping className="text-leaf-500" /> My Orders</>}
        </h2>

        {loading ? (
          <div className="flex justify-center py-16"><div className="spinner" /></div>
        ) : orders.length === 0 ? (
          <div className="text-center py-16 text-earth-400">
            <MdLocalShipping size={48} className="mx-auto mb-3 opacity-20" />
            <p className="font-body">No orders yet.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {orders.map(order => (
              <div key={order._id} className="border border-earth-100 rounded-2xl overflow-hidden">
                <div className="flex flex-col sm:flex-row sm:items-center gap-4 p-4 bg-white hover:bg-earth-50 transition-colors">
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    {order.productID?.imageURL
                      ? <img src={order.productID.imageURL} alt="" className="w-12 h-12 rounded-xl object-cover shrink-0" />
                      : <div className="w-12 h-12 rounded-xl bg-leaf-100 flex items-center justify-center shrink-0"><GiWheat className="text-leaf-500" size={22} /></div>}
                    <div className="min-w-0">
                      <p className="font-semibold text-earth-800 truncate font-body">{order.productID?.cropName || 'Product'}</p>
                      <p className="text-xs text-earth-400 font-body">
                        {user?.role === 'Farmer' ? `👤 ${order.consumerID?.name}` : ` ${order.farmerID?.name}`}
                        &nbsp;·&nbsp;Qty: {order.quantity}
                      </p>
                    </div>
                  </div>

                  <div className="text-right shrink-0">
                    <p className="font-display font-bold text-earth-800 text-sm">{npr(order.totalPrice)}</p>
                    <p className="text-xs text-earth-400">{new Date(order.createdAt).toLocaleDateString('en-NP')}</p>
                  </div>

                  <div className="flex flex-col gap-1.5 shrink-0">
                    <span className={`badge ${STATUS_COLOR[order.status] || 'badge-earth'} text-xs flex items-center gap-1`}>
                      {STATUS_ICON_CMP[order.status]} {order.status}
                    </span>
                    <span className={`badge ${PAY_COLOR[order.paymentStatus] || 'badge-earth'} text-xs`}>
                      {PAY_ICON[order.paymentMethod || '']}
                      {order.paymentStatus === 'AdvancePaid' ? '25% Advance Paid' : order.paymentStatus}
                    </span>
                  </div>

                  {/* COD advance/remaining breakdown */}
                  {order.paymentStatus === 'AdvancePaid' && order.remainingAmount > 0 && (
                    <div className="mt-2 flex items-center gap-2 text-xs font-body text-amber-700 bg-amber-50 border border-amber-100 rounded-xl px-3 py-1.5">
                      <span> Advance paid: <strong>{npr(order.advanceAmount)}</strong></span>
                      <span className="text-earth-300">·</span>
                      <span>Collect on delivery: <strong>{npr(order.remainingAmount)}</strong></span>
                    </div>
                  )}

                  <div className="flex items-center gap-2 shrink-0">
                    {user?.role === 'Farmer' && order.status === 'Pending' && (
                      <button onClick={() => updateStatus(order._id, 'In-Transit')} className="btn-primary text-xs py-1.5 px-3 flex items-center gap-1">
                        <MdLocalShipping size={14} /> Ship
                      </button>
                    )}
                    {user?.role === 'Farmer' && order.status === 'In-Transit' && (
                      <button onClick={() => updateStatus(order._id, 'Delivered')} className="btn-harvest text-xs py-1.5 px-3 flex items-center gap-1">
                        <MdCheckCircle size={14} /> Delivered
                      </button>
                    )}
                    <button onClick={() => loadRoute(order._id)} className="btn-secondary text-xs py-1.5 px-3 flex items-center gap-1">
                      {expanding === order._id && !routes[order._id]
                        ? <span className="spinner" style={{ width: 12, height: 12, borderWidth: 1.5 }} />
                        : <MdRoute size={14} />} Map
                    </button>
                    {/* Consumer-only: view farmer profile + open chat */}
                    {user?.role === 'Consumer' && order.farmerID && (<>
                      <button
                        onClick={() => setFarmerPanel(p => p === order._id ? null : order._id)}
                        title="View Farmer Info"
                        className={`text-xs py-1.5 px-3 flex items-center gap-1 rounded-xl border font-body font-medium transition-all
                          ${farmerPanel === order._id ? 'bg-leaf-100 border-leaf-300 text-leaf-700' : 'btn-secondary'}`}
                      >
                        <MdPerson size={14} /> {farmerPanel === order._id ? 'Hide' : 'Farmer'}
                      </button>
                      <button
                        onClick={() => startChat(order)}
                        disabled={chatLoading === order._id}
                        title="Chat with Farmer"
                        className="btn-primary text-xs py-1.5 px-3 flex items-center gap-1"
                      >
                        {chatLoading === order._id
                          ? <span className="spinner" style={{ width: 12, height: 12, borderWidth: 1.5 }} />
                          : <MdChat size={14} />} Chat
                      </button>
                    </>)}
                  </div>
                </div>

                {/* Expanded route map for order */}
                {expanding === order._id && routes[order._id] && (() => {
                  const wps = routes[order._id].waypoints;
                  // Guard: ensure first and last waypoints have valid GPS coordinates
                  const org = wps?.find(w => w && isFinite(parseFloat(w.lat)) && isFinite(parseFloat(w.lng)));
                  const dst = [...(wps || [])].reverse().find(w => w && isFinite(parseFloat(w.lat)) && isFinite(parseFloat(w.lng)));
                  if (!org || !dst || org === dst) {
                    return (
                      <div className="border-t border-earth-100 bg-earth-50 p-5 animate-slide-up">
                        <div className="flex items-center gap-3 p-4 bg-red-50 border border-red-100 rounded-xl text-sm text-red-600 font-body">
                          📍 Route map unavailable — farm or customer location data is missing.
                          Please ensure both the farmer's product and the customer's profile have GPS coordinates set.
                        </div>
                      </div>
                    );
                  }
                  return (
                    <div className="border-t border-earth-100 bg-earth-50 p-5 space-y-4 animate-slide-up">
                      <div className="flex items-center gap-3 flex-wrap">
                        <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-body font-medium bg-leaf-100 text-leaf-700">
                          {org.label}
                        </div>
                        <span className="text-earth-300 text-lg">→</span>
                        <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-body font-medium bg-orange-100 text-orange-700">
                          {dst.label}
                        </div>
                      </div>
                      <DeliveryMap
                        waypoints={[org, dst]}
                        height="380px"
                        travelMode="driving"
                      />
                    </div>
                  );
                })()}

                {/* Farmer info panel — consumer only */}
                {user?.role === 'Consumer' && farmerPanel === order._id && order.farmerID && (
                  <div className="border-t border-earth-100 bg-gradient-to-br from-leaf-50 to-earth-50 p-5 animate-slide-up">
                    <div className="flex items-center gap-4 mb-4">
                      {order.farmerID.avatar
                        ? <img src={order.farmerID.avatar} alt="" className="w-14 h-14 rounded-full object-cover ring-2 ring-leaf-200" />
                        : <div className="w-14 h-14 rounded-full bg-gradient-to-br from-leaf-300 to-leaf-600 flex items-center justify-center text-white text-xl font-bold">{order.farmerID.name?.[0]?.toUpperCase() || 'F'}</div>}
                      <div>
                        <h3 className="font-display font-bold text-earth-800 text-base">👨‍🌾 {order.farmerID.name}</h3>
                        {order.farmerID.location?.city && (
                          <p className="text-sm text-earth-500 font-body flex items-center gap-1 mt-0.5">📍 {order.farmerID.location.city}</p>
                        )}
                        {order.farmerID.phone && (
                          <p className="text-sm text-earth-500 font-body flex items-center gap-1">📞 {order.farmerID.phone}</p>
                        )}
                        {order.farmerID.bio && (
                          <p className="text-xs text-earth-400 font-body mt-1 italic">&ldquo;{order.farmerID.bio}&rdquo;</p>
                        )}
                      </div>
                    </div>
                    <button
                      onClick={() => startChat(order)}
                      disabled={chatLoading === order._id}
                      className="btn-primary text-sm py-2 px-4 flex items-center gap-2"
                    >
                      {chatLoading === order._id
                        ? <><span className="spinner" style={{ width: 14, height: 14, borderWidth: 2 }} /> Opening…</>
                        : <><MdChat size={16} /> Message {order.farmerID.name?.split(' ')[0]}</>}
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
