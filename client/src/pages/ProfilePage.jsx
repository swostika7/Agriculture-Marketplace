import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { MdPerson, MdPhone, MdEmail, MdCalendarToday, MdShoppingBag, MdLock, MdSave, MdVisibility, MdVisibilityOff, MdInventory, MdLanguage } from 'react-icons/md';
import { GiWheat, GiFarmer } from 'react-icons/gi';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import { ordersAPI, productsAPI } from '../utils/api';
import LocationPicker from '../components/LocationPicker';
import ImageUploader from '../components/ImageUploader';
import { npr } from '../utils/currency';

export default function ProfilePage() {
  const { user, updateProfile, logout } = useAuth();

  const isGoogleNoPassword = user?.authProvider === 'google' && !user?.hasPassword;
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

      if (result.passwordChanged && !isGoogleNoPassword) {
        // Changing an existing password invalidates any session
        setMsg({ type: 'success', text: '✅  ' + result.message + ' Signing you out for security…' });
        setTimeout(() => { logout(); navigate('/auth'); }, 2000);
      } else if (result.passwordChanged) {
        // Setting a FIRST password (no prior password existed) isn't
        setMsg({ type: 'success', text: '✅  ' + result.message });
        setForm(p => ({ ...p, currentPassword: '', newPassword: '', confirmPassword: '' }));
      } else {
        setMsg({ type: 'success', text: '✅  Profile saved!' });
        setForm(p => ({ ...p, currentPassword: '', newPassword: '', confirmPassword: '' }));
      }
    } catch (err) {
      setMsg({ type: 'error', text: err.response?.data?.message || 'Save failed.' });
    } finally { setSaving(false); }
  };

  const roleCls = { Farmer: 'badge-green', Consumer: 'badge-blue', Admin: 'badge-red' };

  const TABS = [
    { id: 'info', Icon: MdPerson, label: t('personalInfo') },
    { id: 'security', Icon: MdLock, label: t('security') },
    { id: 'language', Icon: MdLanguage, label: t('language') },
    { id: 'activity', Icon: MdShoppingBag, label: t('activity') },
  ];

  return (
    <div className="max-w-4xl mx-auto space-y-6 animate-fade-in">

      {/* Hero banner */}
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

      {/* Tabs */}
      <div className="flex gap-2 bg-earth-50 p-1 rounded-2xl border border-earth-100 w-fit">
        {TABS.map(({ id, Icon, label }) => (
          <button key={id} onClick={() => setTab(id)}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-body font-medium transition-all
              ${tab === id ? 'bg-white text-leaf-700 shadow-sm' : 'text-earth-500 hover:text-earth-700'}`}>
            <Icon size={16} />{label}
          </button>
        ))}
      </div>

      {msg && (
        <div className={`p-4 rounded-xl border font-body text-sm animate-slide-up
          ${msg.type === 'success' ? 'bg-leaf-50 border-leaf-200 text-leaf-700' : 'bg-red-50 border-red-200 text-red-600'}`}>
          {msg.text}
        </div>
      )}

      <form onSubmit={saveProfile}>
        {/* Info Tab */}
        {tab === 'info' && (
          <div className="grid lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 card space-y-5">
              <h2 className="text-xl font-display font-semibold text-earth-800">Personal Information</h2>

              {/* Avatar upload from device */}
              <ImageUploader
                label="Profile Photo (upload from your device)"
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

        {/* Security Tab */}
        {tab === 'security' && (
          <div className="max-w-md card space-y-5">
            <h2 className="text-xl font-display font-semibold text-earth-800 flex items-center gap-2">
              <MdLock className="text-leaf-500" /> {isGoogleNoPassword ? 'Set a Password' : 'Change Password'}
            </h2>
            {isGoogleNoPassword ? (
              <div className="p-4 bg-blue-50 border border-blue-200 rounded-xl text-sm font-body text-blue-700 flex items-start gap-2">
                ℹ️ <span>Your account currently uses Google Sign-In only. Set a password below to also enable signing in with your email — no current password needed since you don't have one yet.</span>
              </div>
            ) : (
              <div className="p-4 bg-harvest-50 border border-harvest-200 rounded-xl text-sm font-body text-harvest-700 flex items-start gap-2">
                ⚠️ <span>Changing your password will automatically sign you out for security. You'll be redirected to the sign-in page.</span>
              </div>
            )}

            {[
              { key: 'currentPassword', label: 'Current Password', Icon: MdLock, showKey: 'current' },
              { key: 'newPassword', label: 'New Password', Icon: MdLock, showKey: 'next' },
              { key: 'confirmPassword', label: 'Confirm New Password', Icon: MdLock, showKey: 'confirm' },
            ]
              // Google-only accounts have nothing to verify a "current password" against yet
              .filter(f => !(isGoogleNoPassword && f.key === 'currentPassword'))
              .map(({ key, label, Icon, showKey }) => (
                <div key={key}>
                  <label className="label flex items-center gap-1"><Icon size={14} />{label}</label>
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

            <button type="submit" disabled={saving || !form.newPassword || (!isGoogleNoPassword && !form.currentPassword)}
              className="btn-harvest w-full justify-center py-3 disabled:opacity-50">
              {saving ? 'Saving…' : <><MdLock size={18} /> {isGoogleNoPassword ? 'Set Password' : 'Update Password & Sign Out'}</>}
            </button>
            {isGoogleNoPassword && (
              <p className="text-xs text-earth-400 font-body text-center">You'll stay signed in — this only signs you out when changing an existing password.</p>
            )}
          </div>
        )}

        {/* Activity Tab */}
        {/* Language Tab */}
        {tab === 'language' && (
          <div className="max-w-md card space-y-6">
            <h2 className="text-xl font-display font-semibold text-earth-800 flex items-center gap-2">
              <MdLanguage className="text-leaf-500" /> {t('language')}
            </h2>
            <p className="text-sm font-body text-earth-500">
              Choose your preferred language for the AgriConnect platform.
            </p>
            <div className="grid grid-cols-2 gap-4">
              {[
                { code: 'en', name: 'English', flag: '🇬🇧', native: 'English' },
                { code: 'ne', name: 'Nepali', flag: '🇳🇵', native: 'नेपाली' },
              ].map(l => (
                <button key={l.code} onClick={() => setLang(l.code)}
                  className={`flex flex-col items-center gap-3 p-5 rounded-2xl border-2 transition-all
                    ${lang === l.code
                      ? 'border-leaf-400 bg-leaf-50 shadow-glow'
                      : 'border-earth-200 hover:border-earth-300 bg-white'}`}>
                  <span className="text-4xl">{l.flag}</span>
                  <div className="text-center">
                    <div className={`font-display font-bold text-base ${lang === l.code ? 'text-leaf-700' : 'text-earth-700'}`}>{l.native}</div>
                    <div className="text-xs text-earth-400 font-body">{l.name}</div>
                  </div>
                  {lang === l.code && (
                    <span className="badge-green text-xs">✓ Active</span>
                  )}
                </button>
              ))}
            </div>
            <div className="p-4 bg-earth-50 border border-earth-200 rounded-xl text-sm font-body text-earth-500">
              Language changes apply immediately across the entire platform.
            </div>
          </div>
        )}

        {tab === 'activity' && (
          <div className="space-y-4">
            <div className="grid sm:grid-cols-3 gap-4">
              {[
                { Icon: MdInventory, label: user?.role === 'Farmer' ? 'Listed Products' : 'Total Orders', value: user?.role === 'Farmer' ? stats.products : stats.orders, color: 'text-leaf-600', bg: 'bg-leaf-50' },
                { Icon: MdShoppingBag, label: 'Total Orders', value: stats.orders, color: 'text-harvest-600', bg: 'bg-harvest-50' },
                { Icon: GiWheat, label: user?.role === 'Farmer' ? 'Paid Revenue' : 'Total Spent', value: npr(stats.revenue), color: 'text-earth-700', bg: 'bg-earth-100' },
              ].map(s => (
                <div key={s.label} className={`card-hover text-center ${s.bg}`}>
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
                  ['', user?.location?.city || 'Location not set'],
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
    </div>
  );
}
