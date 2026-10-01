import React, { useState, useEffect, useCallback } from 'react';
import {
  MdAdminPanelSettings, MdSearch, MdBlock, MdCheckCircle,
  MdWarning, MdClose, MdStorefront
} from 'react-icons/md';
import { GiFarmer } from 'react-icons/gi';
import { adminAPI } from '../utils/api';

/* Confirmation dialog  */
function ConfirmDialog({ farmer, onConfirm, onCancel, loading }) {
  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-payment max-w-sm w-full p-6 animate-fade-in">
        <div className="w-12 h-12 bg-red-50 rounded-2xl flex items-center justify-center mb-4">
          <MdWarning size={24} className="text-red-500"/>
        </div>
        <h3 className="font-display font-bold text-earth-800 text-lg mb-2">Deactivate {farmer.name}?</h3>
        <p className="text-sm text-earth-500 font-body leading-relaxed mb-5">
          This will immediately hide all <strong>{farmer.productCount}</strong> of their product listing(s) from the marketplace
          and prevent them from publishing new ones. Their account, order history, and chat history are all kept safe —
          nothing is deleted, and you can reactivate them at any time.
        </p>
        <div className="flex gap-3">
          <button onClick={onCancel} disabled={loading} className="btn-secondary flex-1 justify-center">Cancel</button>
          <button onClick={onConfirm} disabled={loading}
            className="flex-1 justify-center flex items-center gap-2 bg-red-500 hover:bg-red-600 text-white font-body font-semibold rounded-xl py-2.5 px-4 transition-colors disabled:opacity-60">
            {loading ? <span className="spinner" style={{width:16,height:16,borderWidth:2}}/> : <MdBlock size={18}/>}
            {loading ? 'Deactivating…' : 'Yes, Deactivate'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function AdminDashboard() {
  const [farmers,    setFarmers]    = useState([]);
  const [loading,    setLoading]    = useState(true);
  const [loadingMore,setLoadingMore]= useState(false);
  const [page,       setPage]       = useState(1);
  const [hasMore,    setHasMore]    = useState(false);
  const [search,     setSearch]     = useState('');
  const [debounced,  setDebounced]  = useState('');
  const [confirmTarget, setConfirmTarget] = useState(null); // farmer pending deactivation
  const [actionLoading, setActionLoading] = useState(false);
  const [toast, setToast] = useState(null); // { type:'success','error', text }

  //  ConsumerMarketplace's pattern
  useEffect(() => {
    const t = setTimeout(() => setDebounced(search), 400);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => { setPage(1); }, [debounced]);

  const load = useCallback(async (pageNum) => {
    pageNum === 1 ? setLoading(true) : setLoadingMore(true);
    try {
      const { data } = await adminAPI.getFarmers({ page: pageNum, limit: 20, search: debounced });
      setFarmers(prev => pageNum === 1 ? data.farmers : [...prev, ...data.farmers]);
      setHasMore(data.pagination.hasMore);
    } catch (e) {
      setToast({ type:'error', text: e.response?.data?.message || 'Failed to load farmers.' });
    } finally {
      setLoading(false); setLoadingMore(false);
    }
  }, [debounced]);

  useEffect(() => { load(page); }, [page, load]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 4000);
    return () => clearTimeout(t);
  }, [toast]);

  const handleDeactivate = async () => {
    if (!confirmTarget) return;
    setActionLoading(true);
    try {
      const { data } = await adminAPI.deactivate(confirmTarget._id);
      setFarmers(prev => prev.map(f => f._id === confirmTarget._id
        ? { ...f, isActive:false, deactivatedAt:new Date().toISOString() } : f));
      setToast({ type:'success', text: `${confirmTarget.name} deactivated — ${data.hiddenProducts} listing(s) hidden.` });
      setConfirmTarget(null);
    } catch (e) {
      setToast({ type:'error', text: e.response?.data?.message || 'Failed to deactivate farmer.' });
    } finally {
      setActionLoading(false);
    }
  };

  const handleReactivate = async (farmer) => {
    setActionLoading(true);
    try {
      await adminAPI.reactivate(farmer._id);
      setFarmers(prev => prev.map(f => f._id === farmer._id ? { ...f, isActive:true, deactivatedAt:null } : f));
      setToast({ type:'success', text: `${farmer.name} reactivated. They can now re-publish their listings.` });
    } catch (e) {
      setToast({ type:'error', text: e.response?.data?.message || 'Failed to reactivate farmer.' });
    } finally {
      setActionLoading(false);
    }
  };

  return (
    <div className="space-y-6 animate-fade-in max-w-5xl mx-auto">
      <div>
        <h1 className="section-title text-3xl flex items-center gap-2">
          <MdAdminPanelSettings className="text-leaf-500" size={32}/> Manage Farmers
        </h1>
        <p className="section-sub">Deactivate or reactivate farmer accounts. Deactivating hides their listings — nothing is ever deleted.</p>
      </div>

      {/* Toast */}
      {toast && (
        <div className={`flex items-center gap-2 p-3.5 rounded-xl text-sm font-body
          ${toast.type==='success' ? 'bg-leaf-50 border border-leaf-200 text-leaf-700' : 'bg-red-50 border border-red-200 text-red-600'}`}>
          {toast.type==='success' ? <MdCheckCircle size={16}/> : <MdWarning size={16}/>}
          {toast.text}
          <button onClick={() => setToast(null)} className="ml-auto text-current opacity-60 hover:opacity-100"><MdClose size={15}/></button>
        </div>
      )}

      <div className="card">
        {/* Search */}
        <div className="relative mb-5">
          <MdSearch size={18} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-earth-400"/>
          <input className="input pl-10" placeholder="Search farmers by name…"
            value={search} onChange={e => setSearch(e.target.value)}/>
        </div>

        {loading ? (
          <div className="flex justify-center py-16"><div className="spinner"/></div>
        ) : farmers.length === 0 ? (
          <div className="text-center py-16 text-earth-400">
            <GiFarmer size={48} className="mx-auto mb-3 opacity-20"/>
            <p className="font-body">No farmers found.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {farmers.map(f => (
              <div key={f._id} className={`flex flex-col sm:flex-row sm:items-center gap-3 p-4 rounded-2xl border transition-colors
                ${f.isActive === false ? 'bg-red-50/40 border-red-100' : 'bg-white border-earth-100 hover:bg-earth-50'}`}>
                <div className="flex items-center gap-3 flex-1 min-w-0">
                  {f.avatar
                    ? <img src={f.avatar} alt="" className="w-11 h-11 rounded-full object-cover shrink-0"/>
                    : <div className="w-11 h-11 rounded-full bg-leaf-100 flex items-center justify-center shrink-0"><GiFarmer className="text-leaf-600" size={20}/></div>}
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="font-semibold text-earth-800 font-body truncate">{f.name}</p>
                      {f.isActive === false
                        ? <span className="badge-red text-xs shrink-0">Deactivated</span>
                        : <span className="badge-green text-xs shrink-0">Active</span>}
                    </div>
                    <p className="text-xs text-earth-400 font-body truncate">{f.email}{f.phone ? ` · ${f.phone}` : ''}</p>
                  </div>
                </div>

                <div className="flex items-center gap-4 shrink-0">
                  <div className="flex items-center gap-1.5 text-xs text-earth-500 font-body">
                    <MdStorefront size={14}/> {f.productCount} listing{f.productCount===1?'':'s'}
                  </div>
                  {f.isActive === false ? (
                    <button onClick={() => handleReactivate(f)} disabled={actionLoading}
                      className="btn-secondary text-xs py-1.5 px-3 flex items-center gap-1.5 disabled:opacity-60">
                      <MdCheckCircle size={14}/> Reactivate
                    </button>
                  ) : (
                    <button onClick={() => setConfirmTarget(f)} disabled={actionLoading}
                      className="flex items-center gap-1.5 text-xs py-1.5 px-3 rounded-xl border border-red-200 text-red-600 hover:bg-red-50 font-body font-medium transition-colors disabled:opacity-60">
                      <MdBlock size={14}/> Deactivate
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {hasMore && !loading && (
          <div className="flex justify-center mt-5">
            <button onClick={() => setPage(p => p+1)} disabled={loadingMore} className="btn-secondary px-8 disabled:opacity-60">
              {loadingMore ? <><span className="spinner" style={{width:16,height:16,borderWidth:2}}/> Loading…</> : 'Load More Farmers'}
            </button>
          </div>
        )}
      </div>

      {confirmTarget && (
        <ConfirmDialog
          farmer={confirmTarget}
          loading={actionLoading}
          onConfirm={handleDeactivate}
          onCancel={() => setConfirmTarget(null)}
        />
      )}
    </div>
  );
}
