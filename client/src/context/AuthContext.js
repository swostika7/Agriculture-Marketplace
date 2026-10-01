import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import api from '../utils/api';

/*
 * FIX (Aug 2026 audit): this used to call the raw `axios` import and
 * mutate `axios.defaults.headers.common`, while the rest of the app
 * called through the separate `api` instance in utils/api.js — two
 * axios instances that don't share state. That's what caused "No
 * token" errors on cart/checkout/etc. Now there is exactly one HTTP
 * client (`api`) and exactly one place the token is read from
 * (localStorage, via the interceptor in utils/api.js). This context
 * only needs to keep localStorage updated; it no longer touches axios
 * headers directly.
 */
const TOKEN_KEY = 'agri_token_v5';
const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user,    setUser]    = useState(null);
  const [token,   setToken]   = useState(() => localStorage.getItem(TOKEN_KEY) || null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else       localStorage.removeItem(TOKEN_KEY);
  }, [token]);

  const fetchMe = useCallback(async () => {
    if (!token) { setLoading(false); return; }
    try {
      const { data } = await api.get('/users/me');
      setUser(data);
    } catch {
      // Invalid/expired token  log out 
      setToken(null); setUser(null);
    } finally { setLoading(false); }
  }, [token]);

  useEffect(() => { fetchMe(); }, [fetchMe]);

  const login = async (email, password) => {
    const { data } = await api.post('/auth/login', { email, password });
    setToken(data.token); setUser(data.user);
    return data;
  };

  const register = async (payload) => {
    const { data } = await api.post('/auth/register', payload);
    // Don't set token  needs email verification first
    return data;
  };

  const loginWithToken = (rawToken) => {
    setToken(rawToken);
  };

  const updateProfile = async (payload) => {
    const { data } = await api.put('/users/profile', payload);
    setUser(prev => ({ ...prev, ...data.user }));
    return data;
  };

  const logout = () => { setToken(null); setUser(null); };

  return (
    <AuthContext.Provider value={{ user, token, loading, login, register, loginWithToken, logout, updateProfile, setUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be within AuthProvider');
  return ctx;
};
