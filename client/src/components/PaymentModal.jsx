/**
 * PaymentModal.jsx — AgriConnect Payment System
 *
 * Two payment methods:
 *  1. eSewa (Full)  — 100% paid now via eSewa → credited to account 9741677342
 *  2. COD           — 25% advance paid via eSewa now + 75% cash on delivery
 *
 * eSewa gateway auto-submits a form → redirects consumer to eSewa → callback verifies
 */
import React, { useState } from 'react';
import {
  MdClose, MdCheckCircle, MdDeliveryDining, MdPayment,
  MdPhone, MdInfo, MdLock, MdArrowForward,
} from 'react-icons/md';
import { GiWheat } from 'react-icons/gi';
import { paymentAPI } from '../utils/api';
import { useLanguage } from '../context/LanguageContext';
import { npr } from '../utils/currency';

const ESEWA_ACCOUNT = '9741677342';

/* ── Submit form to eSewa gateway ── */
function redirectToEsewa(params, gatewayUrl) {
  const form = document.createElement('form');
  form.method = 'POST';
  form.action = gatewayUrl;
  Object.entries(params).forEach(([k, v]) => {
    const inp = document.createElement('input');
    inp.type = 'hidden'; inp.name = k; inp.value = v;
    form.appendChild(inp);
  });
  document.body.appendChild(form);
  form.submit();
}

/* ── eSewa logo SVG ── */
function EsewaLogo({ size = 24 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" fill="none">
      <rect width="48" height="48" rx="12" fill="#60BB46"/>
      <text x="50%" y="55%" dominantBaseline="middle" textAnchor="middle"
        fontSize="18" fontWeight="bold" fill="white" fontFamily="Arial">e</text>
    </svg>
  );
}

export default function PaymentModal({ order, product, onClose, onSuccess }) {
  const { t, lang } = useLanguage();
  const [method,  setMethod]  = useState('eSewa'); // 'eSewa' | 'COD'
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState('');

  const total         = order?.totalPrice   || 0;
  const advanceAmount = Math.round(total * 0.25);
  const remainAmount  = total - advanceAmount;

  const handlePay = async () => {
    setLoading(true); setError('');
    try {
      if (method === 'eSewa') {
        /* ── Full eSewa payment ── */
        const { data } = await paymentAPI.esewaInitiate(order._id);
        redirectToEsewa(data.params, data.gatewayUrl);
        // page navigates away — no further action needed here
      } else if (method === 'COD') {
        /* ── COD: initiate 25% advance via eSewa ── */
        const { data } = await paymentAPI.codAdvanceInitiate(order._id);
        redirectToEsewa(data.params, data.gatewayUrl);
      }
    } catch (err) {
      setError(err.response?.data?.message || 'Payment failed. Please try again.');
      setLoading(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal-box" style={{ maxWidth: 480 }}>

        {/* Header */}
        <div className="flex items-center justify-between mb-5">
          <div>
            <h2 className="text-xl font-display font-bold text-earth-800">
              {lang === 'ne' ? 'भुक्तानी विधि छान्नुस्' : 'Select Payment Method'}
            </h2>
            <p className="text-xs text-earth-400 font-body mt-0.5 flex items-center gap-1">
              <MdLock size={11}/> Secured by eSewa · Account {ESEWA_ACCOUNT}
            </p>
          </div>
          <button onClick={onClose} className="w-9 h-9 rounded-xl bg-earth-100 hover:bg-earth-200 flex items-center justify-center text-earth-500">
            <MdClose size={18}/>
          </button>
        </div>

        {/* Order summary card */}
        <div className="bg-gradient-to-br from-leaf-50 to-earth-50 rounded-2xl p-4 mb-5 border border-leaf-100">
          <div className="flex items-center gap-3">
            {product?.imageURL
              ? <img src={product.imageURL} alt="" className="w-14 h-14 rounded-xl object-cover border border-earth-200 shrink-0"/>
              : <div className="w-14 h-14 rounded-xl bg-leaf-100 flex items-center justify-center shrink-0"><GiWheat size={24} className="text-leaf-500"/></div>}
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-earth-800 font-body truncate">{product?.cropName || order?.productID?.cropName || 'Product'}</p>
              <p className="text-xs text-earth-500 font-body">Qty: {order?.quantity} {product?.unit}</p>
              <div className="flex items-center gap-1 mt-1">
                <MdCheckCircle size={13} className="text-leaf-500"/>
                <span className="text-xs text-leaf-700 font-body font-medium">Order confirmed</span>
              </div>
            </div>
            <div className="text-right shrink-0">
              <p className="text-[10px] text-earth-400 font-body uppercase tracking-wide">Total</p>
              <p className="text-2xl font-display font-bold text-earth-800">{npr(total)}</p>
            </div>
          </div>
        </div>

        {/* Payment method selector */}
        <div className="space-y-3 mb-5">

          {/* ── Option 1: Full eSewa ── */}
          <div
            onClick={() => setMethod('eSewa')}
            className={`rounded-2xl border-2 cursor-pointer transition-all overflow-hidden
              ${method === 'eSewa'
                ? 'border-green-400 ring-2 ring-green-300 ring-offset-1'
                : 'border-earth-100 hover:border-green-200'}`}
          >
            <div className="flex items-center gap-4 p-4">
              <div className={`w-12 h-12 rounded-xl flex items-center justify-center shrink-0
                ${method==='eSewa' ? 'bg-green-50' : 'bg-earth-50'}`}>
                <EsewaLogo size={32}/>
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-earth-800 font-body text-sm">eSewa</span>
                  <span className="px-1.5 py-0.5 bg-green-100 text-green-700 text-[10px] rounded-full font-body font-medium">
                    Full Payment
                  </span>
                </div>
                <p className="text-xs text-earth-500 font-body mt-0.5">Pay {npr(total)} now — instant confirmation</p>
                <p className="text-[10px] text-earth-400 font-body mt-0.5 flex items-center gap-1">
                  <MdPhone size={10}/> Credited to eSewa {ESEWA_ACCOUNT}
                </p>
              </div>
              <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 transition-all
                ${method==='eSewa' ? 'border-green-500 bg-green-500' : 'border-earth-300'}`}>
                {method==='eSewa' && <div className="w-2 h-2 rounded-full bg-white"/>}
              </div>
            </div>

            {/* Expanded eSewa detail */}
            {method === 'eSewa' && (
              <div className="border-t border-green-100 bg-green-50 px-4 py-3 space-y-2">
                <div className="flex justify-between text-xs font-body">
                  <span className="text-earth-600">Amount to pay now</span>
                  <span className="font-bold text-green-700">{npr(total)}</span>
                </div>
                <div className="flex justify-between text-xs font-body">
                  <span className="text-earth-600">Credited to</span>
                  <span className="font-mono text-earth-700">eSewa · {ESEWA_ACCOUNT}</span>
                </div>
                <div className="flex justify-between text-xs font-body">
                  <span className="text-earth-600">Remaining on delivery</span>
                  <span className="font-bold text-leaf-600">NPR 0 (fully paid)</span>
                </div>
                <div className="mt-1 p-2 bg-green-100 rounded-xl text-[11px] text-green-700 font-mono">
                  Test: ID 9806800001 · PW Nepal@123 · MPIN 1122
                </div>
              </div>
            )}
          </div>

          {/* ── Option 2: COD with 25% advance ── */}
          <div
            onClick={() => setMethod('COD')}
            className={`rounded-2xl border-2 cursor-pointer transition-all overflow-hidden
              ${method === 'COD'
                ? 'border-amber-400 ring-2 ring-amber-300 ring-offset-1'
                : 'border-earth-100 hover:border-amber-200'}`}
          >
            <div className="flex items-center gap-4 p-4">
              <div className={`w-12 h-12 rounded-xl flex items-center justify-center text-2xl shrink-0
                ${method==='COD' ? 'bg-amber-50' : 'bg-earth-50'}`}>
                💵
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-earth-800 font-body text-sm">Cash on Delivery</span>
                  <span className="px-1.5 py-0.5 bg-amber-100 text-amber-700 text-[10px] rounded-full font-body font-medium">
                    25% eSewa advance
                  </span>
                </div>
                <p className="text-xs text-earth-500 font-body mt-0.5">Pay {npr(advanceAmount)} now · {npr(remainAmount)} on delivery</p>
                <p className="text-[10px] text-earth-400 font-body mt-0.5 flex items-center gap-1">
                  <MdDeliveryDining size={10}/> Farmer ships after advance is confirmed
                </p>
              </div>
              <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 transition-all
                ${method==='COD' ? 'border-amber-500 bg-amber-500' : 'border-earth-300'}`}>
                {method==='COD' && <div className="w-2 h-2 rounded-full bg-white"/>}
              </div>
            </div>

            {/* Expanded COD detail */}
            {method === 'COD' && (
              <div className="border-t border-amber-100 bg-amber-50 px-4 py-3 space-y-2">
                {/* Breakdown bar */}
                <div>
                  <div className="flex justify-between text-[10px] text-earth-500 font-body mb-1">
                    <span>25% advance (eSewa · now)</span>
                    <span>75% cash (on delivery)</span>
                  </div>
                  <div className="h-3 rounded-full bg-earth-200 overflow-hidden flex">
                    <div className="h-full bg-amber-400 rounded-l-full" style={{width:'25%'}}/>
                    <div className="h-full bg-earth-300 flex-1 rounded-r-full"/>
                  </div>
                </div>
                <div className="flex justify-between text-xs font-body pt-1">
                  <span className="text-earth-600">Pay via eSewa <span className="text-amber-600 font-bold">now</span></span>
                  <span className="font-bold text-amber-700">{npr(advanceAmount)}</span>
                </div>
                <div className="flex justify-between text-xs font-body">
                  <span className="text-earth-600">Pay in <span className="text-earth-700 font-medium">cash on delivery</span></span>
                  <span className="font-bold text-earth-700">{npr(remainAmount)}</span>
                </div>
                <div className="flex justify-between text-xs font-body border-t border-amber-200 pt-2">
                  <span className="text-earth-600 font-medium">Total order value</span>
                  <span className="font-bold text-earth-800">{npr(total)}</span>
                </div>
                <div className="flex items-start gap-2 bg-amber-100 rounded-xl p-2.5 mt-1">
                  <MdInfo size={14} className="text-amber-600 shrink-0 mt-0.5"/>
                  <p className="text-[11px] text-amber-800 font-body leading-relaxed">
                    The 25% advance is paid via eSewa to account {ESEWA_ACCOUNT} as a security deposit.
                    Your farmer will ship after this is confirmed. Pay the remaining {npr(remainAmount)} in cash when your order arrives.
                  </p>
                </div>
                <div className="mt-1 p-2 bg-amber-100 rounded-xl text-[11px] text-amber-700 font-mono">
                  Test: ID 9806800001 · PW Nepal@123 · MPIN 1122
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Error */}
        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-xl text-red-600 text-sm font-body flex items-center gap-2">
            <MdClose size={16} className="shrink-0"/>
            {error}
          </div>
        )}

        {/* Action buttons */}
        <div className="flex gap-3">
          <button onClick={onClose} disabled={loading} className="btn-secondary flex-1 justify-center">
            Cancel
          </button>
          <button
            onClick={handlePay}
            disabled={loading}
            className={`flex-1 inline-flex items-center justify-center gap-2 py-3 rounded-xl font-body font-bold text-sm
              transition-all active:scale-95 disabled:opacity-60 disabled:cursor-not-allowed
              ${method === 'eSewa'
                ? 'bg-green-500 hover:bg-green-600 text-white'
                : 'bg-amber-500 hover:bg-amber-600 text-white'}`}
          >
            {loading
              ? <span className="spinner" style={{borderColor:'rgba(255,255,255,0.35)',borderTopColor:'white',width:18,height:18,borderWidth:2}}/>
              : method === 'eSewa'
                ? <><EsewaLogo size={18}/> Pay {npr(total)} via eSewa <MdArrowForward size={16}/></>
                : <><MdDeliveryDining size={18}/> Pay {npr(advanceAmount)} Advance via eSewa <MdArrowForward size={16}/></>}
          </button>
        </div>

        {/* Footer trust badge */}
        <div className="mt-4 flex items-center justify-center gap-4 text-[10px] text-earth-400 font-body">
          <span className="flex items-center gap-1"><MdLock size={10}/> SSL Secured</span>
          <span>·</span>
          <span className="flex items-center gap-1">
            <EsewaLogo size={10}/> eSewa · Regulated by Nepal Rastra Bank
          </span>
          <span>·</span>
          <span>Merchant: {ESEWA_ACCOUNT}</span>
        </div>
      </div>
    </div>
  );
}
