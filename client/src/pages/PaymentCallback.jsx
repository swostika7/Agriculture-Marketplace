
import React, { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { paymentAPI } from '../utils/api';
import { MdCheckCircle, MdDeliveryDining, MdShoppingBag } from 'react-icons/md';
import { npr } from '../utils/currency';

export default function PaymentCallback() {
  const [urlParams] = useSearchParams();
  const navigate = useNavigate();

  const [status, setStatus] = useState('verifying'); // verifying | success | advance | failed
  const [message, setMessage] = useState('');
  const [orderInfo, setOrderInfo] = useState(null);

  useEffect(() => {
    (async () => {
      try {
        const method = urlParams.get('method');
        const orderId = urlParams.get('orderId');
        const type = urlParams.get('type');         // 'full' | 'advance'
        const pidx = urlParams.get('pidx');         // Khalti payment index
        const khaltiStatus = urlParams.get('status');   // 'Completed' | 'Canceled' | 'Failed'

        if (method !== 'khalti') {
          setStatus('failed'); setMessage('Unknown payment method.'); return;
        }

        // Khalti sends 'Canceled' (with one 'l') for user cancellations
        if (!khaltiStatus || ['Canceled', 'Failed', 'Expired'].includes(khaltiStatus)) {
          setStatus('failed');
          setMessage(
            khaltiStatus === 'Canceled'
              ? 'You cancelled the payment. Your order is saved — you can try again from My Orders.'
              : `Payment ${khaltiStatus || 'failed'}. Your order is saved — try again from My Orders.`
          );
          return;
        }

        if (!pidx || !orderId) {
          setStatus('failed'); setMessage('Invalid response from Khalti. Missing required parameters.'); return;
        }

        // Trigger server-to-server verification
        if (type === 'advance') {
          const { data } = await paymentAPI.codAdvanceVerify(pidx, orderId);
          if (data.success || data.alreadyVerified) {
            setStatus('advance');
            setOrderInfo(data.order);
            setMessage(
              data.alreadyVerified
                ? 'Advance already confirmed. Your COD order is active.'
                : '25% advance paid via Khalti! Your order is confirmed. Pay the remaining amount in cash when it arrives.'
            );
          } else {
            setStatus('failed'); setMessage(data.message || 'Advance verification failed.');
          }
        } else {
          const { data } = await paymentAPI.khaltiVerify(pidx, orderId);
          if (data.success || data.alreadyVerified) {
            setStatus('success');
            setMessage(
              data.alreadyVerified
                ? 'Payment already confirmed. Your order is active.'
                : 'Full payment received via Khalti. Your order is confirmed!'
            );
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
    verifying: { icon: '', title: 'Verifying Payment…', bg: 'bg-earth-50 border-earth-200' },
    success: { icon: '', title: 'Payment Successful!', bg: 'bg-purple-50 border-purple-200' },
    advance: { icon: '', title: 'Advance Paid — COD Confirmed!', bg: 'bg-amber-50 border-amber-200' },
    failed: { icon: '', title: 'Payment Failed or Cancelled', bg: 'bg-red-50 border-red-200' },
  };

  const cfg = CONFIG[status] || CONFIG.verifying;

  return (
    <div className="min-h-screen bg-earth-50 flex items-center justify-center px-6 py-10">
      <div className={`max-w-md w-full p-10 rounded-3xl border-2 shadow-payment text-center ${cfg.bg} animate-slide-up`}>
        <div className="text-6xl mb-5">{cfg.icon}</div>
        <h2 className="text-2xl font-display font-bold text-earth-800 mb-3">{cfg.title}</h2>

        {status === 'verifying' && <div className="spinner mx-auto mb-4" />}

        {message && (
          <p className="font-body text-sm text-earth-600 mb-6 leading-relaxed">{message}</p>
        )}

        {/* COD advance breakdown */}
        {status === 'advance' && orderInfo && (
          <div className="mb-6 p-4 bg-white rounded-2xl border border-amber-200 text-left space-y-2">
            <p className="text-xs font-body font-bold text-earth-600 uppercase tracking-wide mb-2">Payment Breakdown</p>
            <div className="flex justify-between text-sm font-body">
              <span className="text-earth-600 flex items-center gap-1.5">
                <MdCheckCircle size={13} className="text-purple-500" /> Advance paid (Khalti)
              </span>
              <span className="font-bold text-purple-700">{npr(orderInfo.advanceAmount)}</span>
            </div>
            <div className="flex justify-between text-sm font-body">
              <span className="text-earth-600 flex items-center gap-1.5">
                <MdDeliveryDining size={14} /> Pay on delivery (Cash)
              </span>
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
              <MdShoppingBag size={18} /> View My Orders
            </button>
            <button onClick={() => navigate('/dashboard/market')}
              className="btn-secondary w-full justify-center py-3">
              🛒 Continue Shopping
            </button>
          </div>
        )}

        {status !== 'verifying' && (
          <p className="mt-4 text-[10px] text-earth-400 font-body">
            Secured by Khalti · Nepal Rastra Bank Regulated · PCI DSS Compliant
          </p>
        )}
      </div>
    </div>
  );
}
