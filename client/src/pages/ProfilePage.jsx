import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  MdPerson, MdPhone, MdEmail, MdCalendarToday, MdShoppingBag, MdLock,
  MdSave, MdVisibility, MdVisibilityOff, MdInventory, MdLanguage,
  MdDeleteForever, MdWarning, MdClose, MdCheckCircle, MdArrowForward,
} from 'react-icons/md';
import { GiWheat, GiFarmer } from 'react-icons/gi';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import { ordersAPI, productsAPI } from '../utils/api';
import LocationPicker from '../components/LocationPicker';
import ImageUploader from '../components/ImageUploader';
import { npr } from '../utils/currency';

/* ════════════════════════════════════════════════════════
   DELETE ACCOUNT MODAL — 3-step confirmation
   Step 1: Warning + impact list
   Step 2: Type "delete my account"
   Step 3: Enter password → submit
════════════════════════════════════════════════════════ */
function DeleteAccountModal({ user, onClose, onDeleted }) {
  const { deleteAccount } = useAuth();
  const [step, setStep] = useState(1);   // 1 | 2 | 3
  const [phrase, setPhrase] = useState('');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const phraseRef = useRef(null);
  const pwRef = useRef(null);

  const REQUIRED_PHRASE = 'delete my account';
  const phraseOk = phrase.trim().toLowerCase() === REQUIRED_PHRASE;

  useEffect(() => {
    if (step === 2) setTimeout(() => phraseRef.current?.focus(), 100);
    if (step === 3) setTimeout(() => pwRef.current?.focus(), 100);
  }, [step]);

  const handleDelete = async () => {
    if (!phraseOk) { setError('Please type the exact phrase.'); return; }
    if (!password.trim()) { setError('Password is required.'); return; }
    setError(''); setLoading(true);
    try {
      await deleteAccount(password, phrase.trim());
      onDeleted();
    } catch (err) {
      setError(err.response?.data?.message || 'Deletion failed. Please try again.');
    } finally { setLoading(false); }
  };

  // What gets deleted — role-aware
  const impactItems = [
    { icon: '👤', text: 'Your account profile and personal data' },
    ...(user?.role === 'Farmer' ? [
      { icon: '🌾', text: 'All your product listings' },
      { icon: '💰', text: 'All sales and order records' },
    ] : [
      { icon: '🛒', text: 'Your cart items and order history' },
      { icon: '📦', text: 'All your purchase records' },
    ]),
    { icon: '💬', text: 'All conversations and chat messages' },
    { icon: '🔔', text: 'All notifications and payment records' },
    { icon: '⭐', text: 'All reviews you submitted' },
  ];

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(4px)' }}
      onClick={e => { if (e.target === e.currentTarget && !loading) onClose(); }}
    >
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md overflow-hidden">

        {/* ── Red header ── */}
        <div className="bg-gradient-to-r from-red-600 to-red-700 px-6 py-5 text-white">
          <div className="flex items-center justify-between mb-1">
            <div className="flex items-center gap-2">
              <div className="w-9 h-9 rounded-xl bg-white/20 flex items-center justify-center">
                <MdDeleteForever size={22} />
              </div>
              <h2 className="text-lg font-display font-bold">Delete Account</h2>
            </div>
            {!loading && (
              <button onClick={onClose} className="w-8 h-8 rounded-xl bg-white/10 hover:bg-white/20 flex items-center justify-center">
                <MdClose size={18} />
              </button>
            )}
          </div>
          {/* Step progress */}
          <div className="flex items-center gap-2 mt-3">
            {[1, 2, 3].map(s => (
              <React.Fragment key={s}>
                <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold font-body transition-all
                  ${step > s ? 'bg-white text-red-600' : step === s ? 'bg-white/30 text-white ring-2 ring-white' : 'bg-white/10 text-white/50'}`}>
                  {step > s ? '✓' : s}
                </div>
                {s < 3 && <div className={`flex-1 h-0.5 rounded ${step > s ? 'bg-white' : 'bg-white/20'}`} />}
              </React.Fragment>
            ))}
            <span className="ml-2 text-xs text-red-200 font-body">
              {step === 1 ? 'Review impact' : step === 2 ? 'Confirm phrase' : 'Enter password'}
            </span>
          </div>
        </div>

        <div className="px-6 py-5 space-y-4">

          {/* ── STEP 1: Impact warning ── */}
          {step === 1 && (
            <>
              <div className="flex items-start gap-3 p-3.5 bg-red-50 border border-red-200 rounded-2xl">
                <MdWarning size={20} className="text-red-500 shrink-0 mt-0.5" />
                <p className="text-sm font-body text-red-700">
                  <span className="font-bold">This action is permanent and cannot be undone.</span>{' '}
                  Once deleted, your account and all associated data will be gone forever.
                </p>
              </div>

              <div>
                <p className="text-xs font-body font-bold text-earth-600 uppercase tracking-wider mb-2">
                  The following will be permanently deleted:
                </p>
                <div className="space-y-1.5">
                  {impactItems.map((item, i) => (
                    <div key={i} className="flex items-center gap-2.5 py-1.5 px-3 bg-earth-50 rounded-xl">
                      <span className="text-base shrink-0">{item.icon}</span>
                      <span className="text-sm font-body text-earth-700">{item.text}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex gap-3 pt-1">
                <button onClick={onClose} className="btn-secondary flex-1 justify-center py-2.5">
                  Cancel, keep my account
                </button>
                <button
                  onClick={() => setStep(2)}
                  className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl bg-red-600 hover:bg-red-700 text-white text-sm font-body font-bold transition-colors"
                >
                  I understand <MdArrowForward size={16} />
                </button>
              </div>
            </>
          )}

          {/* ── STEP 2: Type confirmation phrase ── */}
          {step === 2 && (
            <>
              <div className="text-center py-2">
                <div className="text-4xl mb-3">⌨️</div>
                <h3 className="font-display font-bold text-earth-800 text-lg mb-1">Confirm Your Intent</h3>
                <p className="text-sm font-body text-earth-500">
                  To continue, please type exactly:
                </p>
                <div className="mt-2 px-4 py-2 bg-red-50 border border-red-200 rounded-xl inline-block">
                  <code className="text-red-600 font-mono font-bold text-sm tracking-wide">
                    delete my account
                  </code>
                </div>
              </div>

              <div>
                <input
                  ref={phraseRef}
                  className={`input text-center font-mono tracking-wide ${phrase.length > 0
                    ? phraseOk
                      ? 'border-red-400 bg-red-50 text-red-700'
                      : 'border-earth-300'
                    : ''
                    }`}
                  placeholder="Type the phrase above…"
                  value={phrase}
                  onChange={e => { setPhrase(e.target.value); setError(''); }}
                  autoComplete="off"
                  spellCheck={false}
                />
                {phrase.length > 0 && !phraseOk && (
                  <p className="text-xs text-earth-400 font-body mt-1.5 text-center">
                    {REQUIRED_PHRASE.length - phrase.trim().toLowerCase().split('').filter((c, i) => c === REQUIRED_PHRASE[i]).length} character(s) don't match yet
                  </p>
                )}
                {phraseOk && (
                  <p className="text-xs text-red-600 font-body mt-1.5 text-center flex items-center justify-center gap-1">
                    <MdCheckCircle size={13} /> Phrase confirmed
                  </p>
                )}
              </div>

              {error && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-red-600 text-sm font-body">
                  ⚠️ {error}
                </div>
              )}

              <div className="flex gap-3">
                <button onClick={() => { setStep(1); setPhrase(''); setError(''); }} className="btn-secondary flex-1 justify-center py-2.5">
                  Back
                </button>
                <button
                  onClick={() => { if (!phraseOk) { setError('Please type the exact phrase.'); return; } setStep(3); setError(''); }}
                  disabled={!phraseOk}
                  className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl bg-red-600 hover:bg-red-700 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-body font-bold transition-colors"
                >
                  Continue <MdArrowForward size={16} />
                </button>
              </div>
            </>
          )}

          {/* ── STEP 3: Password + final delete ── */}
          {step === 3 && (
            <>
              <div className="text-center py-2">
                <div className="text-4xl mb-3">🔑</div>
                <h3 className="font-display font-bold text-earth-800 text-lg mb-1">Final Confirmation</h3>
                <p className="text-sm font-body text-earth-500">
                  Enter your password to permanently delete{' '}
                  <span className="font-semibold text-earth-700">{user?.email}</span>
                </p>
              </div>

              <div>
                <label className="label flex items-center gap-1.5">
                  <MdLock size={14} /> Your Password
                </label>
                <div className="relative">
                  <input
                    ref={pwRef}
                    type={showPw ? 'text' : 'password'}
                    className="input pr-10"
                    placeholder="Enter your current password"
                    value={password}
                    onChange={e => { setPassword(e.target.value); setError(''); }}
                    onKeyDown={e => { if (e.key === 'Enter' && password && !loading) handleDelete(); }}
                    autoComplete="current-password"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPw(p => !p)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-earth-400 hover:text-earth-600"
                  >
                    {showPw ? <MdVisibilityOff size={18} /> : <MdVisibility size={18} />}
                  </button>
                </div>
              </div>

              {error && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-red-600 text-sm font-body flex items-start gap-2">
                  <span className="shrink-0">⚠️</span> {error}
                </div>
              )}

              {/* Final summary */}
              <div className="p-3 bg-earth-50 border border-earth-200 rounded-xl text-xs font-body text-earth-500 space-y-0.5">
                <p>✓ Phrase confirmed: <span className="text-red-600 font-mono">{phrase}</span></p>
                <p>✓ Account: <span className="font-medium text-earth-700">{user?.email}</span></p>
                <p>✓ Role: <span className="font-medium text-earth-700">{user?.role}</span></p>
              </div>

              <div className="flex gap-3">
                <button
                  onClick={() => { setStep(2); setPassword(''); setError(''); }}
                  disabled={loading}
                  className="btn-secondary flex-1 justify-center py-2.5 disabled:opacity-50"
                >
                  Back
                </button>
                <button
                  onClick={handleDelete}
                  disabled={loading || !password.trim()}
                  className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl bg-red-600 hover:bg-red-700 active:bg-red-800 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-body font-bold transition-colors"
                >
                  {loading ? (
                    <><span className="spinner" style={{ width: 16, height: 16, borderWidth: 2, borderColor: 'rgba(255,255,255,0.3)', borderTopColor: 'white' }} /> Deleting…</>
                  ) : (
                    <><MdDeleteForever size={18} /> Delete Forever</>
                  )}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

/* ════════════════════════════════════════════════════════
   PROFILE PAGE
════════════════════════════════════════════════════════ */
export default function ProfilePage() {
  const { user, updateProfile, logout } = useAuth();
  const { t, lang, setLang } = useLanguage();
  const navigate = useNavigate();

  const [form, setForm] = useState({
    name: user?.name || '',
    phone: user?.phone || '',
    bio: user?.bio || '',
    avatar: user?.avatar || '',
    city: user?.location?.city || '',
    lat: user?.location?.lat || 27.7172,
    lng: user?.location?.lng || 85.3240,
    currentPassword: '',
    newPassword: '',
    confirmPassword: '',
  });

  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState(null);
  const [tab, setTab] = useState('info');
  const [stats, setStats] = useState({ orders: 0, products: 0, revenue: 0 });
  const [showPw, setShowPw] = useState({ current: false, next: false, confirm: false });
  const [showDeleteModal, setShowDeleteModal] = useState(false);

  const set = k => e => setForm(p => ({ ...p, [k]: e.target.value }));

  useEffect(() => {
    (async () => {
      try {
        const [o, p] = await Promise.allSettled([ordersAPI.getAll(), productsAPI.getFarmer()]);
        const orders = o.status === 'fulfilled' ? o.value.data : [];
        const products = p.status === 'fulfilled' ? p.value.data : [];
        const revenue = orders.filter(x => x.paymentStatus === 'Paid').reduce((s, x) => s + x.totalPrice, 0);
        setStats({ orders: orders.length, products: products.length, revenue });
      } catch { }
    })();
  }, []);

  const handleLocationChange = loc => setForm(p => ({ ...p, city: loc.city, lat: loc.lat, lng: loc.lng }));

  const saveProfile = async (e) => {
    e.preventDefault(); setMsg(null);
    if (form.newPassword && form.newPassword !== form.confirmPassword) {
      setMsg({ type: 'error', text: 'New passwords do not match.' }); return;
    }
    setSaving(true);
    try {
      const payload = {
        name: form.name, phone: form.phone, bio: form.bio, avatar: form.avatar,
        location: { city: form.city, lat: +form.lat, lng: +form.lng },
      };
      if (form.newPassword) {
        payload.currentPassword = form.currentPassword;
        payload.newPassword = form.newPassword;
      }
      const result = await updateProfile(payload);
      if (result.passwordChanged) {
        setMsg({ type: 'success', text: '✅ Password changed! Signing you out for security…' });
        setTimeout(() => { logout(); navigate('/auth'); }, 2000);
      } else {
        setMsg({ type: 'success', text: '✅ Profile saved successfully!' });
        setForm(p => ({ ...p, currentPassword: '', newPassword: '', confirmPassword: '' }));
      }
    } catch (err) {
      setMsg({ type: 'error', text: err.response?.data?.message || 'Save failed.' });
    } finally { setSaving(false); }
  };

  const handleAccountDeleted = () => {
    setShowDeleteModal(false);
    navigate('/', { replace: true });
  };

  const roleCls = { Farmer: 'badge-green', Consumer: 'badge-blue', Admin: 'badge-red' };

  const TABS = [
    { id: 'info', Icon: MdPerson, label: t('personalInfo') },
    { id: 'security', Icon: MdLock, label: t('security') },
    { id: 'language', Icon: MdLanguage, label: t('language') },
    { id: 'activity', Icon: MdShoppingBag, label: t('activity') },
    { id: 'danger', Icon: MdDeleteForever, label: 'Delete Account' },
  ];

  return (
    <div className="max-w-4xl mx-auto space-y-6 animate-fade-in">

      {/* ── Hero banner ── */}
      <div className="relative rounded-3xl overflow-hidden bg-gradient-to-br from-leaf-600 via-leaf-700 to-leaf-900 p-8 text-white">
        <div className="absolute inset-0 bg-field-pattern opacity-10" />
        <div className="relative flex flex-col sm:flex-row items-center sm:items-end gap-6">
          <div className="relative shrink-0">
            {form.avatar
              ? <img src={form.avatar} alt="" className="w-24 h-24 rounded-2xl object-cover border-4 border-white/30 shadow-payment" />
              : <div className="w-24 h-24 rounded-2xl bg-white/20 backdrop-blur-sm flex items-center justify-center border-4 border-white/30 shadow-payment">
                {user?.role === 'Farmer' ? <GiFarmer size={48} className="text-white/80" /> : <MdPerson size={48} className="text-white/80" />}
              </div>}
          </div>
          <div className="text-center sm:text-left flex-1">
            <h1 className="text-3xl font-display font-bold">{user?.name}</h1>
            <p className="text-leaf-200 mt-1 font-body text-sm flex items-center gap-1 justify-center sm:justify-start">
              <MdEmail size={14} /> {user?.email}
            </p>
            <div className="flex items-center justify-center sm:justify-start gap-3 mt-2">
              <span className={`badge ${roleCls[user?.role]} text-xs`}>{user?.role}</span>
              {user?.location?.city && (
                <span className="text-leaf-200 text-xs font-body flex items-center gap-1">
                  📍 {user.location.city}
                </span>
              )}
            </div>
          </div>
          <div className="grid grid-cols-3 gap-4 sm:gap-5 text-center shrink-0">
            {[
              { label: user?.role === 'Farmer' ? 'Products' : 'Orders', value: user?.role === 'Farmer' ? stats.products : stats.orders },
              { label: 'Orders', value: stats.orders },
              { label: user?.role === 'Farmer' ? 'Revenue' : 'Spent', value: `Rs.${(stats.revenue / 1000).toFixed(1)}k` },
            ].map(s => (
              <div key={s.label}>
                <div className="text-2xl font-display font-bold text-white">{s.value}</div>
                <div className="text-leaf-300 text-xs font-body">{s.label}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── Tabs ── */}
      <div className="flex flex-wrap gap-2 bg-earth-50 p-1 rounded-2xl border border-earth-100 w-fit">
        {TABS.map(({ id, Icon, label }) => (
          <button key={id} onClick={() => setTab(id)}
            className={[
              'flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-body font-medium transition-all',
              tab === id
                ? id === 'danger'
                  ? 'bg-red-600 text-white shadow-sm'
                  : 'bg-white text-leaf-700 shadow-sm'
                : id === 'danger'
                  ? 'text-red-500 hover:bg-red-50'
                  : 'text-earth-500 hover:text-earth-700',
            ].join(' ')}>
            <Icon size={16} />{label}
          </button>
        ))}
      </div>

      {/* ── Status message ── */}
      {msg && (
        <div className={`p-4 rounded-xl border font-body text-sm flex items-center gap-2
          ${msg.type === 'success' ? 'bg-leaf-50 border-leaf-200 text-leaf-700' : 'bg-red-50 border-red-200 text-red-600'}`}>
          {msg.type === 'success' ? <MdCheckCircle size={16} /> : '⚠️'} {msg.text}
        </div>
      )}

      <form onSubmit={saveProfile}>

        {/* ══ INFO TAB ══ */}
        {tab === 'info' && (
          <div className="grid lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 card space-y-5">
              <h2 className="text-xl font-display font-semibold text-earth-800">Personal Information</h2>

              <ImageUploader
                label="Profile Photo"
                value={form.avatar}
                onChange={v => setForm(p => ({ ...p, avatar: v }))}
                size="small"
              />

              <div className="grid sm:grid-cols-2 gap-4">
                <div>
                  <label className="label flex items-center gap-1"><MdPerson size={14} /> Full Name *</label>
                  <input className="input" value={form.name} onChange={set('name')} required />
                </div>
                <div>
                  <label className="label flex items-center gap-1"><MdPhone size={14} /> Phone</label>
                  <input className="input" placeholder="98XXXXXXXX" value={form.phone} onChange={set('phone')} type="tel" />
                </div>
              </div>

              <div>
                <label className="label flex items-center gap-1"><MdEmail size={14} /> Email Address</label>
                <input className="input bg-earth-100 cursor-not-allowed" value={user?.email || ''} readOnly />
                <p className="text-xs text-earth-400 mt-1 font-body">Email cannot be changed.</p>
              </div>

              <div>
                <label className="label">Bio / About You</label>
                <textarea className="input resize-none" rows={3} placeholder="Tell buyers about yourself…"
                  value={form.bio} onChange={set('bio')} maxLength={300} />
                <p className="text-xs text-earth-400 mt-1 text-right font-body">{form.bio.length}/300</p>
              </div>

              <LocationPicker
                label={<span className="flex items-center gap-1">📍 Your Location / Farm Location</span>}
                placeholder="Search city or village…"
                value={{ city: form.city, lat: form.lat, lng: form.lng }}
                onChange={handleLocationChange}
              />

              <button type="submit" disabled={saving} className="btn-primary w-full justify-center py-3 text-base">
                {saving ? <><span className="spinner" style={{ width: 18, height: 18, borderWidth: 2 }} /> Saving…</> : <><MdSave size={18} /> Save Changes</>}
              </button>
            </div>

            <div className="space-y-4">
              <div className="card bg-gradient-to-br from-leaf-50 to-earth-50">
                <h3 className="font-display font-semibold text-earth-800 mb-3">Account Details</h3>
                <div className="space-y-3 text-sm font-body">
                  {[
                    { Icon: GiFarmer, label: 'Role', value: user?.role },
                    { Icon: MdCalendarToday, label: 'Joined', value: user?.createdAt ? new Date(user.createdAt).toLocaleDateString('en-NP', { year: 'numeric', month: 'long' }) : '—' },
                    { Icon: MdPhone, label: 'Phone', value: form.phone || 'Not set' },
                  ].map(({ Icon, label, value }) => (
                    <div key={label} className="flex items-center gap-3 py-2 border-b border-earth-100 last:border-0">
                      <Icon size={16} className="text-leaf-500 shrink-0" />
                      <div>
                        <p className="text-earth-400 text-xs">{label}</p>
                        <p className="text-earth-800 font-medium">{value}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ══ SECURITY TAB ══ */}
        {tab === 'security' && (
          <div className="max-w-md card space-y-5">
            <h2 className="text-xl font-display font-semibold text-earth-800 flex items-center gap-2">
              <MdLock className="text-leaf-500" /> Change Password
            </h2>
            <div className="p-4 bg-harvest-50 border border-harvest-200 rounded-xl text-sm font-body text-harvest-700 flex items-start gap-2">
              ⚠️ <span>Changing your password will automatically sign you out. You'll be redirected to sign in.</span>
            </div>

            {[
              { key: 'currentPassword', label: 'Current Password', showKey: 'current' },
              { key: 'newPassword', label: 'New Password', showKey: 'next' },
              { key: 'confirmPassword', label: 'Confirm New Password', showKey: 'confirm' },
            ].map(({ key, label, showKey }) => (
              <div key={key}>
                <label className="label flex items-center gap-1"><MdLock size={14} />{label}</label>
                <div className="relative">
                  <input className="input pr-10" type={showPw[showKey] ? 'text' : 'password'} placeholder="••••••••"
                    value={form[key]} onChange={set(key)} minLength={key !== 'currentPassword' ? 6 : undefined} />
                  <button type="button" onClick={() => setShowPw(p => ({ ...p, [showKey]: !p[showKey] }))}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-earth-400 hover:text-earth-600">
                    {showPw[showKey] ? <MdVisibilityOff size={18} /> : <MdVisibility size={18} />}
                  </button>
                </div>
                {key === 'confirmPassword' && form.newPassword && form.confirmPassword && form.newPassword !== form.confirmPassword && (
                  <p className="text-xs text-red-500 mt-1 font-body">Passwords do not match</p>
                )}
              </div>
            ))}

            <button type="submit" disabled={saving || !form.currentPassword || !form.newPassword}
              className="btn-harvest w-full justify-center py-3 disabled:opacity-50">
              {saving ? 'Updating & Signing Out…' : <><MdLock size={18} /> Update Password & Sign Out</>}
            </button>
          </div>
        )}

        {/* ══ LANGUAGE TAB ══ */}
        {tab === 'language' && (
          <div className="max-w-md card space-y-6">
            <h2 className="text-xl font-display font-semibold text-earth-800 flex items-center gap-2">
              <MdLanguage className="text-leaf-500" /> {t('language')}
            </h2>
            <p className="text-sm font-body text-earth-500">Choose your preferred language for the AgriConnect platform.</p>
            <div className="grid grid-cols-2 gap-4">
              {[
                { code: 'en', name: 'English', flag: '🇬🇧', native: 'English' },
                { code: 'ne', name: 'Nepali', flag: '🇳🇵', native: 'नेपाली' },
              ].map(l => (
                <button key={l.code} type="button" onClick={() => setLang(l.code)}
                  className={`flex flex-col items-center gap-3 p-5 rounded-2xl border-2 transition-all
                    ${lang === l.code ? 'border-leaf-400 bg-leaf-50 shadow-glow' : 'border-earth-200 hover:border-earth-300 bg-white'}`}>
                  <span className="text-4xl">{l.flag}</span>
                  <div className="text-center">
                    <div className={`font-display font-bold text-base ${lang === l.code ? 'text-leaf-700' : 'text-earth-700'}`}>{l.native}</div>
                    <div className="text-xs text-earth-400 font-body">{l.name}</div>
                  </div>
                  {lang === l.code && <span className="badge-green text-xs">✓ Active</span>}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* ══ ACTIVITY TAB ══ */}
        {tab === 'activity' && (
          <div className="space-y-4">
            <div className="grid sm:grid-cols-3 gap-4">
              {[
                { Icon: MdInventory, label: user?.role === 'Farmer' ? 'Listed Products' : 'Total Orders', value: user?.role === 'Farmer' ? stats.products : stats.orders, color: 'text-leaf-600', bg: 'bg-leaf-50' },
                { Icon: MdShoppingBag, label: 'Total Orders', value: stats.orders, color: 'text-harvest-600', bg: 'bg-harvest-50' },
                { Icon: GiWheat, label: user?.role === 'Farmer' ? 'Paid Revenue' : 'Total Spent', value: npr(stats.revenue), color: 'text-earth-700', bg: 'bg-earth-100' },
              ].map(s => (
                <div key={s.label} className={`card text-center ${s.bg}`}>
                  <s.Icon size={32} className={`mx-auto mb-3 ${s.color}`} />
                  <div className={`text-2xl font-display font-bold ${s.color}`}>{s.value}</div>
                  <div className="text-sm text-earth-500 mt-1 font-body">{s.label}</div>
                </div>
              ))}
            </div>
            <div className="card">
              <h3 className="font-display font-semibold text-earth-800 mb-3">Account Info</h3>
              <div className="grid sm:grid-cols-2 gap-3 text-sm font-body">
                {[
                  [<MdEmail size={14} className="text-leaf-500" />, user?.email],
                  [<MdPhone size={14} className="text-leaf-500" />, user?.phone || 'No phone'],
                  [<GiFarmer size={14} className="text-leaf-500" />, `Role: ${user?.role}`],
                  ['📍', user?.location?.city || 'Location not set'],
                ].map(([icon, val], i) => (
                  <div key={i} className="flex items-center gap-2 text-earth-600 bg-earth-50 px-3 py-2 rounded-xl">
                    {icon}<span>{val}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

      </form>

      {/* ══ DANGER ZONE TAB (outside form — no submit needed) ══ */}
      {tab === 'danger' && (
        <div className="max-w-lg space-y-5">
          {/* Section header */}
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-red-100 flex items-center justify-center">
              <MdWarning size={22} className="text-red-500" />
            </div>
            <div>
              <h2 className="text-xl font-display font-bold text-red-700">Delete Account</h2>
              <p className="text-sm font-body text-earth-500">Irreversible actions — proceed with extreme caution</p>
            </div>
          </div>

          {/* Delete account card */}
          <div className="rounded-2xl border-2 border-red-200 overflow-hidden">
            <div className="bg-red-50 px-5 py-4">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h3 className="font-display font-bold text-red-800 text-base flex items-center gap-2">
                    <MdDeleteForever size={20} /> Delete Account Permanently
                  </h3>
                  <p className="text-sm font-body text-red-700 mt-1">
                    Once you delete your account, there is no going back. All your data will be permanently erased.
                  </p>
                </div>
              </div>
            </div>

            {/* What will be deleted */}
            <div className="bg-white px-5 py-4">
              <p className="text-xs font-body font-bold text-earth-500 uppercase tracking-wider mb-3">What will be deleted:</p>
              <div className="grid sm:grid-cols-2 gap-2 mb-4">
                {[
                  ['Profile & personal data'],
                  ...(user?.role === 'Farmer'
                    ? [['All product listings'],
                    ['Sales & order records']]
                    : [['Cart & order history'],
                    ['Purchase records']]
                  ),
                  ['Chats & messages'],
                  ['Notifications'],
                  ['Reviews submitted'],
                ].map(([icon, text], i) => (
                  <div key={i} className="flex items-center gap-2 text-sm font-body text-earth-600">
                    <span>{icon}</span> {text}
                  </div>
                ))}
              </div>

              <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-xs font-body text-amber-700 flex items-start gap-2 mb-4">
                <MdWarning size={14} className="shrink-0 mt-0.5" />
                <span>This action is <strong>irreversible</strong>. You will be logged out immediately and your account cannot be recovered.</span>
              </div>

              <button
                type="button"
                onClick={() => setShowDeleteModal(true)}
                className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-red-600 hover:bg-red-700 active:bg-red-800 text-white font-body font-bold text-sm transition-colors"
              >
                <MdDeleteForever size={18} />
                Delete My Account
              </button>
            </div>
          </div>

          {/* Logout option */}
          <div className="card flex items-center justify-between gap-4">
            <div>
              <h3 className="font-body font-semibold text-earth-800 text-sm">Sign Out</h3>
              <p className="text-xs text-earth-400 font-body mt-0.5">Log out of your account on this device</p>
            </div>
            <button
              type="button"
              onClick={() => { logout(); navigate('/auth'); }}
              className="px-5 py-2.5 rounded-xl border-2 border-earth-200 text-sm font-body font-medium text-earth-600 hover:border-earth-400 hover:bg-earth-50 transition-all shrink-0"
            >
              Sign Out
            </button>
          </div>
        </div>
      )}

      {/* ── Delete confirmation modal ── */}
      {showDeleteModal && (
        <DeleteAccountModal
          user={user}
          onClose={() => setShowDeleteModal(false)}
          onDeleted={handleAccountDeleted}
        />
      )}
    </div>
  );
}
