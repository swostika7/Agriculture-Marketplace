/**
 * HistoryPage.jsx
 * Consumer: list of all bought (delivered/cancelled) orders
 * Farmer:   list of all sold (delivered/cancelled) orders
 */
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  MdHistory, MdCheckCircle, MdCancel, MdLocalShipping,
  MdFilterList, MdLocationOn, MdPerson, MdReceipt,
} from 'react-icons/md';
import { GiWheat } from 'react-icons/gi';
import { ordersAPI } from '../utils/api';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import { npr } from '../utils/currency';

const STATUS_STYLE = {
  Delivered: { cls: 'bg-leaf-100 text-leaf-700 border-leaf-200',  icon: <MdCheckCircle size={14}/> },
  Cancelled:  { cls: 'bg-red-100  text-red-600  border-red-200',  icon: <MdCancel size={14}/> },
  Pending:    { cls: 'bg-yellow-100 text-yellow-700 border-yellow-200', icon: <MdLocalShipping size={14}/> },
  'In-Transit':{ cls: 'bg-blue-100 text-blue-700 border-blue-200', icon: <MdLocalShipping size={14}/> },
};

const PAY_STYLE = {
  Paid:     'bg-leaf-100 text-leaf-700',
  Unpaid:   'bg-red-100  text-red-600',
  Initiated:'bg-yellow-100 text-yellow-700',
  Failed:   'bg-red-100  text-red-600',
  Refunded: 'bg-earth-100 text-earth-600',
};

export default function HistoryPage() {
  const { user }   = useAuth();
  const { t }      = useLanguage();
  const navigate   = useNavigate();
  const isFarmer   = user?.role === 'Farmer';

  const [orders,   setOrders]   = useState([]);
  const [loading,  setLoading]  = useState(true);
  const [filter,   setFilter]   = useState('All');   // All | Delivered | Cancelled
  const [search,   setSearch]   = useState('');

  useEffect(() => {
    ordersAPI.getHistory()
      .then(({ data }) => setOrders(data))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const filtered = orders.filter(o => {
    if (filter !== 'All' && o.status !== filter) return false;
    const q = search.toLowerCase();
    if (!q) return true;
    return (
      o.productID?.cropName?.toLowerCase().includes(q) ||
      (isFarmer ? o.consumerID?.name?.toLowerCase().includes(q) : o.farmerID?.name?.toLowerCase().includes(q))
    );
  });

  // Summary stats
  const totalSpent   = orders.filter(o=>o.status==='Delivered').reduce((s,o)=>s+o.totalPrice,0);
  const deliveredCnt = orders.filter(o=>o.status==='Delivered').length;
  const cancelledCnt = orders.filter(o=>o.status==='Cancelled').length;

  return (
    <div className="max-w-5xl mx-auto space-y-6 animate-fade-in">
      {/* Header */}
      <div>
        <h1 className="section-title text-3xl flex items-center gap-2">
          <MdHistory className="text-leaf-500" size={32}/>
          {isFarmer ? 'Sales History' : 'Purchase History'}
        </h1>
        <p className="section-sub">
          {isFarmer ? 'All your delivered and cancelled orders from buyers' : 'All your delivered and cancelled purchases'}
        </p>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-3 gap-4">
        <div className="card text-center py-5">
          <p className="text-3xl font-display font-bold text-leaf-600">{deliveredCnt}</p>
          <p className="text-xs text-earth-400 font-body mt-1 flex items-center justify-center gap-1">
            <MdCheckCircle className="text-leaf-500"/> {isFarmer ? 'Sold' : 'Delivered'}
          </p>
        </div>
        <div className="card text-center py-5">
          <p className="text-3xl font-display font-bold text-earth-700">{npr(totalSpent)}</p>
          <p className="text-xs text-earth-400 font-body mt-1 flex items-center justify-center gap-1">
            <MdReceipt className="text-harvest-500"/> {isFarmer ? 'Revenue' : 'Total Spent'}
          </p>
        </div>
        <div className="card text-center py-5">
          <p className="text-3xl font-display font-bold text-red-500">{cancelledCnt}</p>
          <p className="text-xs text-earth-400 font-body mt-1 flex items-center justify-center gap-1">
            <MdCancel className="text-red-400"/> Cancelled
          </p>
        </div>
      </div>

      {/* Filters + search */}
      <div className="card">
        <div className="flex flex-col sm:flex-row gap-3">
          <input
            className="input flex-1 text-sm"
            placeholder={isFarmer ? 'Search product or buyer…' : 'Search product or farmer…'}
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
          <div className="flex items-center gap-1 bg-earth-50 border border-earth-100 rounded-xl p-1">
            {['All','Delivered','Cancelled'].map(s => (
              <button key={s} onClick={() => setFilter(s)}
                className={`px-4 py-1.5 rounded-lg text-sm font-body font-medium transition-all
                  ${filter===s ? 'bg-white shadow-sm text-earth-800' : 'text-earth-500 hover:text-earth-700'}`}>
                {s === 'All' ? `All (${orders.length})` : s}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Orders list */}
      {loading ? (
        <div className="flex justify-center py-24"><div className="spinner"/></div>
      ) : filtered.length === 0 ? (
        <div className="card text-center py-20">
          <MdHistory size={56} className="mx-auto mb-4 text-earth-200"/>
          <h2 className="text-xl font-display font-bold text-earth-700 mb-2">
            {orders.length === 0 ? 'No history yet' : 'No results found'}
          </h2>
          <p className="text-earth-400 font-body">
            {orders.length === 0
              ? isFarmer ? 'Your completed sales will appear here.' : 'Your purchased orders will appear here.'
              : 'Try adjusting your search or filter.'}
          </p>
          {orders.length === 0 && !isFarmer && (
            <button onClick={() => navigate('/dashboard/market')} className="btn-primary mt-5">
              Browse Marketplace
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map(order => {
            const p  = order.productID;
            const st = STATUS_STYLE[order.status] || STATUS_STYLE['Pending'];
            const counterpart = isFarmer ? order.consumerID : order.farmerID;
            return (
              <div key={order._id} className="card hover:shadow-glow transition-shadow">
                <div className="flex flex-col sm:flex-row sm:items-center gap-4">
                  {/* Product image + info */}
                  <div className="flex items-center gap-4 flex-1 min-w-0">
                    {p?.imageURL
                      ? <img src={p.imageURL} alt="" className="w-16 h-16 rounded-2xl object-cover shrink-0"/>
                      : <div className="w-16 h-16 rounded-2xl bg-leaf-100 flex items-center justify-center shrink-0">
                          <GiWheat className="text-leaf-400" size={26}/>
                        </div>}
                    <div className="flex-1 min-w-0">
                      <h3 className="font-display font-bold text-earth-800 text-base truncate">{p?.cropName || 'Product'}</h3>
                      <p className="text-xs text-earth-400 font-body flex items-center gap-1 mt-0.5">
                        <MdPerson size={11}/>
                        {isFarmer ? `Buyer: ${counterpart?.name}` : `Farmer: ${counterpart?.name}`}
                      </p>
                      {counterpart?.location?.city && (
                        <p className="text-xs text-earth-400 font-body flex items-center gap-1">
                          <MdLocationOn size={11}/>{counterpart.location.city}
                        </p>
                      )}
                      <p className="text-xs text-earth-500 font-body mt-1">
                        Qty: {order.quantity} {p?.unit} · {new Date(order.updatedAt||order.createdAt).toLocaleDateString('en-NP',{day:'numeric',month:'short',year:'numeric'})}
                      </p>
                    </div>
                  </div>

                  {/* Price + badges */}
                  <div className="flex sm:flex-col items-center sm:items-end gap-3 shrink-0">
                    <p className="font-display font-bold text-earth-800 text-lg">{npr(order.totalPrice)}</p>
                    <div className="flex flex-wrap gap-1.5">
                      <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-body font-medium border ${st.cls}`}>
                        {st.icon} {order.status}
                      </span>
                      <span className={`px-2.5 py-1 rounded-full text-xs font-body font-medium ${PAY_STYLE[order.paymentStatus]||'bg-earth-100 text-earth-600'}`}>
                        {order.paymentStatus}
                      </span>
                    </div>
                    {order.paymentMethod && (
                      <p className="text-xs text-earth-400 font-body">{order.paymentMethod}</p>
                    )}
                  </div>
                </div>

                {/* Delivery address if present */}
                {order.deliveryAddress && (
                  <div className="mt-3 pt-3 border-t border-earth-50 flex items-center gap-2 text-xs text-earth-500 font-body">
                    <MdLocationOn size={13} className="text-earth-400 shrink-0"/>
                    Delivered to: <span className="font-medium text-earth-700">{order.deliveryAddress}</span>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
