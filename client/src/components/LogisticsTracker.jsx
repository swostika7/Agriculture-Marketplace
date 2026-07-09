import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  MdLocalShipping, MdCheckCircle, MdPending, MdCancel,
  MdRoute, MdTimer, MdStraighten, MdChat, MdPerson,
  MdWarning, MdClose, MdRefresh, MdInfo,
} from 'react-icons/md';
import { GiWheat } from 'react-icons/gi';
import { ordersAPI, routeAPI, chatAPI } from '../utils/api';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import { npr } from '../utils/currency';
import DeliveryMap from './DeliveryMap';

const STATUS_COLOR    = { Pending:'badge-yellow','In-Transit':'badge-blue',Delivered:'badge-green',Cancelled:'badge-red' };
const STATUS_ICON_CMP = {
  Pending:     <MdPending size={13}/>,
  'In-Transit':<MdLocalShipping size={13}/>,
  Delivered:   <MdCheckCircle size={13}/>,
  Cancelled:   <MdCancel size={13}/>,
};
const PAY_COLOR = { Unpaid:'badge-red',Initiated:'badge-yellow',AdvancePaid:'badge-yellow',Paid:'badge-green',Failed:'badge-red',Refunded:'badge-earth' };
const PAY_ICON  = { eSewa:'💚',COD:'💵','':'—' };

/* ════════════════════════════════════════════════════════
   CANCEL ORDER MODAL
   Shows rules, refund info, confirmation before cancelling
════════════════════════════════════════════════════════ */
function CancelOrderModal({ order, onConfirm, onClose, loading }) {
  const p = order?.productID;
  const isPaid   = ['Paid','AdvancePaid'].includes(order?.paymentStatus);
  const isAdvance= order?.paymentStatus === 'AdvancePaid';

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background:'rgba(0,0,0,0.60)', backdropFilter:'blur(4px)' }}
      onClick={e => { if (e.target===e.currentTarget && !loading) onClose(); }}
    >
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md overflow-hidden">

        {/* Header */}
        <div className="bg-gradient-to-r from-red-500 to-red-600 px-6 py-5 text-white flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center">
              <MdCancel size={22}/>
            </div>
            <div>
              <h2 className="font-display font-bold text-lg leading-tight">Cancel Order</h2>
              <p className="text-red-200 text-xs font-body">This action cannot be undone</p>
            </div>
          </div>
          {!loading && (
            <button onClick={onClose} className="w-8 h-8 rounded-xl bg-white/10 hover:bg-white/20 flex items-center justify-center">
              <MdClose size={18}/>
            </button>
          )}
        </div>

        <div className="px-6 py-5 space-y-4">

          {/* Product summary */}
          <div className="flex items-center gap-3 p-3.5 bg-earth-50 border border-earth-100 rounded-2xl">
            {p?.imageURL
              ? <img src={p.imageURL} alt="" className="w-14 h-14 rounded-xl object-cover shrink-0"/>
              : <div className="w-14 h-14 rounded-xl bg-leaf-100 flex items-center justify-center shrink-0">
                  <GiWheat size={22} className="text-leaf-400"/>
                </div>}
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-earth-800 font-body truncate">{p?.cropName}</p>
              <p className="text-xs text-earth-400 font-body">Qty: {order?.quantity} · Total: {npr(order?.totalPrice)}</p>
              <p className="text-xs text-earth-400 font-body">From: {order?.farmerID?.name}</p>
            </div>
          </div>

          {/* Refund info box */}
          {isPaid && (
            <div className={`flex items-start gap-3 p-4 rounded-2xl border ${
              isAdvance
                ? 'bg-amber-50 border-amber-200'
                : 'bg-leaf-50 border-leaf-200'
            }`}>
              <MdInfo size={18} className={`shrink-0 mt-0.5 ${isAdvance ? 'text-amber-500' : 'text-leaf-500'}`}/>
              <div>
                <p className={`text-sm font-body font-semibold mb-1 ${isAdvance ? 'text-amber-700' : 'text-leaf-700'}`}>
                  {isAdvance ? 'Advance Payment Refund' : 'Full Payment Refund'}
                </p>
                <p className={`text-xs font-body ${isAdvance ? 'text-amber-600' : 'text-leaf-600'}`}>
                  {isAdvance
                    ? `Your eSewa advance of ${npr(order.advanceAmount)} will be marked for refund. The refund will be processed to your eSewa account within 3–5 business days.`
                    : `Your payment of ${npr(order.totalPrice)} will be marked as Refunded. Contact the farmer via chat to confirm the eSewa refund to your account.`
                  }
                </p>
              </div>
            </div>
          )}

          {/* Warning — cancellation rules */}
          <div className="flex items-start gap-3 p-4 bg-red-50 border border-red-200 rounded-2xl">
            <MdWarning size={18} className="text-red-500 shrink-0 mt-0.5"/>
            <div className="text-xs font-body text-red-700 space-y-1">
              <p className="font-semibold text-sm">Before you cancel:</p>
              <p>✓ Cancellation is only allowed while the order is <strong>Pending</strong> (before the farmer ships).</p>
              <p>✓ Once the farmer marks it <strong>In-Transit</strong>, you can no longer cancel — contact them via chat instead.</p>
              {isPaid && <p>✓ Refunds are processed manually through eSewa and may take 3–5 business days.</p>}
            </div>
          </div>

          {/* Actions */}
          <div className="flex gap-3 pt-1">
            <button
              onClick={onClose}
              disabled={loading}
              className="btn-secondary flex-1 justify-center py-3 disabled:opacity-50"
            >
              Keep Order
            </button>
            <button
              onClick={onConfirm}
              disabled={loading}
              className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl bg-red-600 hover:bg-red-700 active:bg-red-800 disabled:opacity-60 text-white font-body font-bold text-sm transition-colors"
            >
              {loading
                ? <><span className="spinner" style={{width:16,height:16,borderWidth:2,borderColor:'rgba(255,255,255,0.3)',borderTopColor:'white'}}/> Cancelling…</>
                : <><MdCancel size={16}/> Yes, Cancel Order</>}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ════════════════════════════════════════════════════════
   MAIN LOGISTICS TRACKER
════════════════════════════════════════════════════════ */
export default function LogisticsTracker() {
  const { user }    = useAuth();
  const { t }       = useLanguage();
  const navigate    = useNavigate();
  const [orders,       setOrders]       = useState([]);
  const [loading,      setLoading]      = useState(true);
  const [routes,       setRoutes]       = useState({});
  const [expanding,    setExpanding]    = useState(null);
  const [farmerPanel,  setFarmerPanel]  = useState(null);
  const [chatLoading,  setChatLoading]  = useState(null);
  const [filter,       setFilter]       = useState('All');

  // Cancel modal state
  const [cancelTarget,  setCancelTarget]  = useState(null);  // order object
  const [cancelLoading, setCancelLoading] = useState(false);
  const [cancelError,   setCancelError]   = useState('');
  const [cancelSuccess, setCancelSuccess] = useState('');

  useEffect(() => {
    ordersAPI.getAll()
      .then(({ data }) => setOrders(data))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const updateStatus = async (id, status) => {
    const { data } = await ordersAPI.setStatus(id, status);
    setOrders(p => p.map(o => o._id===id ? { ...o, ...data } : o));
  };

  const handleCancelConfirm = async () => {
    if (!cancelTarget) return;
    setCancelLoading(true); setCancelError('');
    try {
      const { data } = await ordersAPI.setStatus(cancelTarget._id, 'Cancelled');
      setOrders(p => p.map(o => o._id === cancelTarget._id ? { ...o, ...data } : o));
      setCancelSuccess(
        data.refundApplied
          ? `Order cancelled. ${cancelTarget.productID?.cropName} refund has been initiated.`
          : `Order cancelled successfully.`
      );
      setCancelTarget(null);
      setTimeout(() => setCancelSuccess(''), 5000);
    } catch (err) {
      setCancelError(err.response?.data?.message || 'Cancellation failed. Please try again.');
    } finally { setCancelLoading(false); }
  };

  const loadRoute = async (orderId) => {
    if (routes[orderId]) { setExpanding(p => p===orderId ? null : orderId); return; }
    setExpanding(orderId);
    try {
      const { data } = await routeAPI.optimise(orderId);
      setRoutes(p => ({ ...p, [orderId]: data }));
    } catch(e) { alert(e.response?.data?.message || 'Failed to load route'); setExpanding(null); }
  };

  const startChat = async (order) => {
    setChatLoading(order._id);
    try {
      await chatAPI.startConversation(order.farmerID._id, order.productID?._id);
      navigate('/dashboard/chat?autoOpen=newest');
    } catch(e) {
      alert(e.response?.data?.message || 'Could not open chat');
    } finally { setChatLoading(null); }
  };

  const FILTERS = ['All','Pending','In-Transit','Delivered','Cancelled'];
  const filtered = filter==='All' ? orders : orders.filter(o => o.status===filter);

  const counts = FILTERS.reduce((acc, f) => {
    acc[f] = f==='All' ? orders.length : orders.filter(o=>o.status===f).length;
    return acc;
  }, {});

  return (
    <div className="space-y-6 animate-fade-in max-w-7xl mx-auto">
      {/* Header */}
      <div>
        <h1 className="section-title text-3xl flex items-center gap-2">
          <MdLocalShipping className="text-leaf-500" size={32}/>
          {user?.role==='Farmer' ? 'Orders & Deliveries' : t('myOrders')}
        </h1>
        <p className="section-sub">
          {user?.role==='Farmer'
            ? 'Manage incoming orders, track shipments and update delivery status'
            : 'Track your orders — cancel if still Pending, chat with farmer if already shipped'}
        </p>
      </div>

      {/* Success / Error banners */}
      {cancelSuccess && (
        <div className="p-4 bg-leaf-50 border border-leaf-200 rounded-2xl text-leaf-700 font-body text-sm flex items-center gap-3">
          <MdCheckCircle size={18} className="text-leaf-500 shrink-0"/> {cancelSuccess}
        </div>
      )}
      {cancelError && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-2xl text-red-600 font-body text-sm flex items-center gap-3">
          <MdWarning size={18} className="shrink-0"/> {cancelError}
          <button onClick={() => setCancelError('')} className="ml-auto text-red-400 hover:text-red-600"><MdClose size={16}/></button>
        </div>
      )}

      {/* Filter tabs */}
      <div className="flex flex-wrap gap-2 bg-earth-50 p-1 rounded-2xl border border-earth-100 w-fit">
        {FILTERS.map(f => (
          <button key={f} onClick={() => setFilter(f)}
            className={`px-4 py-2 rounded-xl text-sm font-body font-medium transition-all flex items-center gap-1.5
              ${filter===f ? 'bg-white text-leaf-700 shadow-sm' : 'text-earth-500 hover:text-earth-700'}`}>
            {f}
            {counts[f] > 0 && (
              <span className={`w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold
                ${filter===f
                  ? f==='Cancelled' ? 'bg-red-100 text-red-600' : f==='Delivered' ? 'bg-leaf-100 text-leaf-700' : 'bg-leaf-50 text-leaf-700'
                  : 'bg-earth-200 text-earth-600'}`}>
                {counts[f]}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Orders list */}
      {loading ? (
        <div className="flex justify-center py-24"><div className="spinner"/></div>
      ) : filtered.length===0 ? (
        <div className="card text-center py-20">
          <MdLocalShipping size={56} className="mx-auto mb-4 text-earth-200"/>
          <h2 className="text-xl font-display font-bold text-earth-700 mb-2">
            {filter==='All' ? 'No orders yet' : `No ${filter} orders`}
          </h2>
          <p className="text-earth-400 font-body">
            {filter==='All'
              ? user?.role==='Farmer' ? 'Orders from consumers will appear here.' : 'Place your first order from the marketplace.'
              : 'Try a different filter above.'}
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {filtered.map(order => {
            const p = order.productID;
            const isCancellable = user?.role==='Consumer' && order.status==='Pending';
            const isPaid = ['Paid','AdvancePaid'].includes(order.paymentStatus);

            return (
              <div key={order._id} className={`card overflow-hidden transition-shadow hover:shadow-glow
                ${order.status==='Cancelled' ? 'opacity-80 border-red-100' : ''}`}>

                <div className="flex flex-col sm:flex-row sm:items-start gap-4">
                  {/* Product image */}
                  {p?.imageURL
                    ? <img src={p.imageURL} alt="" className="w-16 h-16 rounded-2xl object-cover shrink-0"/>
                    : <div className="w-16 h-16 rounded-2xl bg-leaf-100 flex items-center justify-center shrink-0">
                        <GiWheat className="text-leaf-400" size={24}/>
                      </div>}

                  {/* Core info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-start justify-between gap-2 mb-2">
                      <div>
                        <h3 className="font-display font-bold text-earth-800 text-base">{p?.cropName}</h3>
                        <p className="text-xs text-earth-400 font-body">
                          {user?.role==='Farmer'
                            ? `Buyer: ${order.consumerID?.name}`
                            : `Farmer: ${order.farmerID?.name}`}
                          {' · '}{order.quantity} units · {npr(order.totalPrice)}
                        </p>
                        <p className="text-xs text-earth-300 font-body mt-0.5">
                          {new Date(order.createdAt).toLocaleDateString('en-NP',{day:'numeric',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'})}
                        </p>
                      </div>

                      {/* Status + payment badges */}
                      <div className="flex flex-wrap gap-1.5">
                        <span className={`badge ${STATUS_COLOR[order.status]||'badge-earth'} text-xs flex items-center gap-1`}>
                          {STATUS_ICON_CMP[order.status]} {order.status}
                        </span>
                        <span className={`badge ${PAY_COLOR[order.paymentStatus]||'badge-earth'} text-xs`}>
                          {PAY_ICON[order.paymentMethod||'']}
                          {order.paymentStatus==='AdvancePaid' ? '25% Advance Paid' : order.paymentStatus}
                        </span>
                        {order.paymentStatus==='Refunded' && (
                          <span className="badge badge-earth text-xs flex items-center gap-1">
                            <MdRefresh size={11}/> Refund Pending
                          </span>
                        )}
                      </div>
                    </div>

                    {/* COD breakdown */}
                    {order.paymentStatus==='AdvancePaid' && order.remainingAmount > 0 && (
                      <div className="mb-2 flex items-center gap-2 text-xs font-body text-amber-700 bg-amber-50 border border-amber-100 rounded-xl px-3 py-1.5">
                        <span>💛 Advance paid: <strong>{npr(order.advanceAmount)}</strong></span>
                        <span className="text-earth-300">·</span>
                        <span>💵 Collect on delivery: <strong>{npr(order.remainingAmount)}</strong></span>
                      </div>
                    )}

                    {/* Delivery address */}
                    {order.deliveryAddress && (
                      <p className="text-xs text-earth-500 font-body flex items-center gap-1 mb-2">
                        📍 {order.deliveryAddress}
                      </p>
                    )}

                    {/* Consumer cancel hint for In-Transit orders */}
                    {user?.role==='Consumer' && order.status==='In-Transit' && (
                      <div className="flex items-center gap-2 text-xs font-body text-blue-600 bg-blue-50 border border-blue-100 rounded-xl px-3 py-1.5 mb-2">
                        <MdInfo size={13}/> Order is on the way — chat with the farmer to request changes
                      </div>
                    )}

                    {/* Action buttons */}
                    <div className="flex flex-wrap items-center gap-2 mt-2">

                      {/* Farmer actions */}
                      {user?.role==='Farmer' && order.status==='Pending' && (
                        <button onClick={() => updateStatus(order._id,'In-Transit')}
                          className="btn-primary text-xs py-1.5 px-3 flex items-center gap-1">
                          <MdLocalShipping size={14}/> Ship Order
                        </button>
                      )}
                      {user?.role==='Farmer' && order.status==='In-Transit' && (
                        <button onClick={() => updateStatus(order._id,'Delivered')}
                          className="btn-harvest text-xs py-1.5 px-3 flex items-center gap-1">
                          <MdCheckCircle size={14}/> Mark Delivered
                        </button>
                      )}

                      {/* ── Consumer: Cancel button (Pending only) ── */}
                      {isCancellable && (
                        <button
                          onClick={() => { setCancelTarget(order); setCancelError(''); }}
                          className="flex items-center gap-1.5 text-xs py-1.5 px-3 rounded-xl border-2 border-red-200 text-red-500 bg-red-50 hover:bg-red-100 hover:border-red-300 font-body font-medium transition-colors"
                        >
                          <MdCancel size={14}/> Cancel Order
                        </button>
                      )}

                      {/* Map route */}
                      {order.status !== 'Cancelled' && (
                        <button onClick={() => loadRoute(order._id)}
                          className="btn-secondary text-xs py-1.5 px-3 flex items-center gap-1">
                          {expanding===order._id && !routes[order._id]
                            ? <span className="spinner" style={{width:12,height:12,borderWidth:1.5}}/>
                            : <MdRoute size={14}/>} Map
                        </button>
                      )}

                      {/* Consumer: view farmer + chat */}
                      {user?.role==='Consumer' && order.farmerID && (
                        <>
                          <button
                            onClick={() => setFarmerPanel(p => p===order._id ? null : order._id)}
                            className={`text-xs py-1.5 px-3 flex items-center gap-1 rounded-xl border font-body font-medium transition-all
                              ${farmerPanel===order._id ? 'bg-leaf-100 border-leaf-300 text-leaf-700' : 'btn-secondary'}`}>
                            <MdPerson size={14}/> {farmerPanel===order._id ? 'Hide' : 'Farmer'}
                          </button>
                          <button
                            onClick={() => startChat(order)}
                            disabled={chatLoading===order._id}
                            className="btn-primary text-xs py-1.5 px-3 flex items-center gap-1">
                            {chatLoading===order._id
                              ? <span className="spinner" style={{width:12,height:12,borderWidth:1.5}}/>
                              : <MdChat size={14}/>} Chat
                          </button>
                        </>
                      )}

                      {/* Farmer: cancel if Pending */}
                      {user?.role==='Farmer' && order.status==='Pending' && (
                        <button
                          onClick={() => { setCancelTarget(order); setCancelError(''); }}
                          className="flex items-center gap-1.5 text-xs py-1.5 px-3 rounded-xl border-2 border-red-200 text-red-500 bg-red-50 hover:bg-red-100 hover:border-red-300 font-body font-medium transition-colors"
                        >
                          <MdCancel size={14}/> Cancel
                        </button>
                      )}
                    </div>
                  </div>
                </div>

                {/* Farmer info panel */}
                {farmerPanel===order._id && order.farmerID && (
                  <div className="mt-4 pt-4 border-t border-earth-100 grid sm:grid-cols-2 gap-3 animate-slide-up">
                    <div className="flex items-center gap-3 p-3 bg-leaf-50 rounded-xl">
                      {order.farmerID.avatar
                        ? <img src={order.farmerID.avatar} alt="" className="w-10 h-10 rounded-xl object-cover shrink-0"/>
                        : <div className="w-10 h-10 rounded-xl bg-leaf-200 flex items-center justify-center shrink-0"><MdPerson size={20} className="text-leaf-600"/></div>}
                      <div>
                        <p className="font-semibold text-earth-800 text-sm font-body">{order.farmerID.name}</p>
                        {order.farmerID.location?.city && (
                          <p className="text-xs text-earth-400 font-body">📍 {order.farmerID.location.city}</p>
                        )}
                      </div>
                    </div>
                    {order.farmerID.phone && (
                      <div className="flex items-center gap-2 p-3 bg-earth-50 rounded-xl">
                        <span className="text-lg">📞</span>
                        <div>
                          <p className="text-xs text-earth-400 font-body">Phone</p>
                          <p className="font-mono text-earth-800 text-sm">{order.farmerID.phone}</p>
                        </div>
                      </div>
                    )}
                    {order.farmerID.bio && (
                      <div className="sm:col-span-2 p-3 bg-earth-50 rounded-xl">
                        <p className="text-xs text-earth-500 font-body italic">"{order.farmerID.bio}"</p>
                      </div>
                    )}
                  </div>
                )}

                {/* Route map */}
                {expanding===order._id && routes[order._id] && (()=>{
                  const wps = routes[order._id].waypoints;
                  const org = wps?.find(w => w && isFinite(parseFloat(w.lat)) && isFinite(parseFloat(w.lng)));
                  const dst = [...(wps||[])].reverse().find(w => w && isFinite(parseFloat(w.lat)) && isFinite(parseFloat(w.lng)));
                  if (!org || !dst || org===dst) return (
                    <div className="border-t border-earth-100 bg-earth-50 p-5 animate-slide-up">
                      <div className="flex items-center gap-3 p-4 bg-red-50 border border-red-100 rounded-xl text-sm text-red-600 font-body">
                        📍 Route map unavailable — farm or customer location data is missing.
                      </div>
                    </div>
                  );
                  return (
                    <div className="border-t border-earth-100 bg-earth-50 p-5 space-y-4 animate-slide-up">
                      <div className="flex items-center gap-2 flex-wrap">
                        <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-body font-medium bg-leaf-100 text-leaf-700">
                          🌾 {org.label}
                        </div>
                        <span className="text-earth-300 text-lg">→</span>
                        <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-body font-medium bg-orange-100 text-orange-700">
                          🏠 {dst.label}
                        </div>
                        {routes[order._id].distance && (
                          <span className="text-xs text-earth-400 font-body ml-auto">
                            <MdStraighten size={13} className="inline mr-1"/>
                            {routes[order._id].distance} km road distance
                          </span>
                        )}
                      </div>
                      <DeliveryMap waypoints={[org, dst]} height="380px" travelMode="driving"/>
                    </div>
                  );
                })()}
              </div>
            );
          })}
        </div>
      )}

      {/* Cancel confirmation modal */}
      {cancelTarget && (
        <CancelOrderModal
          order={cancelTarget}
          onConfirm={handleCancelConfirm}
          onClose={() => { if (!cancelLoading) { setCancelTarget(null); setCancelError(''); } }}
          loading={cancelLoading}
        />
      )}
    </div>
  );
}
