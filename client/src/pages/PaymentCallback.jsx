/**
 * PaymentCallback.jsx
 * Handles eSewa redirect after payment — two flows:
 *   type=full    → full eSewa payment (100%)
 *   type=advance → COD 25% advance via eSewa
 */
import React, { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { paymentAPI } from '../utils/api';
import { MdCheckCircle, MdCancel, MdDeliveryDining, MdShoppingBag } from 'react-icons/md';
import { npr } from '../utils/currency';

export default function PaymentCallback() {
  const [params]   = useSearchParams();
  const navigate   = useNavigate();
  const [status,   setStatus]   = useState('verifying'); // verifying | success | advance | failed
  const [message,  setMessage]  = useState('');
  const [orderInfo,setOrderInfo]= useState(null);

  useEffect(() => {
    (async () => {
      try {
        const method   = params.get('method');
        const orderId  = params.get('orderId');
        const type     = params.get('type');    // 'full' | 'advance'
        const failed   = params.get('status') === 'failed';

        if (method !== 'esewa') {
          setStatus('failed'); setMessage('Unknown payment method.'); return;
        }

        if (failed) {
          setStatus('failed');
          setMessage(type === 'advance'
            ? 'eSewa advance payment was cancelled. Your order is saved — try paying the advance again from My Orders.'
            : 'eSewa payment was cancelled or failed. Your order is saved — you can try again from My Orders.');
          return;
        }

        const encodedData = params.get('data');
        if (!encodedData || !orderId) {
          setStatus('failed'); setMessage('Invalid response from eSewa.'); return;
        }

        if (type === 'advance') {
          /* ── Verify 25% COD advance ── */
          const { data } = await paymentAPI.codAdvanceVerify(encodedData, orderId);
          if (data.success) {
            setStatus('advance');
            setOrderInfo(data.order);
            setMessage('25% advance paid via eSewa! Your order is confirmed. Pay the remaining amount in cash when it arrives.');
          } else {
            setStatus('failed'); setMessage(data.message || 'Advance verification failed.');
          }
        } else {
          /* ── Verify full eSewa payment ── */
          const { data } = await paymentAPI.esewaVerify(encodedData, orderId);
          if (data.success) {
            setStatus('success'); setMessage('Full payment received via eSewa. Your order is confirmed!');
          } else {
            setStatus('failed'); setMessage(data.message || 'Payment verification failed.');
          }
        }
      } catch (err) {
        setStatus('failed');
        setMessage(err.response?.data?.message || 'Payment verification failed. Please contact support.');
      }
    })();
  }, []); // eslint-disable-line

  const CONFIG = {
    verifying: {
      icon: <div className="text-6xl mb-5">⏳</div>,
      title: 'Verifying Payment…',
      bg: 'bg-earth-50 border-earth-200',
    },
    success: {
      icon: <div className="text-6xl mb-5">✅</div>,
      title: 'Payment Successful!',
      bg: 'bg-leaf-50 border-leaf-200',
    },
    advance: {
      icon: <div className="text-6xl mb-5">💛</div>,
      title: 'Advance Paid — COD Confirmed!',
      bg: 'bg-amber-50 border-amber-200',
    },
    failed: {
      icon: <div className="text-6xl mb-5">❌</div>,
      title: 'Payment Failed',
      bg: 'bg-red-50 border-red-200',
    },
  };

  const cfg = CONFIG[status] || CONFIG.verifying;

  return (
    <div className="min-h-screen bg-earth-50 flex items-center justify-center px-6 py-10">
      <div className={`max-w-md w-full p-10 rounded-3xl border-2 shadow-payment text-center ${cfg.bg} animate-slide-up`}>
        {cfg.icon}

        <h2 className="text-2xl font-display font-bold text-earth-800 mb-3">{cfg.title}</h2>

        {status === 'verifying' && <div className="spinner mx-auto mb-4"/>}

        {message && (
          <p className="font-body text-sm text-earth-600 mb-6 leading-relaxed">{message}</p>
        )}

        {/* COD advance breakdown */}
        {status === 'advance' && orderInfo && (
          <div className="mb-6 p-4 bg-white rounded-2xl border border-amber-200 text-left space-y-2">
            <p className="text-xs font-body font-bold text-earth-600 uppercase tracking-wide mb-2">Payment Breakdown</p>
            <div className="flex justify-between text-sm font-body">
              <span className="text-earth-600 flex items-center gap-1.5">✅ Advance paid (eSewa)</span>
              <span className="font-bold text-leaf-700">{npr(orderInfo.advanceAmount)}</span>
            </div>
            <div className="flex justify-between text-sm font-body">
              <span className="text-earth-600 flex items-center gap-1.5"><MdDeliveryDining size={14}/> Pay on delivery (Cash)</span>
              <span className="font-bold text-amber-700">{npr(orderInfo.remainingAmount)}</span>
            </div>
            <div className="border-t border-earth-100 pt-2 flex justify-between text-sm font-body font-bold">
              <span className="text-earth-700">Total order value</span>
              <span className="text-earth-800">{npr(orderInfo.totalPrice)}</span>
            </div>
          </div>
        )}

        {status !== 'verifying' && (
          <div className="flex flex-col gap-3">
            <button onClick={() => navigate('/dashboard/logistics')}
              className="btn-primary w-full justify-center py-3 flex items-center gap-2">
              <MdShoppingBag size={18}/> View My Orders
            </button>
            <button onClick={() => navigate('/dashboard/market')}
              className="btn-secondary w-full justify-center py-3">
              🛒 Continue Shopping
            </button>
          </div>
        )}

        {/* Footer */}
        {status !== 'verifying' && (
          <p className="mt-4 text-[10px] text-earth-400 font-body">
            🔒 Secured by eSewa · Nepal Rastra Bank regulated · Merchant: 9741677342
          </p>
        )}
      </div>
    </div>
  );
}
