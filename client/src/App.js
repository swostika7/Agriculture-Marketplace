import React, { Suspense, lazy } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { LanguageProvider } from './context/LanguageContext';
import { SocketProvider } from './context/SocketContext';

const AuthPage            = lazy(() => import('./pages/AuthPage'));
const OAuthCallback       = lazy(() => import('./pages/OAuthCallback'));
const LandingPage         = lazy(() => import('./pages/LandingPage'));
const ProfilePage         = lazy(() => import('./pages/ProfilePage'));
const PaymentCallback     = lazy(() => import('./pages/PaymentCallback'));
const CartPage            = lazy(() => import('./pages/CartPage'));
const ChatPage            = lazy(() => import('./pages/ChatPage'));
const AnalyticsPage       = lazy(() => import('./pages/AnalyticsPage'));
const NearestFarmersPage  = lazy(() => import('./pages/NearestFarmersPage'));
const HistoryPage         = lazy(() => import('./pages/HistoryPage'));
const Layout              = lazy(() => import('./components/Layout'));
const FarmerDashboard     = lazy(() => import('./components/FarmerDashboard'));
const ConsumerMarket      = lazy(() => import('./components/ConsumerMarketplace'));
const LogisticsTracker    = lazy(() => import('./components/LogisticsTracker'));

function Loader() {
  return (
    <div className="min-h-screen bg-earth-50 flex flex-col items-center justify-center gap-4">
      <div className="spinner"/>
      <p className="font-body text-earth-400 text-sm">Loading AgriConnect…</p>
    </div>
  );
}

function Protected({ children, role }) {
  const { user, loading } = useAuth();
  if (loading) return <Loader/>;
  if (!user)   return <Navigate to="/auth" replace/>;
  if (role && user.role !== role && user.role !== 'Admin')
    return <Navigate to="/dashboard" replace/>;
  return children;
}

function SocketWrapper({ children }) {
  const { token } = useAuth();
  return <SocketProvider token={token}>{children}</SocketProvider>;
}

function AppRoutes() {
  const { user } = useAuth();
  return (
    <Routes>
      <Route path="/"                 element={<LandingPage/>}/>
      <Route path="/auth"             element={user ? <Navigate to="/dashboard"/> : <AuthPage/>}/>
      <Route path="/auth/callback"    element={<OAuthCallback/>}/>
      <Route path="/payment/callback" element={<PaymentCallback/>}/>

      <Route path="/dashboard" element={<Protected><SocketWrapper><Layout/></SocketWrapper></Protected>}>
        <Route index element={user?.role === 'Farmer' ? <FarmerDashboard/> : <ConsumerMarket/>}/>
        <Route path="farmer"    element={<Protected role="Farmer"><FarmerDashboard/></Protected>}/>
        <Route path="market"    element={<ConsumerMarket/>}/>
        <Route path="logistics" element={<LogisticsTracker/>}/>
        <Route path="profile"   element={<ProfilePage/>}/>
        <Route path="cart"      element={<Protected role="Consumer"><CartPage/></Protected>}/>
        <Route path="chat"      element={<ChatPage/>}/>
        <Route path="analytics" element={<AnalyticsPage/>}/>
        <Route path="history"   element={<HistoryPage/>}/>
        <Route path="farmers"   element={<Protected role="Consumer"><NearestFarmersPage/></Protected>}/>
      </Route>

      <Route path="*" element={<Navigate to="/" replace/>}/>
    </Routes>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <LanguageProvider>
        <BrowserRouter>
          <Suspense fallback={<Loader/>}>
            <AppRoutes/>
          </Suspense>
        </BrowserRouter>
      </LanguageProvider>
    </AuthProvider>
  );
}
