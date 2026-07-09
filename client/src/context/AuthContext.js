import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import axios from 'axios';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user,    setUser]    = useState(null);
  const [token,   setToken]   = useState(() => localStorage.getItem('agri_token_v5') || null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (token) {
      axios.defaults.headers.common['Authorization'] = `Bearer ${token}`;
      localStorage.setItem('agri_token_v5', token);
    } else {
      delete axios.defaults.headers.common['Authorization'];
      localStorage.removeItem('agri_token_v5');
    }
  }, [token]);

  const fetchMe = useCallback(async () => {
    if (!token) { setLoading(false); return; }
    try {
      const { data } = await axios.get('/api/users/me');
      setUser(data);
    } catch {
      setToken(null); setUser(null);
    } finally { setLoading(false); }
  }, [token]);

  useEffect(() => { fetchMe(); }, [fetchMe]);

  const login = async (email, password) => {
    const { data } = await axios.post('/api/auth/login', { email, password });
    setToken(data.token); setUser(data.user);
    return data;
  };

  const register = async (payload) => {
    const { data } = await axios.post('/api/auth/register', payload);
    // Don't set token yet — needs email verification first
    return data;
  };

  const loginWithToken = (rawToken) => {
    setToken(rawToken);
  };

  const updateProfile = async (payload) => {
    const { data } = await axios.put('/api/users/profile', payload);
    setUser(prev => ({ ...prev, ...data.user }));
    return data;
  };

  const deleteAccount = async (password, confirmPhrase) => {
    const { data } = await axios.delete('/api/users/account', {
      data: { password, confirmPhrase },
    });
    // Wipe local session immediately after server confirms deletion
    setToken(null);
    setUser(null);
    return data;
  };

  const logout = () => { setToken(null); setUser(null); };

  return (
    <AuthContext.Provider value={{ user, token, loading, login, register, loginWithToken, logout, updateProfile, deleteAccount, setUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be within AuthProvider');
  return ctx;
};
