import React, { useState, useEffect, useRef } from 'react';
import { Outlet, NavLink, useNavigate, Link, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import { useSocket } from '../context/SocketContext';
import { notificationsAPI, cartAPI } from '../utils/api';
import {
  MdShoppingCart, MdLocalShipping, MdPerson, MdLogout,
  MdMenu, MdClose, MdFiberManualRecord, MdNotifications,
  MdChat, MdOutlineStorefront, MdBarChart, MdLocationOn, MdHistory
} from 'react-icons/md';
import { GiFarmer, GiWheat } from 'react-icons/gi';

export default function Layout() {
  const { user, logout }     = useAuth();
  const { t, lang, setLang } = useLanguage();
  const { socket }           = useSocket();
  const navigate             = useNavigate();
  const location             = useLocation();
  const [sideOpen, setSideOpen]    = useState(false);
  const [notifs,   setNotifs]      = useState([]);
  const [unread,   setUnread]      = useState(0);
  const [showNotif,setShowNotif]   = useState(false);
  const [chatUnread, setChatUnread] = useState(0);
  const [cartCount, setCartCount] = useState(0);
  const notifRef = useRef(null);

  // Clear chat badge when user visits the chat page
  useEffect(() => {
    if (location.pathname === '/dashboard/chat') {
      setChatUnread(0);
    }
  }, [location.pathname]);

  // Fetch initial cart count for consumers
  useEffect(() => {
    if (user?.role !== 'Farmer') {
      cartAPI.get().then(({ data }) => setCartCount(data.length)).catch(() => {});
    }
  }, [user]);

  // Listen for cart updates dispatched by ConsumerMarketplace
  useEffect(() => {
    const handler = () => {
      if (user?.role !== 'Farmer') {
        cartAPI.get().then(({ data }) => setCartCount(data.length)).catch(() => {});
      }
    };
    window.addEventListener('cart-updated', handler);
    return () => window.removeEventListener('cart-updated', handler);
  }, [user]);

  const farmerNav = [
    { to:'/dashboard/farmer',    Icon:GiFarmer,           label:t('myFarm') },
    { to:'/dashboard/market',    Icon:MdOutlineStorefront, label:t('marketplace') },
    { to:'/dashboard/logistics', Icon:MdLocalShipping,    label:t('logistics') },
    { to:'/dashboard/analytics', Icon:MdBarChart,         label:'Analytics' },
    { to:'/dashboard/history',   Icon:MdHistory,          label:'Sales History' },
    { to:'/dashboard/chat',      Icon:MdChat,             label:t('chat') },
  ];
  const consumerNav = [
    { to:'/dashboard/market',    Icon:MdOutlineStorefront, label:t('marketplace') },
    { to:'/dashboard/farmers',   Icon:MdLocationOn,        label:'Nearby Farmers' },
    { to:'/dashboard/cart',      Icon:MdShoppingCart,      label:t('cart') },
    { to:'/dashboard/logistics', Icon:MdLocalShipping,     label:t('orders') },
    { to:'/dashboard/analytics', Icon:MdBarChart,          label:'Analytics' },
    { to:'/dashboard/history',   Icon:MdHistory,           label:'Purchase History' },
    { to:'/dashboard/chat',      Icon:MdChat,              label:t('chat') },
  ];
  const nav = user?.role === 'Farmer' ? farmerNav : consumerNav;

  useEffect(() => {
    notificationsAPI.getAll().then(({ data }) => {
      // Separate chat notifications from general ones
      const generalNotifs = data.notifications.filter(n => n.type !== 'chat_message');
      setNotifs(generalNotifs);
      setUnread(generalNotifs.filter(n => !n.read).length);
    }).catch(() => {});
  }, []);

  useEffect(() => {
    if (!socket) return;
    const handler = n => {
      if (n.type === 'chat_message') {
        // Route chat notifications to the chat icon badge
        // Only increment if user is NOT currently on the chat page
        if (location.pathname !== '/dashboard/chat') {
          setChatUnread(u => u + 1);
        }
      } else {
        // All other notifications go to the bell dropdown
        setNotifs(prev => [n, ...prev]);
        setUnread(u => u + 1);
      }
    };
    socket.on('notification', handler);
    return () => socket.off('notification', handler);
  }, [socket, location.pathname]);

  useEffect(() => {
    const h = e => { if (notifRef.current && !notifRef.current.contains(e.target)) setShowNotif(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);

  const markAllRead = async () => {
    await notificationsAPI.markAllRead();
    setNotifs(prev => prev.map(n => ({ ...n, read:true }))); setUnread(0);
  };

  const notifIcon = { order_placed:'📦', order_shipped:'🚚', order_delivered:'✅', order_cancelled:'❌', new_review:'⭐', chat_message:'💬', system:'🔔' };

  return (
    <div className="min-h-screen flex bg-earth-50 font-body">
      {/* Sidebar */}
      <aside className={`fixed inset-y-0 left-0 z-40 w-64 bg-white border-r border-earth-100 flex flex-col transition-transform duration-300 ${sideOpen?'translate-x-0':'-translate-x-full'} lg:translate-x-0 lg:static lg:z-auto`}>
        <Link to="/dashboard" onClick={()=>setSideOpen(false)}
          className="flex items-center gap-3 px-6 h-16 border-b border-earth-100 hover:bg-leaf-50 transition-colors">
          <div className="w-9 h-9 bg-gradient-to-br from-leaf-400 to-leaf-700 rounded-xl flex items-center justify-center">
            <GiWheat size={20} className="text-white"/>
          </div>
          <div>
            <span className="font-display font-bold text-lg text-leaf-700 leading-none block">AgriConnect</span>
            <span className="text-xs text-earth-400">स्मार्ट कृषि बजार</span>
          </div>
        </Link>

        <Link to="/dashboard/profile" onClick={()=>setSideOpen(false)}
          className="flex items-center gap-3 px-4 py-4 border-b border-earth-100 hover:bg-earth-50 transition-colors group">
          <div className="relative">
            {user?.avatar
              ? <img src={user.avatar} alt="" className="w-11 h-11 rounded-full object-cover ring-2 ring-leaf-200 ring-offset-2"/>
              : <div className="w-11 h-11 rounded-full bg-gradient-to-br from-leaf-300 to-leaf-600 flex items-center justify-center text-white font-display font-bold text-lg ring-2 ring-leaf-200 ring-offset-2">{user?.name?.[0]?.toUpperCase()||'?'}</div>}
            <span className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 bg-leaf-400 rounded-full border-2 border-white"/>
          </div>
          <div className="flex-1 min-w-0">
            <div className="font-semibold text-earth-800 truncate text-sm group-hover:text-leaf-700 transition-colors">{user?.name}</div>
            <span className={`badge text-xs py-0 ${user?.role==='Farmer'?'badge-green':'badge-blue'}`}>{user?.role}</span>
          </div>
          <MdPerson className="text-earth-300 group-hover:text-leaf-500 transition-colors" size={16}/>
        </Link>

        <nav className="flex-1 p-4 space-y-1 overflow-y-auto">
          <p className="text-xs font-medium text-earth-400 uppercase tracking-wider px-4 mb-2">{t('dashboard')}</p>
          {nav.map(({ to, Icon, label }) => (
            <NavLink key={to} to={to}
              className={({ isActive }) => `nav-item ${isActive?'active':''}`}
              onClick={()=>setSideOpen(false)}>
              <Icon size={20}/>
              <span className="flex-1">{label}</span>
              {/* Chat-specific unread badge */}
              {to === '/dashboard/chat' && chatUnread > 0 && (
                <span className="w-5 h-5 bg-leaf-500 text-white text-xs rounded-full flex items-center justify-center font-bold shrink-0">
                  {chatUnread > 9 ? '9+' : chatUnread}
                </span>
              )}
              {/* Cart item count badge */}
              {to === '/dashboard/cart' && cartCount > 0 && (
                <span className="w-5 h-5 bg-red-500 text-white text-xs rounded-full flex items-center justify-center font-bold shrink-0">
                  {cartCount > 9 ? '9+' : cartCount}
                </span>
              )}
            </NavLink>
          ))}
          <div className="border-t border-earth-100 pt-3 mt-3">
            <NavLink to="/dashboard/profile"
              className={({ isActive }) => `nav-item ${isActive?'active':''}`}
              onClick={()=>setSideOpen(false)}>
              <MdPerson size={20}/>{t('profile')}
            </NavLink>
          </div>
        </nav>

        {/* Language */}
        <div className="px-4 py-3 border-t border-earth-100">
          <div className="flex items-center gap-2 p-2 bg-earth-50 rounded-xl">
            <span className="text-xs text-earth-500 font-body">{t('language')}:</span>
            {['en','ne'].map(l => (
              <button key={l} onClick={()=>setLang(l)}
                className={`flex-1 py-1.5 rounded-lg text-xs font-body font-medium transition-all
                  ${lang===l?'bg-leaf-500 text-white':'text-earth-500 hover:text-earth-700'}`}>
                {l==='en'?'🇬🇧 EN':'🇳🇵 NE'}
              </button>
            ))}
          </div>
        </div>

        <div className="p-4 border-t border-earth-100">
          <div className="flex items-center gap-2 px-4 py-2 text-xs text-earth-500 font-body mb-2">
            <MdFiberManualRecord className="text-leaf-400 animate-pulse" size={10}/>Live Market
          </div>
          <button onClick={()=>{logout();navigate('/');}} className="nav-item w-full hover:bg-red-50 hover:text-red-600">
            <MdLogout size={20}/>{t('signOut')}
          </button>
        </div>
      </aside>

      {sideOpen && <div className="fixed inset-0 z-30 bg-black/30 lg:hidden" onClick={()=>setSideOpen(false)}/>}

      <div className="flex-1 flex flex-col min-w-0">
        <header className="h-16 bg-white border-b border-earth-100 flex items-center px-6 gap-4 sticky top-0 z-20 shadow-sm">
          <button className="lg:hidden p-2 rounded-xl hover:bg-earth-100 text-earth-600" onClick={()=>setSideOpen(s=>!s)}>
            {sideOpen?<MdClose size={22}/>:<MdMenu size={22}/>}
          </button>
          <div className="hidden sm:block">
            <span className="text-sm font-body text-earth-400">{lang==='ne'?'स्वागत छ, ':'Welcome, '}</span>
            <span className="text-sm font-semibold text-earth-700">{user?.name?.split(' ')[0]}</span>
          </div>
          <div className="flex-1"/>

          {user?.role!=='Farmer' && (
            <Link to="/dashboard/cart" className="relative p-2 rounded-xl hover:bg-earth-100 text-earth-600 transition-colors">
              <MdShoppingCart size={22}/>
              {cartCount > 0 && (
                <span className="absolute top-1 right-1 w-4 h-4 bg-red-500 text-white text-xs rounded-full flex items-center justify-center font-mono font-bold">
                  {cartCount > 9 ? '9+' : cartCount}
                </span>
              )}
            </Link>
          )}

          {/* Chat icon with message badge */}
          <Link to="/dashboard/chat"
            className="relative p-2 rounded-xl hover:bg-earth-100 text-earth-600 transition-colors"
            onClick={() => setChatUnread(0)}>
            <MdChat size={22}/>
            {chatUnread > 0 && (
              <span className="absolute top-1 right-1 w-4 h-4 bg-leaf-500 text-white text-xs rounded-full flex items-center justify-center font-mono font-bold">
                {chatUnread > 9 ? '9+' : chatUnread}
              </span>
            )}
          </Link>

          {/* Notification bell */}
          <div className="relative" ref={notifRef}>
            <button onClick={()=>setShowNotif(s=>!s)}
              className="relative p-2 rounded-xl hover:bg-earth-100 text-earth-600 transition-colors">
              <MdNotifications size={22}/>
              {unread>0 && (
                <span className="absolute top-1 right-1 w-4 h-4 bg-red-500 text-white text-xs rounded-full flex items-center justify-center font-mono font-bold">
                  {unread>9?'9+':unread}
                </span>
              )}
            </button>
            {showNotif && (
              <div className="absolute right-0 top-12 w-80 bg-white rounded-2xl shadow-payment border border-earth-100 overflow-hidden z-50 animate-slide-up">
                <div className="flex items-center justify-between px-4 py-3 border-b border-earth-100">
                  <span className="font-display font-semibold text-earth-800 text-sm">{t('notifications')}</span>
                  {unread>0 && <button onClick={markAllRead} className="text-xs text-leaf-600 hover:underline font-body">{t('markAllRead')}</button>}
                </div>
                <div className="max-h-72 overflow-y-auto">
                  {notifs.length===0
                    ? <div className="px-4 py-8 text-center text-earth-400 text-sm font-body">{t('noNotifications')}</div>
                    : notifs.map(n=>(
                      <div key={n._id}
                        className={`flex gap-3 px-4 py-3 border-b border-earth-50 hover:bg-earth-50 cursor-pointer ${!n.read?'bg-leaf-50':''}`}
                        onClick={()=>{notificationsAPI.markRead(n._id);setNotifs(prev=>prev.map(x=>x._id===n._id?{...x,read:true}:x));setUnread(u=>Math.max(0,u-(!n.read?1:0)));setShowNotif(false);if(n.link)navigate(n.link);}}>
                        <span className="text-xl shrink-0">{notifIcon[n.type]||'🔔'}</span>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-earth-800 font-body leading-tight">{n.title}</p>
                          <p className="text-xs text-earth-500 font-body mt-0.5 line-clamp-2">{n.body}</p>
                        </div>
                        {!n.read&&<span className="w-2 h-2 bg-leaf-400 rounded-full shrink-0 mt-2"/>}
                      </div>
                    ))}
                </div>
              </div>
            )}
          </div>

          <Link to="/dashboard/profile"
            className="hidden sm:flex items-center gap-2 text-sm font-body text-earth-500 hover:text-leaf-600 transition-colors px-3 py-1.5 rounded-xl hover:bg-leaf-50">
            <MdPerson size={16}/>{t('profile')}
          </Link>
        </header>

        <main className="flex-1 p-6 overflow-auto">
          <Outlet/>
        </main>
      </div>
    </div>
  );
}
