import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import {
  MdSearch, MdLocationOn, MdLocalOffer, MdVerified, MdStar,
  MdShoppingCart, MdAdd, MdRemove, MdClose, MdAutoAwesome,
  MdAddShoppingCart, MdChat, MdInfo
} from 'react-icons/md';
import { GiWheat } from 'react-icons/gi';
import { productsAPI, ordersAPI, cartAPI, chatAPI } from '../utils/api';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import { npr } from '../utils/currency';
import PaymentModal from './PaymentModal';
import { ReviewSection, StarRating } from './ReviewSection';
import { useNavigate, useLocation } from 'react-router-dom';

const CATS = ['All', 'Vegetable', 'Fruit', 'Grain', 'Dairy', 'Herb', 'Other'];
const SEASONS = ['All', 'Spring', 'Summer', 'Autumn', 'Winter', 'Year-Round'];
const CAT_EMOJI = { Vegetable: '🥦', Fruit: '🍎', Grain: '🌾', Dairy: '🥛', Herb: '🌿', Other: '📦' };
const SEASON_CLS = { Spring: 'bg-green-100 text-green-700', Summer: 'bg-yellow-100 text-yellow-700', Autumn: 'bg-orange-100 text-orange-700', Winter: 'bg-blue-100 text-blue-700', 'Year-Round': 'bg-earth-100 text-earth-600' };

function haversineKm(a, b, c, d) { const R = 6371, f = v => v * Math.PI / 180; const x = Math.sin(f(c - a) / 2) ** 2 + Math.cos(f(a)) * Math.cos(f(c)) * Math.sin(f(d - b) / 2) ** 2; return R * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x)); }

/* ── Product Detail Modal (for reviews + chat) ────────── */
function ProductDetailModal({ product, onClose, onBuy, onAddCart, onChat, isFarmer }) {
  const { t } = useLanguage();
  if (!product) return null;
  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal-box max-w-2xl w-full">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-display font-bold text-earth-800">{product.cropName}</h2>
          <button onClick={onClose} className="p-2 rounded-xl hover:bg-earth-100 text-earth-500"><MdClose size={20} /></button>
        </div>

        {product.imageURL && (
          <img src={product.imageURL} alt="" className="w-full h-48 object-cover rounded-xl mb-4" />
        )}

        <div className="grid sm:grid-cols-2 gap-4 mb-4 text-sm font-body">
          <div className="space-y-2">
            <p className="text-earth-600"><span className="text-earth-800 font-medium">Category:</span> {product.category}</p>
            <p className="text-earth-600"><span className="text-earth-800 font-medium">Price:</span>{' '}
              {product.discountPrice ? (
                <span>
                  <span className="line-through text-earth-400 font-mono text-xs mr-1">{npr(product.price)}</span>
                  <span className="font-mono font-bold text-red-600">{npr(product.discountPrice)}/{product.unit}</span>
                  <span className="ml-1 badge bg-red-100 text-red-600 text-xs">SALE</span>
                </span>
              ) : (
                <span className="font-mono font-bold text-leaf-700">{npr(product.price)}/{product.unit}</span>
              )}
            </p>
            <p className="text-earth-600"><span className="text-earth-800 font-medium">Season:</span> {product.season}</p>
            <p className="text-earth-600 flex items-center gap-1"><MdLocationOn size={14} /> {product.location?.city}</p>
          </div>
          <div className="space-y-2">
            <p className="text-earth-600"><span className="text-earth-800 font-medium">Farmer:</span> {product.farmerID?.name}</p>
            <p className="text-earth-600"><span className="text-earth-800 font-medium">Available:</span> {product.quantity} {product.unit}</p>
            {product.avgRating > 0 && (
              <div className="flex items-center gap-2">
                <StarRating value={Math.round(product.avgRating)} readonly size={16} />
                <span className="text-earth-600">{product.avgRating.toFixed(1)} ({product.reviewCount})</span>
              </div>
            )}
          </div>
        </div>

        {product.description && <p className="text-earth-500 text-sm font-body mb-4 leading-relaxed">{product.description}</p>}

        {!isFarmer && (
          <div className="flex gap-3 mb-6">
            <button onClick={() => { onAddCart(product, 1); onClose(); }} className="btn-primary flex-1 justify-center">
              <MdAddShoppingCart size={18} /> {t('addToCart')}
            </button>
            <button onClick={() => { onChat(product); onClose(); }} className="btn-secondary flex-1 justify-center">
              <MdChat size={18} /> {t('startChat')}
            </button>
          </div>
        )}

        {isFarmer && (
          <div className="p-3 bg-earth-50 border border-earth-200 rounded-xl text-sm font-body text-earth-500 mb-4 flex items-center gap-2">
            <MdInfo size={16} />
            As a farmer, you can view products but cannot purchase them.
          </div>
        )}

        {/* Reviews section */}
        <div className="border-t border-earth-100 pt-4">
          <ReviewSection
            productID={product._id}
            farmerID={product.farmerID?._id}
            avgRating={product.avgRating}
            reviewCount={product.reviewCount}
          />
        </div>
      </div>
    </div>
  );
}

/* ── Product Card ────────────────────────────────────── */
function ProductCard({ product, userLat, userLng, onBuy, onAddCart, onView, isFarmer }) {
  const { t } = useLanguage();
  const [qty, setQty] = useState(1);
  const [loading, setLoading] = useState(false);
  const [added, setAdded] = useState(false);

  const distKm = (userLat && userLng && product.location?.lat)
    ? haversineKm(userLat, userLng, product.location.lat, product.location.lng).toFixed(1) : null;
  const isNearby = distKm && parseFloat(distKm) < 150;

  const handleAddCart = async (e) => {
    e.stopPropagation();
    setLoading(true);
    try { await onAddCart(product, qty); setAdded(true); setTimeout(() => setAdded(false), 2500); }
    catch (e) { alert(e.response?.data?.message || 'Failed'); }
    finally { setLoading(false); }
  };

  return (
    <div className="card-hover flex flex-col relative cursor-pointer" onClick={() => onView(product)}>
      {product.priceStatus === 'sale' && (
        <div className="absolute top-3 left-3 z-10 bg-red-500 text-white text-xs font-bold px-2.5 py-1 rounded-full shadow-sm flex items-center gap-1">
          <MdLocalOffer size={12} /> {t('sale')}
        </div>
      )}
      {product.demand > 15 && (
        <div className="absolute top-3 right-3 z-10 bg-harvest-400 text-white text-xs font-bold px-2 py-1 rounded-full flex items-center gap-1">
          <MdStar size={12} /> {t('popular')}
        </div>
      )}

      <div className="relative -mx-6 -mt-6 mb-4 h-44 overflow-hidden rounded-t-2xl bg-gradient-to-br from-leaf-50 to-earth-100">
        {product.imageURL
          ? <img src={product.imageURL} alt={product.cropName} className="w-full h-full object-cover" />
          : <div className="w-full h-full flex items-center justify-center text-7xl opacity-30">{CAT_EMOJI[product.category] || '🌿'}</div>}
      </div>

      <div className="flex-1 flex flex-col">
        <div className="flex items-start justify-between gap-2 mb-1">
          <h3 className="font-display font-semibold text-earth-800 text-base leading-tight">{product.cropName}</h3>
          <span className={`badge text-xs shrink-0 ${SEASON_CLS[product.season] || 'badge-earth'}`}>{product.season}</span>
        </div>

        {/* Rating preview */}
        {product.avgRating > 0 && (
          <div className="flex items-center gap-1.5 mb-2">
            <StarRating value={Math.round(product.avgRating)} readonly size={13} />
            <span className="text-xs text-earth-400 font-body">{product.avgRating.toFixed(1)} ({product.reviewCount})</span>
          </div>
        )}

        <div className="flex flex-wrap items-center gap-2 text-xs text-earth-400 font-body mb-3">
          <span className="flex items-center gap-1"><MdLocationOn size={12} />{product.location?.city}</span>
          {distKm && (
            <span className={`flex items-center gap-1 font-mono ${isNearby ? 'text-leaf-600 font-semibold' : ''}`}>
              {isNearby && <span className="w-1.5 h-1.5 bg-leaf-400 rounded-full animate-pulse" />}
              {distKm} {t('distanceAway')}
              {isNearby && <span className="badge-green text-xs ml-1">{t('nearby')}</span>}
            </span>
          )}
        </div>

        <div className="mt-auto">
          <div className="flex items-baseline justify-between mb-3">
            <div>
              {product.discountPrice ? (
                <div>
                  <div className="flex items-center gap-1.5">
                    <span className="badge bg-red-500 text-white text-xs font-bold px-1.5 animate-pulse">SALE</span>
                    <span className="text-xl font-display font-bold text-red-600">{npr(product.discountPrice)}</span>
                  </div>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <span className="line-through text-earth-400 font-mono text-xs">{npr(product.price)}</span>
                    <span className="text-xs text-red-500 font-body font-semibold">
                      {Math.round((1 - product.discountPrice / product.price) * 100)}% off
                    </span>
                  </div>
                </div>
              ) : product.priceStatus === 'sale' && product.aiSuggestedPrice ? (
                <div>
                  <div className="flex items-center gap-1.5">
                    <span className="badge bg-red-500 text-white text-xs font-bold px-1.5">SALE</span>
                    <span className="text-xl font-display font-bold text-red-600">{npr(product.price)}</span>
                  </div>
                  <span className="line-through text-earth-400 font-mono text-xs">{npr(product.aiSuggestedPrice)}</span>
                </div>
              ) : product.priceStatus === 'match' ? (
                <div className="flex items-center gap-1.5">
                  <MdVerified size={14} className="text-leaf-500" />
                  <span className="text-xl font-display font-bold text-leaf-700">{npr(product.price)}</span>
                </div>
              ) : (
                <span className="text-xl font-display font-bold text-leaf-700">{npr(product.price)}</span>
              )}
            </div>
            <span className="text-xs text-earth-400 font-body">{product.quantity} {product.unit} {t('available')}</span>
          </div>

          {/* Farmer sees info label; consumer sees cart button */}
          {isFarmer ? (
            <div className="py-2 px-3 rounded-xl bg-earth-50 text-xs text-earth-500 font-body text-center border border-earth-200">
              Click to view details & reviews
            </div>
          ) : (
            <div className="flex items-center gap-2" onClick={e => e.stopPropagation()}>
              <div className="flex items-center border border-earth-200 rounded-xl overflow-hidden">
                <button onClick={() => setQty(q => Math.max(1, q - 1))} className="w-9 h-9 flex items-center justify-center hover:bg-earth-50 text-earth-600">
                  <MdRemove size={16} />
                </button>
                <span className="w-7 text-center text-sm font-mono text-earth-700">{qty}</span>
                <button onClick={() => setQty(q => Math.min(product.quantity, q + 1))} className="w-9 h-9 flex items-center justify-center hover:bg-earth-50 text-earth-600">
                  <MdAdd size={16} />
                </button>
              </div>
              <button
                onClick={handleAddCart}
                disabled={loading || added}
                className={`flex-1 py-2 rounded-xl text-sm font-body font-medium transition-all flex items-center justify-center gap-1.5
                  ${added ? 'bg-leaf-100 text-leaf-700 cursor-default' : 'btn-primary'}`}>
                {loading ? <span className="spinner" style={{ width: 14, height: 14, borderWidth: 2 }} /> : <MdAddShoppingCart size={16} />}
                {added ? t('cartAdded') : loading ? '' : t('addToCart')}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ── Recommendation Strip ────────────────────────────── */
function RecommendationStrip({ reason, products, userLat, userLng, onView, onAddCart, isFarmer, onClose }) {
  const { t } = useLanguage();
  if (!products?.length) return null;
  return (
    <div className="rounded-2xl border border-leaf-200 bg-gradient-to-r from-leaf-50 to-earth-50 overflow-hidden animate-slide-up">
      <div className="flex items-center justify-between px-5 py-3 border-b border-leaf-100">
        <div className="flex items-center gap-2">
          <MdAutoAwesome size={18} className="text-leaf-500" />
          <span className="font-display font-semibold text-earth-800 text-sm">{reason}</span>
          <span className="badge-green text-xs">{products.length} items</span>
        </div>
        <button onClick={onClose} className="text-earth-400 hover:text-earth-600 p-1"><MdClose size={18} /></button>
      </div>
      <div className="overflow-x-auto">
        <div className="flex gap-4 p-4" style={{ minWidth: 'max-content' }}>
          {products.map(p => (
            <div key={p._id} className="w-52 shrink-0" onClick={() => onView(p)}>
              <div className="bg-white rounded-2xl border border-earth-100 p-3 shadow-card hover:shadow-glow transition-shadow cursor-pointer">
                <div className="h-28 rounded-xl overflow-hidden bg-earth-50 mb-2">
                  {p.imageURL
                    ? <img src={p.imageURL} alt="" className="w-full h-full object-cover" />
                    : <div className="w-full h-full flex items-center justify-center text-4xl opacity-30">{CAT_EMOJI[p.category]}</div>}
                </div>
                <h4 className="font-display font-semibold text-earth-800 text-sm leading-tight">{p.cropName}</h4>
                <p className="font-mono text-xs text-leaf-700 font-bold mt-1">{npr(p.price)}/{p.unit}</p>
                {p.avgRating > 0 && <div className="flex items-center gap-1 mt-1"><MdStar size={12} className="text-harvest-400" /><span className="text-xs text-earth-400">{p.avgRating.toFixed(1)}</span></div>}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ── Main Component ──────────────────────────────────── */
export default function ConsumerMarketplace() {
  const { user } = useAuth();
  const { t } = useLanguage();
  const navigate = useNavigate();
  const location = useLocation();
  const isFarmer = user?.role === 'Farmer';

  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('All');
  const [season, setSeason] = useState('All');
  const [sortBy, setSortBy] = useState('nearby');
  const [payModal, setPayModal] = useState(null);
  const [toast, setToast] = useState('');
  const [detailProduct, setDetailProduct] = useState(null);
  const [recommendations, setRecs] = useState([]);
  const [recReason, setRecReason] = useState('');
  const [showRecs, setShowRecs] = useState(false);
  const [viewHistory, setViewHistory] = useState([]);
  // Trie autocomplete state
  const [suggestions, setSuggestions] = useState([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [activeHybrid, setActiveHybrid] = useState(false); // true while hybrid search is running
  const searchBoxRef = useRef(null);

  // Pre-fill search/category when navigated from CartPage
  useEffect(() => {
    if (location.state?.search) setSearch(location.state.search);
    if (location.state?.category) setCategory(location.state.category);
  }, []);

  const userLat = user?.location?.lat;
  const userLng = user?.location?.lng;

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        // Use hybrid search when there is a query; plain getAll when browsing
        if (search && search.length >= 2) {
          setActiveHybrid(true);
          const { data } = await productsAPI.hybridSearch({
            query: search,
            category: category !== 'All' ? category : undefined,
            season: season !== 'All' ? season : undefined,
            consumerLat: userLat, consumerLng: userLng,
            viewHistory: viewHistory.slice(-10),
          });
          setProducts(data.products || []);
          // CBF similar products from hybrid response
          if (data.cbfProducts?.length > 0) {
            setRecs(data.cbfProducts);
            setRecReason(data.cbfReason || 'Similar products you may like');
            setShowRecs(true);
          } else {
            setShowRecs(false);
          }
          setActiveHybrid(false);
        } else {
          // No search query — standard fetch
          const params = { consumerLat: userLat, consumerLng: userLng };
          if (category !== 'All') params.category = category;
          if (season !== 'All') params.season = season;
          const { data } = await productsAPI.getAll(params);
          setProducts(data);
          setActiveHybrid(false);
        }
      } catch (e) { console.error(e); setActiveHybrid(false); }
      finally { setLoading(false); }
    })();
  }, [category, season, search, userLat, userLng]);   // eslint-disable-line

  // Trie autocomplete suggestions — fires on every keystroke with debounce
  useEffect(() => {
    if (!search || search.length < 1) { setSuggestions([]); setShowSuggestions(false); return; }
    const t = setTimeout(async () => {
      try {
        const { data } = await productsAPI.suggestions(search);
        if (data.suggestions?.length > 0) {
          setSuggestions(data.suggestions);
          setShowSuggestions(true);
        } else {
          setSuggestions([]);
          setShowSuggestions(false);
        }
      } catch { setSuggestions([]); }
    }, 180); // fast debounce for autocomplete
    return () => clearTimeout(t);
  }, [search]);

  const fetchRecs = useCallback(async (cat, crop) => {
    if (!cat || cat === 'All') return;
    try {
      const { data } = await productsAPI.recommend({ category: cat, cropName: crop || '', consumerLat: userLat, consumerLng: userLng, viewHistory: viewHistory.slice(-10) });
      if (data.products?.length > 0) { setRecs(data.products); setRecReason(data.reason); setShowRecs(true); }
    } catch { }
  }, [userLat, userLng, viewHistory]);

  useEffect(() => { if (category !== 'All' && !search) fetchRecs(category, ''); else if (!search) setShowRecs(false); }, [category, fetchRecs, search]);

  // Hide suggestions when clicking outside
  useEffect(() => {
    const handler = (e) => {
      if (searchBoxRef.current && !searchBoxRef.current.contains(e.target)) {
        setShowSuggestions(false);
      }
    };

    document.addEventListener('mousedown', handler);

    return () => {
      document.removeEventListener('mousedown', handler);
    };
  }, []);

  const handleView = useCallback((product) => {
    setDetailProduct(product);
    setViewHistory(prev => [...prev, { category: product.category, cropName: product.cropName }].slice(-20));
    fetchRecs(product.category, product.cropName);
  }, [fetchRecs]);

  const handleAddCart = async (product, quantity) => {
    if (isFarmer) return;
    await cartAPI.add(product._id, quantity);
    setToast(`🛒 ${product.cropName} ${t('cartAdded')}`);
    setTimeout(() => setToast(''), 3000);
    // Update cart badge in Layout
    window.dispatchEvent(new CustomEvent('cart-updated'));
  };

  const handleBuy = async (product, quantity) => {
    if (isFarmer) return;
    const { data: order } = await ordersAPI.create({ productID: product._id, quantity, deliveryAddress: user?.location?.city || '' });
    setPayModal({ order, product });
  };

  const handleChat = async (product) => {
    try {
      await chatAPI.startConversation(product.farmerID._id || product.farmerID, product._id);
      navigate('/dashboard/chat');
    } catch (e) { alert('Could not start conversation'); }
  };

  const sorted = useMemo(() => {
    const arr = [...products];
    if (sortBy === 'price-asc') return arr.sort((a, b) => a.price - b.price);
    if (sortBy === 'price-desc') return arr.sort((a, b) => b.price - a.price);
    if (sortBy === 'sale') return arr.sort((a, b) => (b.priceStatus === 'sale' ? 1 : 0) - (a.priceStatus === 'sale' ? 1 : 0));
    if (sortBy === 'popular') return arr.sort((a, b) => b.demand - a.demand);
    if (sortBy === 'rating') return arr.sort((a, b) => b.avgRating - a.avgRating);
    return arr;
  }, [products, sortBy]);

  return (
    <div className="space-y-6 animate-fade-in max-w-7xl mx-auto">
      <div>
        <h1 className="section-title text-3xl flex items-center gap-2">
          <MdShoppingCart className="text-leaf-500" size={32} /> {t('freshMarketplace')}
        </h1>
        <p className="section-sub">
          {user?.location?.city && <span className="text-leaf-600 font-medium">📍 {user.location.city} · </span>}
          {products.length} listings · {t('browseProducts')}
          {isFarmer && <span className="ml-2 badge-yellow text-xs">View only mode</span>}
        </p>
      </div>

      {toast && (
        <div className="p-4 bg-leaf-50 border border-leaf-200 rounded-xl text-leaf-700 text-sm font-body animate-slide-up flex items-center gap-3">
          <MdVerified size={18} /><span className="flex-1">{toast}</span>
          <button onClick={() => setToast('')}><MdClose size={16} /></button>
        </div>
      )}

      {/* Filters */}
      <div className="card">
        <div className="flex flex-col md:flex-row gap-4">

          {/* Search with Trie autocomplete */}
          <div className="relative flex-1" ref={searchBoxRef}>
            <MdSearch
              className="absolute left-3.5 top-1/2 -translate-y-1/2 text-earth-400 z-10"
              size={18}
            />

            {activeHybrid && (
              <span className="absolute right-3.5 top-1/2 -translate-y-1/2 z-10">
                <span
                  className="spinner"
                  style={{ width: 14, height: 14, borderWidth: 2 }}
                />
              </span>
            )}

            <input
              className="input pl-10 pr-10"
              placeholder={`${t('search')} crops…`}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onFocus={() => {
                if (suggestions.length > 0) setShowSuggestions(true);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Escape') setShowSuggestions(false);
                if (e.key === 'Enter') setShowSuggestions(false);
              }}
              autoComplete="off"
            />

            {showSuggestions && suggestions.length > 0 && (
              <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-earth-200 rounded-2xl shadow-payment z-50 overflow-hidden">
                <div className="px-3 pt-2 pb-1 flex items-center gap-2 border-b border-earth-50">
                  <span className="text-[10px] font-body font-bold text-earth-400 uppercase tracking-wider">
                    🌿 Smart Suggestions (Trie)
                  </span>
                </div>

                <div className="max-h-56 overflow-y-auto">
                  {suggestions.map((s, i) => (
                    <button
                      key={i}
                      onMouseDown={(e) => {
                        e.preventDefault();
                        setSearch(s.word);
                        setShowSuggestions(false);
                      }}
                      className="flex items-center gap-3 w-full px-4 py-2.5 hover:bg-leaf-50 transition-colors text-left group"
                    >
                      <MdSearch
                        size={14}
                        className="text-earth-300 group-hover:text-leaf-500 shrink-0"
                      />

                      <span className="flex-1 text-sm font-body text-earth-700 group-hover:text-leaf-700">
                        <span className="font-bold text-leaf-700">
                          {s.word.slice(0, search.length)}
                        </span>
                        {s.word.slice(search.length)}
                      </span>

                      {s.frequency > 0 && (
                        <span className="text-[10px] text-earth-300 font-body shrink-0">
                          {s.productIds?.length}{' '}
                          {s.productIds?.length === 1 ? 'item' : 'items'}
                        </span>
                      )}
                    </button>
                  ))}
                </div>

                <div className="px-4 py-2 border-t border-earth-50 bg-earth-50/50">
                  <p className="text-[10px] text-earth-400 font-body">
                    Hybrid search: Trie prefix match + content-based filtering
                  </p>
                </div>
              </div>
            )}
          </div>

          <select
            className="select md:w-40"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
          >
            {CATS.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>

          <select
            className="select md:w-40"
            value={season}
            onChange={(e) => setSeason(e.target.value)}
          >
            {SEASONS.map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>

          <select
            className="select md:w-48"
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value)}
          >
            <option value="nearby">📍 {t('nearbyFirst')}</option>
            <option value="price-asc">Price: Low → High</option>
            <option value="price-desc">Price: High → Low</option>
            <option value="sale">🏷️ Sales First</option>
            <option value="popular">⭐ Most Popular</option>
            <option value="rating">⭐ Highest Rated</option>
          </select>

        </div>

        <div className="flex flex-wrap gap-2 mt-4">
          {CATS.map((c) => (
            <button
              key={c}
              onClick={() => setCategory(c)}
              className={`text-sm px-3.5 py-1.5 rounded-full border font-body transition-all
        ${category === c
                  ? 'bg-leaf-500 text-white border-leaf-500'
                  : 'bg-white text-earth-600 border-earth-200 hover:border-leaf-300'
                }`}
            >
              {c === 'All' ? '🌐 All' : `${CAT_EMOJI[c]} ${c}`}
            </button>
          ))}
        </div>
      </div>

      {/* Grid */}
      {loading ? (
        <div className="flex justify-center py-24"><div className="spinner" /></div>
      ) : sorted.length === 0 ? (
        <div className="text-center py-20 text-earth-400">
          <GiWheat size={56} className="mx-auto mb-3 opacity-20" />
          <p className="font-body text-lg">No products found.</p>
        </div>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
          {sorted.map(p => (
            <ProductCard key={p._id} product={p} userLat={userLat} userLng={userLng}
              onBuy={handleBuy} onAddCart={handleAddCart} onView={handleView} isFarmer={isFarmer} />
          ))}
        </div>
      )}

      {/* Similar products — Content Filtering (shows below search results) */}
      {showRecs && recommendations.length > 0 && (
        <RecommendationStrip reason={recReason} products={recommendations} userLat={userLat} userLng={userLng}
          onView={handleView} onAddCart={handleAddCart} isFarmer={isFarmer} onClose={() => setShowRecs(false)} />
      )}

      {/* Product detail modal */}
      {detailProduct && (
        <ProductDetailModal
          product={detailProduct}
          onClose={() => setDetailProduct(null)}
          onBuy={handleBuy}
          onAddCart={handleAddCart}
          onChat={handleChat}
          isFarmer={isFarmer}
        />
      )}

      {/* Payment modal */}
      {payModal && (
        <PaymentModal
          order={payModal.order}
          product={payModal.product}
          onClose={() => setPayModal(null)}
          onSuccess={m => { setPayModal(null); setToast(`🎉 Order placed! ${m} confirmed.`); setTimeout(() => setToast(''), 5000); }}
        />
      )}
    </div>
  );
}

function inferCat(term) {
  const t = term.toLowerCase();
  const map = { Vegetable: ['tomato', 'spinach', 'carrot', 'capsicum', 'cabbage', 'onion', 'potato', 'gourd', 'yam'], Fruit: ['mango', 'apple', 'banana', 'strawberry', 'grape', 'orange', 'papaya', 'guava', 'litchi'], Grain: ['rice', 'wheat', 'maize', 'lentil', 'dal', 'barley', 'millet', 'paddy', 'basmati'], Dairy: ['milk', 'curd', 'yogurt', 'paneer', 'butter', 'cheese', 'ghee'], Herb: ['turmeric', 'ginger', 'garlic', 'coriander', 'mint', 'cardamom', 'cumin', 'pepper', 'chilli'] };
  for (const [cat, kws] of Object.entries(map)) { if (kws.some(k => t.includes(k))) return cat; }
  return 'Vegetable';
}
