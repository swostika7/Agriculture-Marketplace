import React, { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import {
  MdArrowForward, MdLocationOn, MdChat, MdRoute,
  MdBarChart, MdLocalOffer, MdDeliveryDining, MdVerified,
  MdNotifications, MdStar
} from 'react-icons/md';
import { GiWheat, GiFarmer, GiFruitBowl } from 'react-icons/gi';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';

/* ── Scroll reveal hook ── */
function useReveal() {
  const ref = useRef(null);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const obs = new IntersectionObserver(
      ([e]) => { if (e.isIntersecting) { setVisible(true); obs.disconnect(); } },
      { threshold: 0.15 }
    );
    if (ref.current) obs.observe(ref.current);
    return () => obs.disconnect();
  }, []);
  return [ref, visible];
}

/* ── Animated counter ── */
function Counter({ end, suffix = '' }) {
  const ref = useRef(null);
  const done = useRef(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(([e]) => {
      if (e.isIntersecting && !done.current) {
        done.current = true;
        const s = performance.now(), dur = 1800;
        const go = now => {
          const p = Math.min((now - s) / dur, 1);
          const eased = 1 - Math.pow(1 - p, 3);
          el.textContent = Math.floor(eased * end).toLocaleString() + suffix;
          if (p < 1) requestAnimationFrame(go);
        };
        requestAnimationFrame(go);
      }
    }, { threshold: 0.5 });
    obs.observe(el);
    return () => obs.disconnect();
  }, [end, suffix]);
  return <span ref={ref}>0{suffix}</span>;
}

/* ── Feature card ── */
function FeatureCard({ icon, title, desc, accent, delay = 0 }) {
  const [ref, visible] = useReveal();
  return (
    <div ref={ref}
      className="group relative bg-white rounded-3xl p-7 border border-earth-100 hover:border-leaf-200
        hover:-translate-y-1 transition-all duration-500 overflow-hidden"
      style={{
        boxShadow: '0 4px 24px rgba(42,143,42,0.07)',
        opacity: visible ? 1 : 0,
        transform: visible ? 'translateY(0)' : 'translateY(28px)',
        transition: `opacity 0.6s ease ${delay}ms, transform 0.6s ease ${delay}ms, box-shadow 0.3s ease, border-color 0.3s ease`,
      }}>
      {/* Hover glow blob */}
      <div className={`absolute -top-8 -right-8 w-32 h-32 rounded-full blur-2xl opacity-0 group-hover:opacity-30 transition-opacity duration-500 ${accent}`} />
      <div className="relative">
        <div className="text-3xl mb-4">{icon}</div>
        <h3 className="font-display font-bold text-earth-800 text-lg mb-2 leading-snug">{title}</h3>
        <p className="text-earth-500 text-sm leading-relaxed font-body">{desc}</p>
      </div>
    </div>
  );
}

/* ── Step ── */
function Step({ n, title, desc, color, delay = 0 }) {
  const [ref, visible] = useReveal();
  return (
    <div ref={ref} className="flex gap-5 items-start"
      style={{
        opacity: visible ? 1 : 0,
        transform: visible ? 'translateX(0)' : 'translateX(-24px)',
        transition: `opacity 0.5s ease ${delay}ms, transform 0.5s ease ${delay}ms`,
      }}>
      <div className={`w-11 h-11 ${color} rounded-2xl flex items-center justify-center text-white font-display font-bold text-lg shrink-0 shadow-sm`}>
        {n}
      </div>
      <div className="pt-0.5">
        <h4 className="font-display font-bold text-earth-800 text-base mb-1">{title}</h4>
        <p className="text-earth-500 text-sm font-body leading-relaxed">{desc}</p>
      </div>
    </div>
  );
}

/* ── Testimonial card (needs own component so hook runs at top level) ── */
function TestiCard({ init, name, role, quote, delay = 0 }) {
  const [ref, vis] = useReveal();
  return (
    <div ref={ref}
      className="bg-white rounded-3xl p-7 border border-earth-100 hover:border-leaf-200
        transition-all duration-300"
      style={{
        boxShadow: '0 4px 24px rgba(42,143,42,0.07)',
        opacity: vis ? 1 : 0,
        transform: vis ? 'translateY(0)' : 'translateY(24px)',
        transition: `opacity 0.5s ease ${delay}ms, transform 0.5s ease ${delay}ms, box-shadow 0.3s`,
      }}>
      <div className="flex gap-0.5 text-harvest-400 mb-4">
        {[0, 1, 2, 3, 4].map(j => <MdStar key={j} size={16} />)}
      </div>
      <p className="text-earth-600 text-sm leading-relaxed italic font-body mb-5">"{quote}"</p>
      <div className="flex items-center gap-3 pt-4 border-t border-earth-100">
        <div className="w-10 h-10 rounded-full bg-gradient-to-br from-leaf-300 to-leaf-600
          flex items-center justify-center text-white font-bold text-sm">
          {init}
        </div>
        <div>
          <p className="font-semibold text-earth-800 text-sm">{name}</p>
          <p className="text-earth-400 text-xs font-body">{role}</p>
        </div>
        <MdVerified size={16} className="text-leaf-400 ml-auto" />
      </div>
    </div>
  );
}

export default function LandingPage() {
  const { user } = useAuth();
  const { lang, setLang } = useLanguage();
  const [scrolled, setScrolled] = useState(false);
  const ne = lang === 'ne';

  useEffect(() => {
    const h = () => setScrolled(window.scrollY > 40);
    window.addEventListener('scroll', h);
    return () => window.removeEventListener('scroll', h);
  }, []);

  const features = [
    {
      icon: '🌾',
      title: ne ? 'किसानसँग सिधा जोडिनुस्' : 'Connect Direct with Farmers',
      desc: ne ? 'बिचौलिया बिना — किसानबाट सिधा ताजा उत्पादन। उचित मूल्य, दुवैका लागि।'
        : 'No middlemen — fresh produce straight from the source. Fair prices for both sides.',
      accent: 'bg-leaf-400',
    },
    {
      icon: '🏷️',
      title: ne ? 'सेल मूल्य प्रणाली' : 'Sale Price System',
      desc: ne ? 'किसानले नियमित र छुट मूल्य राख्न सक्छन् — उत्पादन SALE ब्याजसहित देखिन्छ।'
        : 'Farmers set regular and discount prices — products appear with SALE badge and % off.',
      accent: 'bg-red-400',
    },
    {
      icon: '🗺️',
      title: ne ? 'GPS नेभिगेसन' : 'Real GPS Navigation',
      desc: ne ? 'OSRM बाट वास्तविक सडक मार्ग — हिड्दा वा गाडीमा। Google Maps मा खोल्नुस्।'
        : 'Real road routes via OSRM — walking or driving. Exact coordinates, open in Google Maps.',
      accent: 'bg-blue-400',
    },
    {
      icon: '💬',
      title: ne ? 'रियल-टाइम च्याट' : 'Live Farmer Chat',
      desc: ne ? 'किसान र उपभोक्ताबीच सिधा सन्देश — नयाँ सन्देशमा तुरन्त सूचना।'
        : 'Direct messaging between farmers and consumers with instant badge notifications.',
      accent: 'bg-purple-400',
    },
    {
      icon: '📦',
      title: ne ? 'अर्डर ट्र्याकिङ' : 'Live Order Tracking',
      desc: ne ? 'खेतबाट घरसम्म — अर्डरको हरेक चरणमा रियल-टाइम अपडेट।'
        : 'From farm to door — real-time updates at every stage of your delivery.',
      accent: 'bg-orange-400',
    },
    {
      icon: '📊',
      title: ne ? 'बिक्री विश्लेषण' : 'Sales Analytics',
      desc: ne ? 'किसान र उपभोक्ता दुवैका लागि ट्रेन्ड ग्राफ र बजार अन्तर्दृष्टि।'
        : 'Trend charts and market insights for both farmers and consumers.',
      accent: 'bg-harvest-400',
    },
  ];

  return (
    <div className="min-h-screen bg-white font-body overflow-x-hidden">

      {/* ══ NAVBAR ══ */}
      <nav className={`fixed top-0 inset-x-0 z-50 transition-all duration-400
        ${scrolled ? 'bg-white/96 backdrop-blur-xl shadow-sm border-b border-earth-100' : ''}`}>
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2.5 hover:opacity-80 transition-opacity">
            <div className="w-9 h-9 bg-gradient-to-br from-leaf-500 to-leaf-800 rounded-xl flex items-center justify-center shadow-md">
              <GiWheat size={20} className="text-white" />
            </div>
            <div>
              <span className="font-display font-bold text-xl text-leaf-700 leading-none block">AgriConnect</span>
              <span className="text-[10px] text-earth-400 font-body tracking-wide">स्मार्ट कृषि बजार</span>
            </div>
          </Link>

          <div className="flex items-center gap-3">
            <div className="flex items-center bg-earth-100/80 rounded-xl p-1 gap-0.5">
              {[{ code: 'en', flag: '🇬🇧', label: 'EN' }, { code: 'ne', flag: '🇳🇵', label: 'NE' }].map(l => (
                <button key={l.code} onClick={() => setLang(l.code)}
                  className={`flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium transition-all
                    ${lang === l.code ? 'bg-white text-leaf-700 shadow-sm' : 'text-earth-500 hover:text-earth-700'}`}>
                  {l.flag} {l.label}
                </button>
              ))}
            </div>
            {user ? (
              <Link to="/dashboard" className="btn-primary text-sm py-2 px-5 flex items-center gap-1.5">
                {ne ? 'ड्यासबोर्ड' : 'Dashboard'} <MdArrowForward size={15} />
              </Link>
            ) : (
              <>
                <Link to="/auth" className="hidden sm:inline-flex btn-secondary text-sm py-2 px-4">
                  {ne ? 'साइन इन' : 'Sign In'}
                </Link>
                <Link to="/auth" className="btn-primary text-sm py-2 px-4">
                  {ne ? 'सुरु गर्नुहोस्' : 'Get Started'}
                </Link>
              </>
            )}
          </div>
        </div>
      </nav>

      {/* ══ HERO ══ */}
      <section className="relative min-h-screen flex items-center overflow-hidden">
        {/* Layered background */}
        <div className="absolute inset-0 bg-gradient-to-br from-leaf-900 via-leaf-800 to-leaf-700" />
        <div className="absolute inset-0 bg-field-pattern opacity-[0.06]" />
        {/* Glowing orbs */}
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-leaf-400/20 rounded-full blur-3xl animate-pulse-slow" />
        <div className="absolute bottom-1/4 right-1/4 w-80 h-80 bg-harvest-400/15 rounded-full blur-3xl animate-pulse-slow" style={{ animationDelay: '1.5s' }} />
        {/* Nepal red stripe top */}
        <div className="absolute top-0 inset-x-0 h-1 bg-gradient-to-r from-red-600 via-red-500 to-red-600" />

        <div className="relative max-w-6xl mx-auto px-6 w-full pt-24 pb-20">
          <div className="grid lg:grid-cols-2 gap-16 items-center">

            {/* Left: text */}
            <div className="animate-fade-in">
              <div className="inline-flex items-center gap-2 mb-7 text-xs py-1.5 px-4
                bg-white/10 border border-white/20 text-white/90 rounded-full backdrop-blur-sm">
                🇳🇵 {ne ? 'नेपालको #१ स्मार्ट कृषि बजार' : "Nepal's #1 Smart Agriculture Marketplace"}
              </div>

              <h1 className="font-display font-extrabold text-white leading-[1.05] mb-6"
                style={{ fontSize: 'clamp(2.8rem,5vw,4.2rem)' }}>
                {ne ? (
                  <>खेतबाट सिधा<br />
                    <span style={{
                      background: 'linear-gradient(135deg,#a5dea5,#ffc000,#6ec86e)',
                      WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
                    }}>तपाईंको थालमा</span>
                  </>
                ) : (
                  <>Farm Fresh,<br />
                    <span style={{
                      background: 'linear-gradient(135deg,#a5dea5,#ffc000,#6ec86e)',
                      WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
                    }}>Direct to You</span>
                  </>
                )}
              </h1>

              <p className="text-white/70 text-lg leading-relaxed mb-10 max-w-md font-body">
                {ne
                  ? 'नेपालका किसानहरूलाई सहरका उपभोक्ताहरूसँग जोड्दै — ताजा उत्पादन, उचित मूल्य, कुनै बिचौलिया छैन।'
                  : "Connecting Nepal's farmers directly with consumers — fresh produce, fair prices, zero middlemen."}
              </p>

              <div className="flex flex-col sm:flex-row gap-4 mb-12">
                <Link to="/auth"
                  className="group flex items-center justify-center gap-2.5 px-8 py-4 bg-white text-leaf-800
                    font-body font-semibold rounded-2xl text-base hover:bg-leaf-50
                    transition-all duration-200 shadow-payment hover:shadow-glow active:scale-95">
                  <GiFarmer size={22} className="text-leaf-600" />
                  {ne ? 'किसानको रूपमा जोइन्' : 'Join as Farmer'}
                  <MdArrowForward size={16} className="group-hover:translate-x-1 transition-transform" />
                </Link>
                <Link to="/auth"
                  className="flex items-center justify-center gap-2.5 px-8 py-4
                    bg-white/12 border border-white/25 text-white font-body font-semibold
                    rounded-2xl text-base hover:bg-white/20 transition-all duration-200 active:scale-95
                    backdrop-blur-sm">
                  <GiFruitBowl size={22} className="text-harvest-300" />
                  {ne ? 'ताजा उत्पादन किन्नुस्' : 'Shop Fresh Produce'}
                </Link>
              </div>

              {/* Trust badges */}
              <div className="flex flex-wrap items-center gap-4">
                {[
                  { icon: '✓', text: ne ? 'निःशुल्क दर्ता' : 'Free to join' },
                  { icon: '✓', text: ne ? 'सटीक GPS मार्ग' : 'Real GPS routes' },
                  { icon: '✓', text: ne ? 'सिधा च्याट' : 'Live farmer chat' },
                ].map(b => (
                  <div key={b.text} className="flex items-center gap-1.5 text-white/60 text-sm font-body">
                    <span className="text-leaf-300 font-bold">{b.icon}</span> {b.text}
                  </div>
                ))}
              </div>
            </div>

            {/* Right: product card mockup */}
            <div className="hidden lg:flex justify-center items-center animate-slide-up">
              <div className="relative w-full max-w-[340px]">
                {/* Glow ring */}
                <div className="absolute inset-0 rounded-3xl bg-leaf-400/20 blur-xl scale-105" />

                {/* Main card */}
                <div className="relative bg-white rounded-3xl shadow-payment p-6 border border-white/60">
                  {/* Header */}
                  <div className="flex items-center justify-between mb-5 pb-4 border-b border-earth-100">
                    <div className="flex items-center gap-2.5">
                      <div className="w-9 h-9 bg-gradient-to-br from-leaf-400 to-leaf-700 rounded-xl flex items-center justify-center">
                        <GiWheat size={18} className="text-white" />
                      </div>
                      <div>
                        <p className="font-display font-bold text-earth-800 text-sm">AgriConnect</p>
                        <p className="text-[10px] text-leaf-500 flex items-center gap-1">
                          <span className="w-1.5 h-1.5 bg-leaf-400 rounded-full animate-pulse inline-block" />
                          {ne ? 'लाइभ बजार' : 'Live Market'}
                        </p>
                      </div>
                    </div>
                    {/* Notification badge on chat */}
                    <div className="relative p-2 bg-leaf-50 rounded-xl">
                      <MdChat size={18} className="text-leaf-500" />
                      <span className="absolute -top-1 -right-1 w-4 h-4 bg-leaf-500 text-white text-[9px] font-bold rounded-full flex items-center justify-center">2</span>
                    </div>
                  </div>

                  {/* Products */}
                  {[
                    { e: '🥬', name: ne ? 'जैविक पालक' : 'Organic Spinach', loc: 'Pokhara', reg: 80, sale: 60, hasSale: true },
                    { e: '🥭', name: ne ? 'अल्फान्सो आँप' : 'Alphonso Mango', loc: 'Chitwan', reg: 200, sale: null, hasSale: false },
                    { e: '🥛', name: ne ? 'ताजा दूध' : 'Fresh Buffalo Milk', loc: 'Dharan', reg: 120, sale: null, hasSale: false },
                  ].map((p, i) => (
                    <div key={i} className="flex items-center gap-3 py-2.5 border-b border-earth-50 last:border-0">
                      <span className="text-2xl">{p.e}</span>
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-earth-800 text-sm font-body truncate">{p.name}</p>
                        <p className="text-[10px] text-earth-400 flex items-center gap-0.5">
                          <MdLocationOn size={9} />{p.loc}
                        </p>
                      </div>
                      <div className="text-right">
                        {p.hasSale ? (
                          <>
                            <div className="flex items-center gap-1 justify-end">
                              <span className="badge bg-red-500 text-white text-[9px] py-0 px-1.5 animate-pulse">SALE</span>
                              <span className="text-xs font-bold text-red-600 font-mono">Rs.{p.sale}</span>
                            </div>
                            <p className="text-[10px] line-through text-earth-400 font-mono">Rs.{p.reg}</p>
                          </>
                        ) : (
                          <span className="text-xs font-bold text-leaf-700 font-mono">Rs.{p.reg}</span>
                        )}
                      </div>
                    </div>
                  ))}

                  {/* Route preview strip */}
                  <div className="mt-4 p-3 bg-blue-50 rounded-xl flex items-center gap-2.5 border border-blue-100">
                    <MdRoute size={16} className="text-blue-500 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-[10px] font-body font-semibold text-blue-700">GPS Navigation Ready</p>
                      <p className="text-[10px] text-blue-500 font-body">🚗 Driving · 🚶 Walking</p>
                    </div>
                    <span className="text-[10px] bg-blue-100 text-blue-600 px-2 py-0.5 rounded-full font-body font-medium">OSRM</span>
                  </div>
                </div>

                {/* Floating: Nepal badge */}
                <div className="absolute -top-5 -right-5 bg-red-600 text-white rounded-2xl px-4 py-2.5 shadow-payment z-10 text-center">
                  <div className="text-xl">🇳🇵</div>
                  <div className="text-[10px] font-bold mt-0.5">{ne ? 'नेपाली' : 'Nepal'}</div>
                </div>

                {/* Floating: chat notification */}
                <div className="absolute -bottom-5 -left-5 bg-white border border-earth-200 rounded-2xl px-4 py-3 shadow-payment z-10">
                  <div className="flex items-center gap-2">
                    <div className="relative">
                      <MdNotifications size={18} className="text-harvest-500" />
                      <span className="absolute -top-1 -right-1 w-3 h-3 bg-red-500 rounded-full" />
                    </div>
                    <div>
                      <p className="text-[10px] font-bold text-earth-800">{ne ? 'नयाँ अर्डर!' : 'New Order!'}</p>
                      <p className="text-[9px] text-earth-400">{ne ? '2 kg पालक' : '2 kg Spinach'}</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Wave transition */}
        <div className="absolute bottom-0 inset-x-0">
          <svg viewBox="0 0 1440 80" fill="none" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="none">
            <path d="M0 80L48 69.3C96 58.7 192 37.3 288 32C384 26.7 480 37.3 576 48C672 58.7 768 69.3 864 69.3C960 69.3 1056 58.7 1152 48C1248 37.3 1344 26.7 1392 21.3L1440 16V80H0Z" fill="white" />
          </svg>
        </div>
      </section>

      {/* ══ STATS STRIP ══ */}
      {/* <section className="py-12 bg-white border-b border-earth-100">
        <div className="max-w-5xl mx-auto px-6">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
            {[
              { end: ne ? '२४००' : '2400', suffix: '+', label: ne ? 'सक्रिय किसानहरू' : 'Active Farmers', sub: '🌾' },
              { end: ne ? '१८०००' : '18000', suffix: '+', label: ne ? 'खुसी उपभोक्ताहरू' : 'Happy Consumers', sub: '😊' },
              { end: ne ? '४७' : '47', suffix: '+', label: ne ? 'जिल्लाहरूमा' : 'Districts Covered', sub: '📍' },
              { end: ne ? '९८' : '98', suffix: '%', label: ne ? 'डेलिभरी सफलता' : 'Delivery Success Rate', sub: '✅' },
            ].map(({ end, suffix, label, sub }) => (
              <div key={label} className="text-center group">
                <div className="text-2xl mb-1">{sub}</div>
                <div className="text-3xl md:text-4xl font-display font-extrabold text-leaf-700">
                  <Counter end={end} suffix={suffix} />
                </div>
                <div className="text-xs text-earth-500 mt-1 font-body">{label}</div>
              </div>
            ))}
          </div>
        </div>
      </section> */}

      {/* ══ FEATURES ══ */}
      <section className="py-24 px-6 bg-gradient-to-b from-white to-earth-50">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-16">
            <div className="inline-flex items-center gap-2 mb-4 text-xs py-1.5 px-4 bg-leaf-50 text-leaf-700 rounded-full border border-leaf-200 font-body">
              {ne ? 'नेपालका लागि बनाइएको' : 'Built for Nepal'}
            </div>
            <h2 className="font-display font-extrabold text-earth-800 mb-4 leading-tight"
              style={{ fontSize: 'clamp(2rem,4vw,3rem)' }}>
              {ne ? 'एउटै मञ्चमा सबै कुरा' : 'Everything You Need'}
            </h2>
            <p className="text-earth-500 max-w-xl mx-auto font-body text-base">
              {ne
                ? 'किसान र उपभोक्ता दुवैका लागि — ताजा बजार, स्मार्ट उपकरण।'
                : 'From listing fresh produce to delivering it — every tool you need, in one place.'}
            </p>
          </div>

          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {features.map((f, i) => (
              <FeatureCard key={f.title} {...f} delay={i * 80} />
            ))}
          </div>
        </div>
      </section>

      {/* ══ HOW IT WORKS ══ */}
      <section className="py-24 px-6 bg-earth-50">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-16">
            <div className="inline-flex items-center gap-2 mb-4 text-xs py-1.5 px-4 bg-earth-100 text-earth-600 rounded-full font-body">
              ⚡ {ne ? 'सरल प्रक्रिया' : 'Simple Process'}
            </div>
            <h2 className="font-display font-extrabold text-earth-800 leading-tight mb-4"
              style={{ fontSize: 'clamp(2rem,4vw,3rem)' }}>
              {ne ? 'कसरी काम गर्छ?' : 'How It Works'}
            </h2>
          </div>

          <div className="grid md:grid-cols-2 gap-14">
            {/* Farmer */}
            <div className="bg-white rounded-3xl p-8 border border-earth-100 shadow-card">
              <div className="flex items-center gap-3 mb-8">
                <div className="w-11 h-11 bg-leaf-500 rounded-2xl flex items-center justify-center text-white text-xl shadow-sm">
                  <GiFarmer size={24} />
                </div>
                <div>
                  <p className="font-display font-bold text-earth-800 text-lg">{ne ? 'किसानका लागि' : 'For Farmers'}</p>
                  <p className="text-xs text-earth-400 font-body">{ne ? 'बेच्नुस् र कमाउनुस्' : 'List, sell, and earn'}</p>
                </div>
              </div>
              <div className="space-y-6">
                <Step n={ne ? '१' : '1'} color="bg-leaf-500" delay={0}
                  title={ne ? 'प्रोफाइल बनाउनुस्' : 'Create Your Profile'}
                  desc={ne ? 'दर्ता गरी खेतको GPS स्थान राख्नुस् — मिनेटमा तयार।' : 'Register and pin your exact farm GPS location on the map.'} />
                <Step n={ne ? '२' : '2'} color="bg-leaf-500" delay={80}
                  title={ne ? 'उत्पादन सूचीकृत गर्नुस्' : 'List Your Produce'}
                  desc={ne ? 'नियमित र छुट मूल्य राख्नुस् — SALE ब्याज स्वतः।' : 'Set regular and sale prices — SALE badge applies automatically.'} />
                <Step n={ne ? '३' : '3'} color="bg-leaf-500" delay={160}
                  title={ne ? 'अर्डर व्यवस्थापन' : 'Manage Orders'}
                  desc={ne ? 'च्याट, अर्डर र डेलिभरी — एकै ठाउँबाट।' : 'Chat with buyers, manage orders, and update delivery status.'} />
                <Step n={ne ? '४' : '4'} color="bg-leaf-500" delay={240}
                  title={ne ? 'भुक्तानी प्राप्त गर्नुस्' : 'Receive Payment'}
                  desc={ne ? 'डिजिटल वा नगद — बिचौलिया बिना सिधा।' : 'Digital or cash on delivery — directly, no middlemen.'} />
              </div>
            </div>

            {/* Consumer */}
            <div className="bg-white rounded-3xl p-8 border border-earth-100 shadow-card">
              <div className="flex items-center gap-3 mb-8">
                <div className="w-11 h-11 bg-harvest-500 rounded-2xl flex items-center justify-center text-white text-xl shadow-sm">
                  <GiFruitBowl size={24} />
                </div>
                <div>
                  <p className="font-display font-bold text-earth-800 text-lg">{ne ? 'उपभोक्ताका लागि' : 'For Consumers'}</p>
                  <p className="text-xs text-earth-400 font-body">{ne ? 'खोज्नुस् र किन्नुस्' : 'Discover and buy fresh'}</p>
                </div>
              </div>
              <div className="space-y-6">
                <Step n={ne ? '१' : '1'} color="bg-harvest-500" delay={0}
                  title={ne ? 'स्थान राख्नुस्' : 'Set Your Location'}
                  desc={ne ? 'दर्ता गरी शहर राख्नुस् — नजिकका खेत पहिले देखिन्छन्।' : 'Register and set your city — nearby farms appear first.'} />
                <Step n={ne ? '२' : '2'} color="bg-harvest-500" delay={80}
                  title={ne ? 'ब्राउज र खोज्नुस्' : 'Browse & Discover'}
                  desc={ne ? 'ताजा उत्पादन, SALE सूचीहरू र नजिकका किसान हेर्नुस्।' : 'Browse fresh produce, find SALE listings, and nearby farmers on a map.'} />
                <Step n={ne ? '३' : '3'} color="bg-harvest-500" delay={160}
                  title={ne ? 'किसानसँग कुरा गर्नुस्' : 'Chat with the Farmer'}
                  desc={ne ? 'उत्पादन, मूल्य वा डेलिभरीबारे सिधा सन्देश।' : 'Message directly about the product, price, or delivery details.'} />
                <Step n={ne ? '४' : '4'} color="bg-harvest-500" delay={240}
                  title={ne ? 'GPS मार्गले घरमा' : 'Delivered to Your Door'}
                  desc={ne ? 'GPS नेभिगेसनसहित ताजा उत्पादन — खेतबाट सिधा।' : 'Track your order with GPS navigation from farm to your door.'} />
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ══ TESTIMONIALS ══ */}
      <section className="py-24 px-6 bg-white">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-14">
            <div className="inline-flex items-center gap-2 mb-4 text-xs py-1.5 px-4 bg-harvest-50 text-harvest-700 rounded-full border border-harvest-200 font-body">
              ⭐ {ne ? 'वास्तविक अनुभव' : 'Real Stories'}
            </div>
            <h2 className="font-display font-extrabold text-earth-800 leading-tight"
              style={{ fontSize: 'clamp(1.8rem,3.5vw,2.6rem)' }}>
              {ne ? 'नेपालभर जीवन बदल्दै' : 'Changing Lives Across Nepal'}
            </h2>
          </div>
          <div className="grid md:grid-cols-3 gap-6">
            {[
              {
                init: 'N',
                name: ne ? 'नन्दनी ठाकुर' : 'Nandani Thakuri',
                role: ne ? 'किसान, पोखरा' : 'Organic Farmer, Pokhara',
                quote: ne ? 'AgriConnect मार्फत काठमाडौंका ग्राहकहरूसँग सिधा जोडिन्छु र ४०% बढी कमाउँछु।'
                  : 'Through AgriConnect I reach Kathmandu consumers directly and earn 40% more from the same harvest.'
              },
              {
                init: 'S',
                name: ne ? 'स्वस्तिका सापकोटा' : 'Swostika Sapkota',
                role: ne ? 'उपभोक्ता, काठमाडौं' : 'Home Consumer, Kathmandu',
                quote: ne ? 'नजिकका खेतबाट ताजा तरकारी एक दिनमा घरमा — सुपरमार्केटभन्दा धेरै राम्रो।'
                  : 'Fresh vegetables from nearby farms at my door in a day — far better than any supermarket.'
              },
              {
                init: 'S',
                name: ne ? 'सीता देवी शर्मा' : 'Sita Devi Sharma', role: ne ? 'डेयरी किसान, चितवन' : 'Dairy Farmer, Chitwan',
                quote: ne ? 'मूल्य प्रणालीले उचित मूल्य बुझ्न मद्दत गर्‍यो। आम्दानी दोब्बर भयो।'
                  : 'The sale pricing system helped me understand fair market value. My income has doubled.'
              },
            ].map((t, i) => (
              <TestiCard key={t.name} {...t} delay={i * 100} />
            ))}
          </div>
        </div>
      </section>

      {/* ══ CTA BANNER ══ */}
      <section className="py-24 px-6 bg-gradient-to-br from-leaf-700 via-leaf-800 to-leaf-900 relative overflow-hidden">
        <div className="absolute inset-0 bg-field-pattern opacity-[0.08]" />
        <div className="absolute top-0 inset-x-0 h-1 bg-gradient-to-r from-red-500 to-red-700" />
        <div className="absolute -bottom-16 -right-16 w-64 h-64 bg-leaf-500/20 rounded-full blur-3xl" />
        <div className="absolute -top-16 -left-16 w-64 h-64 bg-harvest-500/10 rounded-full blur-3xl" />

        <div className="relative max-w-2xl mx-auto text-center">
          <div className="text-5xl mb-6">🇳🇵</div>
          <h2 className="font-display font-extrabold text-white mb-5 leading-tight"
            style={{ fontSize: 'clamp(2rem,4vw,3.2rem)' }}>
            {ne ? 'आज नै सुरु गर्नुहोस्' : 'Start Growing Smarter Today'}
          </h2>
          <p className="text-white/70 mb-10 font-body text-lg leading-relaxed">
            {ne
              ? 'नेपालको सबैभन्दा बढी बढ्दो कृषि बजारमा सामेल हुनुहोस्।'
              : "Join Nepal's fastest-growing agriculture marketplace — free for farmers and consumers alike."}
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            {user ? (
              <Link to="/dashboard"
                className="inline-flex items-center justify-center gap-2 bg-white text-leaf-800
                  font-semibold px-10 py-4 rounded-2xl hover:bg-leaf-50 transition-all shadow-payment text-lg">
                {ne ? 'ड्यासबोर्ड जानुस्' : 'Go to Dashboard'} <MdArrowForward size={20} />
              </Link>
            ) : (
              <>
                <Link to="/auth"
                  className="inline-flex items-center justify-center gap-2 bg-white text-leaf-800
                    font-semibold px-10 py-4 rounded-2xl hover:bg-leaf-50 transition-all shadow-payment text-lg">
                  <GiFarmer size={22} />{ne ? 'किसानको रूपमा जोइन्' : 'Join as Farmer'}
                </Link>
                <Link to="/auth"
                  className="inline-flex items-center justify-center gap-2 bg-white/15 text-white
                    border border-white/30 font-semibold px-10 py-4 rounded-2xl
                    hover:bg-white/25 transition-all text-lg backdrop-blur-sm">
                  <GiFruitBowl size={22} />{ne ? 'अहिले किन्नुस्' : 'Shop Now'}
                </Link>
              </>
            )}
          </div>
        </div>
      </section>

      {/* ══ FOOTER ══ */}
      <footer className="bg-earth-900 text-earth-400 py-10 px-6">
        <div className="max-w-5xl mx-auto">
          <div className="flex flex-col md:flex-row items-center justify-between gap-6">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 bg-gradient-to-br from-leaf-400 to-leaf-700 rounded-xl flex items-center justify-center">
                <GiWheat size={18} className="text-white" />
              </div>
              <div>
                <p className="font-display font-bold text-white text-lg leading-none">AgriConnect</p>
                <p className="text-xs text-earth-500 mt-0.5">स्मार्ट कृषि बजार</p>
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-center gap-6 text-sm font-body">
              <Link to="/auth" className="hover:text-leaf-400 transition-colors">{ne ? 'दर्ता गर्नुस्' : 'Sign Up'}</Link>
              <Link to="/auth" className="hover:text-leaf-400 transition-colors">{ne ? 'साइन इन' : 'Sign In'}</Link>
              <a href="mailto:info@agriconnect.com.np" className="hover:text-leaf-400 transition-colors">info@agriconnect.com.np</a>
            </div>

            <div className="flex items-center gap-2 text-xs text-earth-500">
              <span>🇳🇵</span>
              <span>{ne ? 'नेपालमा बनाइएको' : 'Made in Nepal'}</span>
              <span>·</span>
              <span>© {new Date().getFullYear()} AgriConnect.All rights reserved.
              </span>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
