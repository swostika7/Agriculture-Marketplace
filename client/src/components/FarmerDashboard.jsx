import React, { useState, useEffect } from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import {
  MdAddCircle, MdInventory, MdBarChart, MdEdit, MdDelete,
  MdCheckCircle, MdTrendingDown, MdTrendingUp, MdLocationOn,
  MdCategory, MdShoppingBag, MdSmartToy
} from 'react-icons/md';
import { GiWheat, GiFruitBowl } from 'react-icons/gi';
import { productsAPI, marketAPI, ordersAPI } from '../utils/api';
import LocationPicker from './LocationPicker';
import ImageUploader from './ImageUploader';
import { useLanguage } from '../context/LanguageContext';
import { npr } from '../utils/currency';

const CATEGORIES = ['Vegetable','Fruit','Grain','Dairy','Herb','Other'];
const SEASONS    = ['Spring','Summer','Autumn','Winter','Year-Round'];
const UNITS      = ['kg','g','lb','piece','dozen','litre'];
const BAR_COLORS = ['#2a8f2a','#44b044','#f59e0b','#6ec86e','#a5dea5'];

const EMPTY = {
  cropName:'', description:'', category:'Vegetable', quantity:'', unit:'kg',
  price:'', discountPrice:'', season:'Year-Round', imageURL:'',
  location:{ city:'', lat:27.7172, lng:85.3240 },
};

function PriceStatusBadge({ status, aiSuggestedPrice, farmerPrice }) {
  if (!status || status === 'none') return null;
  if (status === 'match') return (
    <div className="flex items-center gap-1.5 text-xs font-body text-leaf-700 bg-leaf-50 border border-leaf-200 px-3 py-1.5 rounded-xl">
      <MdCheckCircle size={14} className="text-leaf-500"/>
      Fair market price
    </div>
  );
  if (status === 'sale') return (
    <div className="flex items-center gap-2 text-xs font-body bg-red-50 border border-red-200 px-3 py-1.5 rounded-xl">
      <MdTrendingDown size={14} className="text-red-500"/>
      <span className="text-red-700 font-semibold">SALE</span>
      <span className="text-red-600">Below market price</span>
      {aiSuggestedPrice > 0 && <span className="line-through text-red-300 font-mono">{npr(aiSuggestedPrice)}</span>}
    </div>
  );
  if (status === 'above') return (
    <div className="flex items-center gap-1.5 text-xs font-body text-harvest-700 bg-harvest-50 border border-harvest-200 px-3 py-1.5 rounded-xl">
      <MdTrendingUp size={14} className="text-harvest-500"/>
      Above market price
    </div>
  );
  return null;
}

function StatCard({ icon:Icon, label, value, sub, color='leaf' }) {
  const bg = { leaf:'bg-leaf-50', harvest:'bg-harvest-50', earth:'bg-earth-100', sky:'bg-sky-50' };
  const tx = { leaf:'text-leaf-600', harvest:'text-harvest-600', earth:'text-earth-600', sky:'text-sky-500' };
  return (
    <div className="card flex items-center gap-4 hover:shadow-glow transition-shadow">
      <div className={`w-12 h-12 rounded-xl ${bg[color]} flex items-center justify-center shrink-0`}>
        <Icon size={24} className={tx[color]}/>
      </div>
      <div>
        <p className="text-xs font-body text-earth-500 uppercase tracking-wide">{label}</p>
        <p className={`text-xl font-display font-bold ${tx[color]}`}>{value}</p>
        {sub && <p className="text-xs text-earth-400 mt-0.5 font-body">{sub}</p>}
      </div>
    </div>
  );
}

export default function FarmerDashboard() {
  const { t } = useLanguage();
  const [form,          setForm]         = useState(EMPTY);
  const [products,      setProducts]     = useState([]);
  const [orders,        setOrders]       = useState([]);
  const [insights,      setInsights]     = useState(null);
  const [submitLoading, setSubmitLoading]= useState(false);
  const [submitMsg,     setSubmitMsg]    = useState('');
  const [activeTab,     setActiveTab]    = useState('upload');
  const [editingId,     setEditingId]    = useState(null);

  useEffect(() => {
    (async () => {
      const [p,o,i] = await Promise.allSettled([
        productsAPI.getFarmer(), ordersAPI.getAll(), marketAPI.insights()
      ]);
      if (p.status === 'fulfilled') setProducts(p.value.data);
      if (o.status === 'fulfilled') setOrders(o.value.data);
      if (i.status === 'fulfilled') setInsights(i.value.data);
    })();
  }, []);

  const set = k => e => setForm(p => ({ ...p, [k]: e.target.value }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitLoading(true); setSubmitMsg('');
    try {
      const discountPrice = form.discountPrice ? +form.discountPrice : null;
      const regularPrice  = +form.price;
      // Validate: discount must be less than regular price
      if (discountPrice && discountPrice >= regularPrice) {
        setSubmitMsg('❌ Discount price must be lower than the regular price.');
        setSubmitLoading(false); return;
      }
      const payload = {
        ...form,
        quantity: regularPrice,
        price: regularPrice,
        discountPrice: discountPrice,
        quantity: +form.quantity,
        aiSuggestedPrice: 0,
      };
      if (editingId) {
        const { data } = await productsAPI.update(editingId, payload);
        setProducts(prev => prev.map(p => p._id === editingId ? data : p));
        setSubmitMsg('✅ Updated!'); setEditingId(null);
      } else {
        const { data } = await productsAPI.create(payload);
        setProducts(prev => [data, ...prev]);
        setSubmitMsg('✅ Published!');
      }
      setForm(EMPTY);
    } catch(err) {
      setSubmitMsg('❌ ' + (err.response?.data?.message || 'Failed'));
    } finally { setSubmitLoading(false); }
  };

  const startEdit = (p) => {
    setForm({
      cropName:p.cropName, description:p.description||'', category:p.category,
      quantity:String(p.quantity), unit:p.unit, price:String(p.price),
      discountPrice: p.discountPrice ? String(p.discountPrice) : '',
      season:p.season, imageURL:p.imageURL||'',
      location:{ city:p.location?.city||'', lat:p.location?.lat||27.7172, lng:p.location?.lng||85.3240 },
    });
    setEditingId(p._id); setActiveTab('upload');
    window.scrollTo({ top:0, behavior:'smooth' });
  };

  const deleteProduct = async (id) => {
    if (!window.confirm('Delete this listing?')) return;
    await productsAPI.delete(id);
    setProducts(prev => prev.filter(p => p._id !== id));
  };

  const totalRevenue   = orders.filter(o => o.paymentStatus === 'Paid').reduce((s,o) => s+o.totalPrice, 0);
  const pendingOrders  = orders.filter(o => o.status === 'Pending').length;
  const activeListings = products.filter(p => p.isAvailable).length;
  const demandData     = insights?.topDemand?.map(p => ({ name:p.cropName, views:p.demand })) || [];
  const categoryData   = insights?.categoryDist?.map(c => ({ name:c._id, count:c.count, avgPrice:Math.round(c.avgPrice||0) })) || [];

  const TABS = [
    { id:'upload',   Icon:MdAddCircle, label: editingId ? 'Edit Listing' : t('newListing') },
    { id:'products', Icon:MdInventory, label: t('myProducts') },
    { id:'insights', Icon:MdBarChart,  label: t('insights') },
  ];

  return (
    <div className="space-y-6 animate-fade-in max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="section-title text-3xl flex items-center gap-2">
            <GiWheat className="text-leaf-500" size={32}/> {t('farmerDashboard')}
          </h1>
          <p className="section-sub">Manage your listings and track market performance</p>
        </div>
        <div className="flex items-center gap-2 badge-green text-sm py-1.5 px-4 w-fit">
          <span className="w-2 h-2 rounded-full bg-leaf-500 animate-pulse"/>
          Live Market Active
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard icon={MdInventory}   label={t('activeListings')} value={activeListings} color="leaf"/>
        <StatCard icon={MdShoppingBag} label={t('pendingOrders')}  value={pendingOrders}  color="harvest"/>
        <StatCard icon={GiWheat}       label={t('paidRevenue')}    value={npr(totalRevenue)} color="earth"/>
        <StatCard icon={MdBarChart}    label="Orders / Week"       value={insights?.recentOrders ?? '—'} color="sky"/>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 bg-earth-50 p-1 rounded-xl border border-earth-100 w-fit">
        {TABS.map(({ id, Icon, label }) => (
          <button key={id} onClick={() => setActiveTab(id)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-body font-medium transition-all
              ${activeTab===id ? 'bg-white text-leaf-700 shadow-sm' : 'text-earth-500 hover:text-earth-700'}`}>
            <Icon size={16}/>{label}
          </button>
        ))}
      </div>

      {/* ── Upload / Edit Tab ── */}
      {activeTab === 'upload' && (
        <div className="grid lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 card">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-xl font-display font-semibold text-earth-800 flex items-center gap-2">
                {editingId ? <><MdEdit className="text-harvest-500"/> Edit Product</> : <><MdAddCircle className="text-leaf-500"/> {t('newListing')}</>}
              </h2>
              {editingId && (
                <button onClick={() => { setEditingId(null); setForm(EMPTY); }}
                  className="text-sm text-earth-500 hover:text-red-500 font-body">✕ Cancel</button>
              )}
            </div>

            {submitMsg && (
              <div className={`mb-4 p-3 rounded-xl text-sm font-body border
                ${submitMsg.startsWith('✅') ? 'bg-leaf-50 border-leaf-200 text-leaf-700' : 'bg-red-50 border-red-200 text-red-600'}`}>
                {submitMsg}
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-5">
              {/* Image */}
              <ImageUploader
                label="Product Photo (upload from device)"
                value={form.imageURL}
                onChange={v => setForm(p => ({ ...p, imageURL:v }))}
              />

              {/* Name + Category */}
              <div className="grid sm:grid-cols-2 gap-4">
                <div>
                  <label className="label flex items-center gap-1"><MdCategory size={14}/> {t('cropName')} *</label>
                  <input className="input" placeholder="e.g. Cherry Tomatoes" value={form.cropName} onChange={set('cropName')} required/>
                </div>
                <div>
                  <label className="label flex items-center gap-1"><GiFruitBowl size={14}/> {t('category')} *</label>
                  <select className="select" value={form.category} onChange={set('category')}>
                    {CATEGORIES.map(c => <option key={c}>{c}</option>)}
                  </select>
                </div>
              </div>

              {/* Description */}
              <div>
                <label className="label">{t('description')}</label>
                <textarea className="input resize-none" rows={2} placeholder="Describe your produce…"
                  value={form.description} onChange={set('description')} maxLength={200}/>
              </div>

              {/* Qty + Unit + Season */}
              <div className="grid sm:grid-cols-3 gap-4">
                <div>
                  <label className="label">{t('quantity')} *</label>
                  <input className="input" type="number" min="0" step="0.01" value={form.quantity} onChange={set('quantity')} required/>
                  {form.quantity !== '' && +form.quantity === 0 && (
                    <p className="text-xs text-red-500 font-body mt-1 flex items-center gap-1">
                      ⚠️ Product will be marked <strong>Out of Stock</strong>
                    </p>
                  )}
                </div>
                <div>
                  <label className="label">{t('unit')} *</label>
                  <select className="select" value={form.unit} onChange={set('unit')}>
                    {UNITS.map(u => <option key={u}>{u}</option>)}
                  </select>
                </div>
                <div>
                  <label className="label">{t('season')}</label>
                  <select className="select" value={form.season} onChange={set('season')}>
                    {SEASONS.map(s => <option key={s}>{s}</option>)}
                  </select>
                </div>
              </div>

              {/* Location picker */}
              <LocationPicker
                label={<span className="flex items-center gap-1"><MdLocationOn size={14}/> {t('farmLocation')} *</span>}
                placeholder="Type your village or city name…"
                value={form.location}
                onChange={loc => setForm(p => ({ ...p, location:loc }))}
              />

              {/* Pricing — two fields */}
              <div className="space-y-3">
                <label className="label font-semibold text-earth-700">Pricing (NPR per {form.unit || 'unit'})</label>
                <div className="grid sm:grid-cols-2 gap-4">
                  {/* Regular Price */}
                  <div className="relative">
                    <label className="label text-xs text-earth-500 mb-1">Regular Price <span className="text-red-500">*</span></label>
                    <div className="relative">
                      <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-earth-400 text-xs font-mono font-medium">Rs.</span>
                      <input className="input pl-10" type="number" step="1" min="0" placeholder="0"
                        value={form.price} onChange={set('price')} required/>
                    </div>
                    <p className="text-xs text-earth-400 mt-1 font-body">The original / market price</p>
                  </div>

                  {/* Discount Price */}
                  <div className="relative">
                    <label className="label text-xs text-earth-500 mb-1 flex items-center gap-1.5">
                      Discount / Sale Price
                      <span className="badge bg-red-100 text-red-600 text-xs py-0">Optional</span>
                    </label>
                    <div className="relative">
                      <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-earth-400 text-xs font-mono font-medium">Rs.</span>
                      <input className={`input pl-10 ${form.discountPrice && +form.discountPrice < +form.price ? 'border-red-400 bg-red-50 focus:ring-red-200' : ''}`}
                        type="number" step="1" min="0" placeholder="Leave blank for no sale"
                        value={form.discountPrice} onChange={set('discountPrice')}/>
                    </div>
                    <p className="text-xs text-earth-400 mt-1 font-body">Must be lower than regular price</p>
                  </div>
                </div>

                {/* Live sale preview */}
                {form.price && form.discountPrice && +form.discountPrice > 0 && (
                  <div className={`flex items-center gap-3 p-3 rounded-xl border text-sm font-body
                    ${+form.discountPrice < +form.price
                      ? 'bg-red-50 border-red-200'
                      : 'bg-harvest-50 border-harvest-200'}`}>
                    {+form.discountPrice < +form.price ? (
                      <>
                        <span className="text-lg">🏷️</span>
                        <div>
                          <p className="font-semibold text-red-700">Sale listing — will appear with SALE badge</p>
                          <p className="text-red-500 text-xs">
                            <span className="line-through">Rs. {form.price}</span>
                            {' → '}
                            <span className="font-bold">Rs. {form.discountPrice}</span>
                            {' '}
                            ({Math.round((1 - form.discountPrice / form.price) * 100)}% off)
                          </p>
                        </div>
                      </>
                    ) : (
                      <>
                        <span className="text-lg">⚠️</span>
                        <p className="text-harvest-700">Discount price must be lower than regular price</p>
                      </>
                    )}
                  </div>
                )}

                {/* Show existing price status when editing */}
                {form.price && editingId && !form.discountPrice && (
                  <div className="mt-1">
                    <PriceStatusBadge
                      status={products.find(p=>p._id===editingId)?.priceStatus}
                      aiSuggestedPrice={products.find(p=>p._id===editingId)?.aiSuggestedPrice}
                      farmerPrice={+form.price}
                    />
                  </div>
                )}
              </div>

              <button type="submit" disabled={submitLoading}
                className="btn-primary w-full justify-center py-3 text-base disabled:opacity-60">
                {submitLoading
                  ? <><span className="spinner" style={{width:18,height:18,borderWidth:2}}/>{editingId?'Updating…':'Publishing…'}</>
                  : editingId
                    ? <><MdEdit size={18}/>{t('updateListing')}</>
                    : <><GiWheat size={18}/>{t('publishListing')}</>}
              </button>
            </form>
          </div>

          {/* Tips panel */}
          <div className="space-y-4">
            <div className="card bg-gradient-to-br from-leaf-50 to-earth-50">
              <h3 className="font-display font-semibold text-earth-800 mb-3 flex items-center gap-2">
                <MdSmartToy className="text-leaf-500" size={20}/> Listing Tips
              </h3>
              <div className="space-y-3 text-sm font-body">
                {[
                  ['📸','Add a clear photo','Products with photos get 3× more views'],
                  ['📍','Set exact location','Nearby consumers see your products first'],
                  ['💰','Price competitively','Check Analytics for market price trends'],
                  ['📦','Keep stock updated','Out-of-stock items are hidden automatically'],
                ].map(([icon,title,desc]) => (
                  <div key={title} className="flex gap-3 py-2 border-b border-earth-100 last:border-0">
                    <span className="text-base shrink-0">{icon}</span>
                    <div>
                      <p className="font-medium text-earth-700 text-xs">{title}</p>
                      <p className="text-earth-400 text-xs mt-0.5">{desc}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="card">
              <h3 className="font-display font-semibold text-earth-800 mb-3 text-sm">Price Status Guide</h3>
              <div className="space-y-2 text-xs font-body">
                {[
                  ['🟢','Match','Your price = market rate'],
                  ['🔴','Sale','Below market = more buyers'],
                  ['🟡','Above','Higher than market rate'],
                ].map(([dot,label,desc]) => (
                  <div key={label} className="flex items-center gap-2 py-1.5 border-b border-earth-50 last:border-0">
                    <span>{dot}</span>
                    <span className="font-medium text-earth-700 w-12">{label}</span>
                    <span className="text-earth-400">{desc}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── My Products Tab ── */}
      {activeTab === 'products' && (
        <div className="card">
          <h2 className="text-xl font-display font-semibold text-earth-800 mb-5 flex items-center gap-2">
            <MdInventory className="text-leaf-500"/> {t('myProducts')}
          </h2>
          {products.length === 0 ? (
            <div className="text-center py-16 text-earth-400">
              <GiWheat size={48} className="mx-auto mb-3 opacity-30"/>
              <p className="font-body">No listings yet. Create your first product!</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm font-body">
                <thead>
                  <tr className="border-b border-earth-100 text-earth-500 text-left">
                    {['Crop','Category','Qty','Price (NPR)','Sale Price','Status','Available','Actions'].map(h => (
                      <th key={h} className="pb-3 pr-4 font-medium">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-earth-50">
                  {products.map(p => (
                    <tr key={p._id} className="hover:bg-earth-50 transition-colors">
                      <td className="py-3 pr-4 font-medium text-earth-800">
                        <div className="flex items-center gap-2">
                          {p.imageURL
                            ? <img src={p.imageURL} alt="" className="w-8 h-8 rounded-lg object-cover"/>
                            : <div className="w-8 h-8 rounded-lg bg-leaf-100 flex items-center justify-center"><GiWheat size={16} className="text-leaf-500"/></div>}
                          <span className="truncate max-w-[100px]">{p.cropName}</span>
                        </div>
                      </td>
                      <td className="py-3 pr-4"><span className="badge-earth">{p.category}</span></td>
                      <td className="py-3 pr-4 text-earth-600">{p.quantity} {p.unit}</td>
                      <td className="py-3 pr-4 font-mono font-semibold text-earth-800">
                        {p.discountPrice ? (
                          <span className="line-through text-earth-400 text-xs">{npr(p.price)}</span>
                        ) : npr(p.price)}
                      </td>
                      <td className="py-3 pr-4">
                        {p.discountPrice ? (
                          <span className="font-mono font-bold text-red-600">{npr(p.discountPrice)}</span>
                        ) : (
                          <span className="text-earth-300 text-xs">—</span>
                        )}
                      </td>
                      <td className="py-3 pr-4">
                        {p.priceStatus === 'sale'  && <span className="badge bg-red-100 text-red-600 text-xs">SALE</span>}
                        {p.priceStatus === 'match' && <MdCheckCircle size={14} className="text-leaf-500"/>}
                        {p.priceStatus === 'above' && <MdTrendingUp size={14} className="text-harvest-500"/>}
                        {(!p.priceStatus || p.priceStatus === 'none') && <span className="text-earth-400">—</span>}
                      </td>
                      <td className="py-3 pr-4">
                        <span className={p.isAvailable ? 'badge-green' : 'badge-red'}>
                          {p.isAvailable ? 'In Stock' : 'Out of Stock'}
                        </span>
                      </td>
                      <td className="py-3 flex items-center gap-2">
                        <button onClick={() => startEdit(p)}
                          className="p-1.5 rounded-lg hover:bg-leaf-50 text-leaf-500 hover:text-leaf-700 transition-colors">
                          <MdEdit size={16}/>
                        </button>
                        <button onClick={() => deleteProduct(p._id)}
                          className="p-1.5 rounded-lg hover:bg-red-50 text-red-400 hover:text-red-600 transition-colors">
                          <MdDelete size={16}/>
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ── Insights Tab ── */}
      {activeTab === 'insights' && (
        <div className="space-y-6">
          <div className="card">
            <h2 className="text-xl font-display font-semibold text-earth-800 mb-1 flex items-center gap-2">
              <MdBarChart className="text-leaf-500"/> Top Demanded Crops
            </h2>
            <p className="text-sm text-earth-400 mb-5 font-body">By product views · prices in NPR</p>
            {demandData.length > 0 ? (
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={demandData} barSize={36}>
                  <XAxis dataKey="name" tick={{fontSize:12,fill:'#8b7050',fontFamily:'DM Sans'}} axisLine={false} tickLine={false}/>
                  <YAxis tick={{fontSize:12,fill:'#c0af8e'}} axisLine={false} tickLine={false}/>
                  <Tooltip contentStyle={{borderRadius:'12px',border:'none',fontFamily:'DM Sans'}} cursor={{fill:'rgba(42,143,42,0.05)'}}/>
                  <Bar dataKey="views" radius={[6,6,0,0]}>
                    {demandData.map((_,i) => <Cell key={i} fill={BAR_COLORS[i%5]}/>)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <p className="text-center py-10 text-earth-400 font-body">Add products and receive orders to see insights.</p>
            )}
          </div>

          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {categoryData.map((c,i) => (
              <div key={c.name} className="card-hover">
                <div className="flex justify-between items-start mb-3">
                  <span className="badge-earth">{c.name}</span>
                  <span className="text-2xl">{['🥕','🍎','🌾','🥛','🌿','📦'][i%6]}</span>
                </div>
                <p className="text-2xl font-display font-bold text-earth-800">{c.count}</p>
                <p className="text-xs text-earth-400 font-body">listings · avg {npr(c.avgPrice)}/unit</p>
                <div className="mt-3 h-1.5 bg-earth-100 rounded-full overflow-hidden">
                  <div className="h-full bg-leaf-400 rounded-full"
                    style={{width:`${Math.min(100,(c.count/(Math.max(...categoryData.map(x=>x.count))||1))*100)}%`}}/>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
