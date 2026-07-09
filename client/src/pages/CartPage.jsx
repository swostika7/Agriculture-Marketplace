import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { MdShoppingCart, MdDelete, MdAdd, MdRemove, MdLocationOn, MdCheckCircle } from 'react-icons/md';
import { GiWheat } from 'react-icons/gi';
import { cartAPI } from '../utils/api';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import { npr } from '../utils/currency';
import PaymentModal from '../components/PaymentModal';

export default function CartPage() {
  const { user }    = useAuth();
  const { t }       = useLanguage();
  const navigate    = useNavigate();
  const [items,     setItems]     = useState([]);
  const [loading,   setLoading]   = useState(true);
  const [updating,  setUpdating]  = useState(null);
  const [payModal,  setPayModal]  = useState(null);
  const [checkoutMsg, setCheckoutMsg] = useState('');
  const [address,   setAddress]   = useState(user?.location?.city || '');

  useEffect(() => {
    cartAPI.get().then(({ data }) => setItems(data)).catch(() => {}).finally(() => setLoading(false));
  }, []);

  const total = items.reduce((s, item) => s + (item.productID?.price || 0) * item.quantity, 0);

  const updateQty = async (itemId, qty) => {
    setUpdating(itemId);
    try {
      if (qty < 1) {
        await cartAPI.remove(itemId);
        setItems(prev => prev.filter(i => i._id !== itemId));
        window.dispatchEvent(new CustomEvent('cart-updated'));
      } else {
        const { data } = await cartAPI.update(itemId, qty);
        setItems(prev => prev.map(i => i._id === itemId ? data : i));
      }
    } catch(e) { alert(e.response?.data?.message || 'Update failed'); }
    finally { setUpdating(null); }
  };

  const remove = async (itemId) => {
    setUpdating(itemId);
    try {
      await cartAPI.remove(itemId);
      setItems(prev => prev.filter(i => i._id !== itemId));
      window.dispatchEvent(new CustomEvent('cart-updated'));
    } finally { setUpdating(null); }
  };

  const handleCheckout = async () => {
    try {
      const { data } = await cartAPI.checkout(address);
      setItems([]);
      window.dispatchEvent(new CustomEvent('cart-updated'));
      if (data.orders && data.orders.length > 0) {
        setPayModal({ order: data.orders[0], product: null });
      } else {
        setCheckoutMsg(`🎉 ${data.message}`);
        setTimeout(() => navigate('/dashboard/logistics'), 2500);
      }
    } catch(e) { alert(e.response?.data?.message || 'Checkout failed'); }
  };

  if (loading) return <div className="flex justify-center py-24"><div className="spinner"/></div>;

  return (
    <div className="max-w-4xl mx-auto space-y-6 animate-fade-in">
      <div>
        <h1 className="section-title text-3xl flex items-center gap-2">
          <MdShoppingCart className="text-leaf-500" size={32}/> {t('cart')}
        </h1>
        <p className="section-sub">{items.length} {items.length===1?'item':'items'} in your cart</p>
      </div>

      {checkoutMsg && (
        <div className="p-5 bg-leaf-50 border border-leaf-200 rounded-2xl text-leaf-700 font-body flex items-center gap-3 animate-slide-up">
          <MdCheckCircle size={24} className="text-leaf-500"/>{checkoutMsg}
        </div>
      )}

      {items.length === 0 && !checkoutMsg ? (
        <div className="card text-center py-20">
          <MdShoppingCart size={56} className="mx-auto mb-4 text-earth-200"/>
          <h2 className="text-xl font-display font-bold text-earth-700 mb-2">{t('emptyCart')}</h2>
          <p className="text-earth-400 font-body mb-6">Browse the marketplace and add items to your cart.</p>
          <button onClick={() => navigate('/dashboard/market')} className="btn-primary">
            Browse Marketplace
          </button>
        </div>
      ) : (
        <div className="grid lg:grid-cols-3 gap-6">
          {/* Cart items */}
          <div className="lg:col-span-2 space-y-4">
            {items.map(item => {
              const p = item.productID;
              if (!p) return (
                <div key={item._id} className="card flex gap-4 items-center opacity-60">
                  <div className="w-20 h-20 rounded-xl bg-earth-100 flex items-center justify-center shrink-0"><GiWheat className="text-earth-300"/></div>
                  <div className="flex-1"><p className="text-sm text-earth-400 font-body">Product no longer available</p></div>
                  <button onClick={() => remove(item._id)} className="p-1.5 rounded-lg text-red-400 hover:bg-red-50"><MdDelete size={18}/></button>
                </div>
              );
              return (
                <div key={item._id} className="card hover:shadow-glow transition-shadow">
                  <div className="flex gap-4 items-start">
                    {/* Clickable product info — navigates to marketplace with similar items */}
                    <div
                      className="flex gap-4 items-start flex-1 min-w-0 cursor-pointer group"
                      onClick={() => navigate('/dashboard/market', { state: { category: p.category, search: p.cropName } })}
                      title="Click to find similar products in marketplace"
                    >
                      {p.imageURL
                        ? <img src={p.imageURL} alt="" className="w-20 h-20 rounded-xl object-cover shrink-0 group-hover:ring-2 group-hover:ring-leaf-400 transition-all"/>
                        : <div className="w-20 h-20 rounded-xl bg-leaf-100 flex items-center justify-center text-3xl shrink-0"><GiWheat className="text-leaf-400"/></div>}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h3 className="font-display font-semibold text-earth-800 text-base group-hover:text-leaf-700 transition-colors">
                            {p.cropName}
                          </h3>
                          {!p.isAvailable && (
                            <span className="px-2 py-0.5 text-xs rounded-full bg-red-100 text-red-600 font-body font-medium shrink-0">
                              Out of stock
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-earth-400 font-body flex items-center gap-1 mt-0.5">
                          <MdLocationOn size={11}/>{p.location?.city} · 👨‍🌾 {p.farmerID?.name}
                        </p>
                        <p className="text-xs text-leaf-600 font-body mt-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          🔍 View similar in marketplace →
                        </p>
                      </div>
                    </div>

                    {/* Delete button */}
                    <button onClick={() => remove(item._id)} disabled={updating===item._id}
                      className="p-1.5 rounded-lg text-red-400 hover:bg-red-50 hover:text-red-600 transition-colors shrink-0">
                      <MdDelete size={18}/>
                    </button>
                  </div>

                  {/* Qty + price row */}
                  <div className="flex items-center justify-between mt-3">
                    <div className="flex items-center border border-earth-200 rounded-xl overflow-hidden">
                      <button onClick={() => updateQty(item._id, item.quantity-1)} disabled={updating===item._id}
                        className="w-9 h-9 flex items-center justify-center hover:bg-earth-50 text-earth-600">
                        <MdRemove size={16}/>
                      </button>
                      <span className="w-8 text-center font-mono text-sm text-earth-700">{item.quantity}</span>
                      <button onClick={() => updateQty(item._id, item.quantity+1)} disabled={updating===item._id||item.quantity>=p.quantity}
                        className="w-9 h-9 flex items-center justify-center hover:bg-earth-50 text-earth-600">
                        <MdAdd size={16}/>
                      </button>
                    </div>
                    <div className="text-right">
                      <p className="font-display font-bold text-leaf-700 text-lg">{npr(p.price * item.quantity)}</p>
                      <p className="text-xs text-earth-400 font-body">{npr(p.price)}/{p.unit}</p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Summary */}
          <div className="space-y-4">
            <div className="card sticky top-24">
              <h3 className="font-display font-semibold text-earth-800 mb-4">{t('cartTotal')}</h3>
              <div className="space-y-2 mb-4">
                {items.map(item => (
                  <div key={item._id} className="flex justify-between text-sm font-body text-earth-600">
                    <span className="truncate">{item.productID?.cropName} ×{item.quantity}</span>
                    <span className="font-mono ml-2 shrink-0">{npr((item.productID?.price||0)*item.quantity)}</span>
                  </div>
                ))}
                <div className="flex justify-between font-bold font-body text-earth-800 pt-2 border-t border-earth-100 text-base">
                  <span>Total</span>
                  <span className="font-mono text-leaf-700">{npr(total)}</span>
                </div>
              </div>

              <div className="mb-4">
                <label className="label text-xs">Delivery Address</label>
                <input className="input text-sm" placeholder="City / Village" value={address} onChange={e=>setAddress(e.target.value)}/>
              </div>

              <button onClick={handleCheckout} className="btn-primary w-full justify-center py-3 text-base">
                <MdCheckCircle size={18}/> {t('placeOrder')}
              </button>
              <p className="text-xs text-earth-400 font-body text-center mt-2">
                You will choose your payment method next
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Payment modal shown after checkout */}
      {payModal && (
        <PaymentModal
          order={payModal.order}
          product={payModal.product}
          onClose={() => { setPayModal(null); navigate('/dashboard/logistics'); }}
          onSuccess={(method) => {
            setPayModal(null);
            setCheckoutMsg(`🎉 Order confirmed! Payment via ${method} selected.`);
            setTimeout(() => navigate('/dashboard/logistics'), 2500);
          }}
        />
      )}
    </div>
  );
}
