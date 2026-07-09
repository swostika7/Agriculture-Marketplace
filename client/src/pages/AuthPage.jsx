import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  MdEmail, MdLock, MdPerson, MdVisibility, MdVisibilityOff,
  MdLocationOn, MdArrowBack, MdRefresh, MdCheckCircle,
} from 'react-icons/md';
import { GiFarmer, GiWheat } from 'react-icons/gi';
import { useAuth } from '../context/AuthContext';
import { authAPI } from '../utils/api';
import LocationPicker from '../components/LocationPicker';

const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/* ════════════════════════════════════════════════════════
   PASSWORD STRENGTH BAR
   Defined OUTSIDE AuthPage → stable reference, no re-mount
════════════════════════════════════════════════════════ */
function StrengthBar({ pw }) {
  if (!pw) return null;
  const checks = [pw.length >= 6, /[A-Z]/.test(pw), /[0-9]/.test(pw), /[^A-Za-z0-9]/.test(pw)];
  const score = checks.filter(Boolean).length;
  const cols = ['', 'bg-red-400', 'bg-orange-400', 'bg-harvest-400', 'bg-leaf-500'];
  const labels = ['', 'Weak', 'Fair', 'Good', 'Strong'];
  return (
    <div className="mt-2">
      <div className="flex gap-1 mb-1">
        {[0, 1, 2, 3].map(i => (
          <div key={i} className={`h-1 flex-1 rounded-full ${i < score ? cols[score] : 'bg-earth-200'}`} />
        ))}
      </div>
      <div className="flex justify-between">
        <div className="flex gap-2 flex-wrap">
          {['6+ chars', 'A-Z', '0-9', 'Special'].map((l, i) => (
            <span key={l} className={`text-xs font-body ${checks[i] ? 'text-leaf-600' : 'text-earth-400'}`}>
              {checks[i] ? '✓' : '○'} {l}
            </span>
          ))}
        </div>
        {score > 0 && (
          <span className={`text-xs font-medium font-body ${['', 'text-red-400', 'text-orange-400', 'text-harvest-600', 'text-leaf-600'][score]}`}>
            {labels[score]}
          </span>
        )}
      </div>
    </div>
  );
}

/* ════════════════════════════════════════════════════════
   OTP INPUT — 6 individual digit boxes
   Defined OUTSIDE AuthPage → stable reference, NO re-mount
   on parent state changes → fixes the blinking / flash bug
════════════════════════════════════════════════════════ */
function OTPInput({ value, onChange }) {
  const inputs = useRef([]);
  const digits = (value + '      ').split('').slice(0, 6).map(c => (/\d/.test(c) ? c : ''));

  const handleKey = (i, e) => {
    if (e.key === 'Backspace') {
      e.preventDefault();
      const next = digits.map((d, j) => (j === i ? '' : d)).join('');
      onChange(next.trimEnd());
      if (i > 0) inputs.current[i - 1]?.focus();
    }
  };

  const handleChange = (i, e) => {
    const char = e.target.value.replace(/\D/g, '').slice(-1);
    const next = digits.map((d, j) => (j === i ? char : d)).join('').trimEnd();
    onChange(next);
    if (char && i < 5) inputs.current[i + 1]?.focus();
  };

  const handlePaste = (e) => {
    e.preventDefault();
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
    onChange(pasted);
    const focusIdx = Math.min(pasted.length, 5);
    inputs.current[focusIdx]?.focus();
  };

  return (
    <div className="flex gap-3 justify-center" onPaste={handlePaste}>
      {digits.map((d, i) => (
        <input
          key={i}
          ref={el => { inputs.current[i] = el; }}
          type="text"
          inputMode="numeric"
          maxLength={1}
          value={d}
          onChange={e => handleChange(i, e)}
          onKeyDown={e => handleKey(i, e)}
          className={[
            'w-12 h-14 text-center text-2xl font-mono font-bold rounded-xl border-2 outline-none',
            'focus:ring-2 focus:ring-leaf-300',
            d
              ? 'border-leaf-400 bg-leaf-50 text-leaf-800 focus:border-leaf-500'
              : 'border-earth-200 bg-white text-earth-800 focus:border-leaf-400',
          ].join(' ')}
        />
      ))}
    </div>
  );
}

/* ════════════════════════════════════════════════════════
   OTP SCREEN — wrapper for both verify-email + verify-reset
   Defined OUTSIDE AuthPage → stable reference, NO blinking
════════════════════════════════════════════════════════ */
function OTPScreen({
  title, subtitle, pendingEmail,
  otp, onOtpChange,
  onVerify, onBack, onResend,
  loading, error, success, resendCooldown,
}) {
  return (
    <div className="space-y-6">
      <div>
        <button
          onClick={onBack}
          className="flex items-center gap-1.5 text-sm text-earth-500 hover:text-earth-700 mb-5 font-body transition-colors"
        >
          <MdArrowBack size={16} /> Back
        </button>
        <h2 className="text-2xl font-display font-bold text-earth-800 mb-1">{title}</h2>
        <p className="text-sm text-earth-400 font-body">
          {subtitle} <span className="font-semibold text-earth-700">{pendingEmail}</span>
        </p>
      </div>

      {/* Success / Error banners — stable, no animation that re-triggers */}
      {success && (
        <div className="p-3 bg-leaf-50 border border-leaf-200 rounded-xl text-leaf-700 text-sm font-body flex items-center gap-2">
          <MdCheckCircle size={16} className="shrink-0" /> {success}
        </div>
      )}
      {error && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-red-600 text-sm font-body flex items-start gap-2">
          <span className="shrink-0">⚠️</span> {error}
        </div>
      )}

      {/* OTP digits */}
      <div>
        <p className="text-xs text-earth-500 font-body text-center mb-4">
          Enter the 6-digit code sent to your email
        </p>
        <OTPInput value={otp} onChange={onOtpChange} />
      </div>

      {/* Filled progress indicator */}
      <div className="flex gap-1 justify-center">
        {[0, 1, 2, 3, 4, 5].map(i => (
          <div
            key={i}
            className={`h-1 w-8 rounded-full ${i < otp.replace(/\s/g, '').length ? 'bg-leaf-500' : 'bg-earth-200'
              }`}
          />
        ))}
      </div>

      <button
        onClick={onVerify}
        disabled={loading || otp.replace(/\s/g, '').length < 6}
        className="btn-primary w-full justify-center py-3.5 text-base disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {loading
          ? <><span className="spinner" style={{ width: 18, height: 18, borderWidth: 2 }} /> Verifying…</>
          : <><MdCheckCircle size={18} /> Verify Code</>}
      </button>

      <div className="text-center">
        <p className="text-xs text-earth-400 font-body mb-1">Didn't receive it? Check spam folder or</p>
        <button
          onClick={onResend}
          disabled={resendCooldown > 0 || loading}
          className="inline-flex items-center gap-1.5 text-sm text-leaf-600 hover:text-leaf-700 font-body font-medium disabled:text-earth-400 transition-colors"
        >
          <MdRefresh size={15} />
          {resendCooldown > 0 ? `Resend in ${resendCooldown}s` : 'Resend code'}
        </button>
      </div>
    </div>
  );
}

/* ════════════════════════════════════════════════════════
   MAIN AUTH PAGE
════════════════════════════════════════════════════════ */
export default function AuthPage() {
  const [params] = useSearchParams();
  const [mode, setMode] = useState('login');
  // login | register | verify-email | forgot | verify-reset | reset-password
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [showNewPw, setShowNewPw] = useState(false);

  const { login, register, loginWithToken } = useAuth();
  const navigate = useNavigate();

  /* Shared OTP / flow state */
  const [pendingEmail, setPendingEmail] = useState('');
  const [resetToken, setResetToken] = useState('');
  const [otp, setOtp] = useState('');
  const [resendCooldown, setResendCooldown] = useState(0);

  /* Login / register form */
  const [form, setForm] = useState({
    name: '', email: '', password: '', newPassword: '', role: 'Consumer',
    location: { city: '', lat: 27.7172, lng: 85.3240 },
  });

  /* Register email real-time check */
  const [emailError, setEmailError] = useState('');
  const [emailOk, setEmailOk] = useState(false);
  const [checkingEmail, setCheckingEmail] = useState(false);
  const debounceRef = useRef(null);

  /* Show OAuth errors from URL */
  useEffect(() => {
    const err = params.get('error');
    if (err) setError(
      err === 'google_failed' ? 'Google sign-in failed. Please try again.' :
        err === 'google_not_configured' ? 'Google sign-in is not configured. Use email login.' :
          'Sign-in failed. Please try again.'
    );
  }, [params]);

  /* Resend countdown */
  useEffect(() => {
    if (resendCooldown <= 0) return;
    const t = setTimeout(() => setResendCooldown(c => c - 1), 1000);
    return () => clearTimeout(t);
  }, [resendCooldown]);

  /* Email duplicate check while registering */
  useEffect(() => {
    if (mode !== 'register') { setEmailError(''); setEmailOk(false); return; }
    const email = form.email.trim();
    if (!email) { setEmailError(''); setEmailOk(false); return; }
    if (!emailRegex.test(email)) { setEmailError('Please enter a valid email address'); setEmailOk(false); return; }
    clearTimeout(debounceRef.current);
    setCheckingEmail(true);
    debounceRef.current = setTimeout(async () => {
      try {
        const { data } = await authAPI.checkEmail(email);
        if (data.exists) { setEmailError('Email already registered — sign in instead'); setEmailOk(false); }
        else { setEmailError(''); setEmailOk(true); }
      } catch { setEmailError(''); setEmailOk(false); }
      finally { setCheckingEmail(false); }
    }, 600);
    return () => clearTimeout(debounceRef.current);
  }, [form.email, mode]);

  const set = k => e => { setForm(p => ({ ...p, [k]: e.target.value })); setError(''); };

  const resetForm = () => {
    setForm({
      name: '', email: '', password: '', newPassword: '', role: 'Consumer',
      location: { city: '', lat: 27.7172, lng: 85.3240 }
    });
    setEmailError(''); setEmailOk(false); setOtp(''); setError(''); setSuccess('');
  };

  /* Stable OTP change handler — won't cause OTPInput to re-mount */
  const handleOtpChange = useCallback((v) => {
    setOtp(v);
    setError('');
  }, []);

  /* ── Submit handlers ── */

  const handleLogin = async (e) => {
    e.preventDefault(); setError(''); setLoading(true);
    try {
      await login(form.email.trim(), form.password);
      navigate('/dashboard');
    } catch (err) {
      const data = err.response?.data;
      if (data?.needsVerification) {
        setPendingEmail(data.email); setOtp('');
        setMode('verify-email');
        setSuccess('A new verification code has been sent to your email.');
        setResendCooldown(60);
      } else {
        setError(data?.message || 'Sign in failed. Please try again.');
      }
    } finally { setLoading(false); }
  };

  const handleRegister = async (e) => {
    e.preventDefault(); setError('');
    if (emailError) { setError(emailError); return; }
    if (form.password.length < 6) { setError('Password must be at least 6 characters.'); return; }
    setLoading(true);
    try {
      const res = await register({
        name: form.name.trim(), email: form.email.trim(),
        password: form.password, role: form.role, location: form.location,
      });
      if (res.needsVerification) {
        setPendingEmail(res.email); setOtp('');
        setMode('verify-email');
        setSuccess('We sent a 6-digit code to your email. Check your inbox.');
        setResendCooldown(60);
      }
    } catch (err) {
      setError(err.response?.data?.message || 'Registration failed. Please try again.');
    } finally { setLoading(false); }
  };

  const handleVerifyEmail = async () => {
    const clean = otp.replace(/\s/g, '');
    if (clean.length < 6) { setError('Please enter the complete 6-digit code.'); return; }
    setError(''); setLoading(true);
    try {
      const { data } = await authAPI.verifyEmail(pendingEmail, clean);
      loginWithToken(data.token);
      navigate('/dashboard');
    } catch (err) {
      setError(err.response?.data?.message || 'Invalid code. Please try again.');
      setOtp('');
    } finally { setLoading(false); }
  };

  const handleResendOTP = async () => {
    if (resendCooldown > 0) return;
    setLoading(true); setError('');
    try {
      await authAPI.resendOTP(pendingEmail);
      setSuccess('New code sent! Check your inbox.'); setOtp('');
      setResendCooldown(60);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to resend code.');
    } finally { setLoading(false); }
  };

  const handleForgotPassword = async (e) => {
    e.preventDefault(); setError(''); setLoading(true);
    try {
      const { data } = await authAPI.forgotPassword(form.email.trim());
      setPendingEmail(data.email); setOtp('');
      setMode('verify-reset');
      setSuccess('A reset code has been sent to your email.');
      setResendCooldown(60);
    } catch (err) {
      setError(err.response?.data?.message || 'No account found with this email.');
    } finally { setLoading(false); }
  };

  const handleVerifyReset = async () => {
    const clean = otp.replace(/\s/g, '');
    if (clean.length < 6) { setError('Please enter the complete 6-digit code.'); return; }
    setError(''); setLoading(true);
    try {
      const { data } = await authAPI.verifyResetOTP(pendingEmail, clean);
      setResetToken(data.resetToken);
      setMode('reset-password');
      setSuccess('Code verified! Now set your new password.');
      setOtp('');
    } catch (err) {
      setError(err.response?.data?.message || 'Invalid or expired code.');
      setOtp('');
    } finally { setLoading(false); }
  };

  const handleResendReset = async () => {
    if (resendCooldown > 0) return;
    setLoading(true);
    try {
      await authAPI.forgotPassword(pendingEmail);
      setSuccess('New code sent!'); setResendCooldown(60); setOtp('');
    } catch (err) { setError(err.response?.data?.message || 'Failed to resend.'); }
    finally { setLoading(false); }
  };

  const handleResetPassword = async (e) => {
    e.preventDefault(); setError('');
    if (form.newPassword.length < 6) { setError('Password must be at least 6 characters.'); return; }
    setLoading(true);
    try {
      await authAPI.resetPassword(pendingEmail, resetToken, form.newPassword);
      setMode('login');
      setSuccess('Password reset successfully! You can now sign in.');
      resetForm();
    } catch (err) {
      setError(err.response?.data?.message || 'Reset failed. Please start over.');
    } finally { setLoading(false); }
  };

  const ServerUrl = process.env.REACT_APP_SERVER_URL || 'http://localhost:5000';

  return (
    <div className="min-h-screen bg-earth-50 flex">

      {/* ── Left decorative panel ── */}
      <div className="hidden lg:flex flex-col justify-between px-14 py-16 bg-gradient-to-br from-leaf-700 to-leaf-900 w-[42%] relative overflow-hidden">
        <div className="absolute inset-0 bg-field-pattern opacity-10" />
        <div className="absolute -bottom-20 -left-20 w-80 h-80 bg-leaf-400/20 rounded-full blur-3xl" />
        <div className="absolute top-1/3 right-0 w-48 h-48 bg-harvest-400/10 rounded-full blur-2xl" />
        <div className="relative">
          <div className="flex items-center gap-3 mb-14">
            <div className="w-11 h-11 bg-white/20 rounded-2xl flex items-center justify-center">
              <GiWheat size={26} className="text-white" />
            </div>
            <div>
              <span className="font-display font-bold text-2xl text-white block leading-none">AgriConnect</span>
              <span className="text-leaf-300 text-xs">Nepal's Farm-to-Table Platform</span>
            </div>
          </div>
          <h1 className="text-4xl font-display font-bold text-white leading-tight mb-5">
            Fresh from<br />Nepal's<br /><span className="text-harvest-300">Finest Farms</span>
          </h1>
          <p className="text-leaf-200 font-body leading-relaxed max-w-xs">
            Connecting local farmers with urban consumers — fair prices, real GPS navigation, live chat.
          </p>
        </div>
        <div className="relative grid grid-cols-2 gap-3">
          {[
            ['🌾', 'Direct from Farm', 'No middlemen'],
            ['🗺️', 'GPS Navigation', 'Walking & driving'],
            ['💬', 'Live Chat', 'Instant messaging'],
            ['💳', 'eSewa Payments', 'Secure & instant'],
          ].map(([icon, title, desc]) => (
            <div key={title} className="bg-white/10 backdrop-blur-sm rounded-2xl p-4 border border-white/10">
              <div className="text-2xl mb-2">{icon}</div>
              <div className="text-white font-semibold text-sm font-body">{title}</div>
              <div className="text-leaf-300 text-xs font-body mt-0.5">{desc}</div>
            </div>
          ))}
        </div>
      </div>

      {/* ── Right form panel ── */}
      <div className="flex-1 flex items-center justify-center px-6 py-12 overflow-y-auto">
        <div className="w-full max-w-md">
          {/* Mobile logo */}
          <div className="flex items-center justify-center gap-2 mb-8 lg:hidden">
            <GiWheat size={28} className="text-leaf-600" />
            <span className="font-display font-bold text-2xl text-leaf-700">AgriConnect</span>
          </div>

          <div className="bg-white rounded-3xl shadow-payment border border-earth-100 p-8">

            {/* ═══ VERIFY EMAIL OTP ═══ */}
            {mode === 'verify-email' && (
              <OTPScreen
                title="Verify Your Email 📬"
                subtitle="We sent a 6-digit code to"
                pendingEmail={pendingEmail}
                otp={otp}
                onOtpChange={handleOtpChange}
                onVerify={handleVerifyEmail}
                onBack={() => { setMode('register'); setOtp(''); setError(''); setSuccess(''); }}
                onResend={handleResendOTP}
                loading={loading}
                error={error}
                success={success}
                resendCooldown={resendCooldown}
              />
            )}

            {/* ═══ VERIFY RESET OTP ═══ */}
            {mode === 'verify-reset' && (
              <OTPScreen
                title="Enter Reset Code 🔑"
                subtitle="We sent a password reset code to"
                pendingEmail={pendingEmail}
                otp={otp}
                onOtpChange={handleOtpChange}
                onVerify={handleVerifyReset}
                onBack={() => { setMode('forgot'); setOtp(''); setError(''); setSuccess(''); }}
                onResend={handleResendReset}
                loading={loading}
                error={error}
                success={success}
                resendCooldown={resendCooldown}
              />
            )}

            {/* ═══ RESET PASSWORD ═══ */}
            {mode === 'reset-password' && (
              <div className="space-y-6">
                <div>
                  <h2 className="text-2xl font-display font-bold text-earth-800 mb-1">Set New Password 🔒</h2>
                  <p className="text-sm text-earth-400 font-body">Choose a strong password for your account</p>
                </div>
                {success && (
                  <div className="p-3 bg-leaf-50 border border-leaf-200 rounded-xl text-leaf-700 text-sm font-body flex items-center gap-2">
                    <MdCheckCircle size={16} /> {success}
                  </div>
                )}
                {error && (
                  <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-red-600 text-sm font-body">
                    ⚠️ {error}
                  </div>
                )}
                <form onSubmit={handleResetPassword} className="space-y-4">
                  <div>
                    <label className="label flex items-center gap-1"><MdLock size={14} /> New Password *</label>
                    <div className="relative">
                      <input className="input pr-10"
                        type={showNewPw ? 'text' : 'password'}
                        placeholder="Min. 6 characters"
                        value={form.newPassword} onChange={set('newPassword')} required minLength={6} />
                      <button type="button" onClick={() => setShowNewPw(p => !p)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-earth-400 hover:text-earth-600">
                        {showNewPw ? <MdVisibilityOff size={18} /> : <MdVisibility size={18} />}
                      </button>
                    </div>
                    <StrengthBar pw={form.newPassword} />
                  </div>
                  <button type="submit" disabled={loading}
                    className="btn-primary w-full justify-center py-3.5 text-base disabled:opacity-60">
                    {loading
                      ? <><span className="spinner" style={{ width: 18, height: 18, borderWidth: 2 }} /> Saving…</>
                      : '🔒 Reset Password'}
                  </button>
                </form>
              </div>
            )}

            {/* ═══ FORGOT PASSWORD ═══ */}
            {mode === 'forgot' && (
              <div className="space-y-6">
                <div>
                  <button onClick={() => { setMode('login'); setError(''); setSuccess(''); }}
                    className="flex items-center gap-1.5 text-sm text-earth-500 hover:text-earth-700 mb-5 font-body transition-colors">
                    <MdArrowBack size={16} /> Back to Sign In
                  </button>
                  <h2 className="text-2xl font-display font-bold text-earth-800 mb-1">Forgot Password? 🤔</h2>
                  <p className="text-sm text-earth-400 font-body">Enter your email and we'll send a reset code</p>
                </div>
                {error && (
                  <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-red-600 text-sm font-body">⚠️ {error}</div>
                )}
                <form onSubmit={handleForgotPassword} className="space-y-4">
                  <div>
                    <label className="label flex items-center gap-1"><MdEmail size={14} /> Email Address *</label>
                    <input className="input" type="email" placeholder="your@email.com"
                      value={form.email} onChange={set('email')} required />
                  </div>
                  <button type="submit" disabled={loading}
                    className="btn-primary w-full justify-center py-3.5 text-base disabled:opacity-60">
                    {loading
                      ? <><span className="spinner" style={{ width: 18, height: 18, borderWidth: 2 }} /> Sending…</>
                      : '📨 Send Reset Code'}
                  </button>
                </form>
              </div>
            )}

            {/* ═══ LOGIN / REGISTER ═══ */}
            {(mode === 'login' || mode === 'register') && (
              <>
                {/* Tab toggle */}
                <div className="flex bg-earth-50 rounded-xl p-1 mb-7 border border-earth-100">
                  {['Sign In', 'Create Account'].map((label, i) => (
                    <button key={label}
                      onClick={() => { setMode(i === 0 ? 'login' : 'register'); resetForm(); }}
                      className={`flex-1 py-2.5 rounded-lg text-sm font-medium font-body transition-all
                        ${(i === 0) === (mode === 'login') ? 'bg-white text-leaf-700 shadow-sm' : 'text-earth-500 hover:text-earth-700'}`}>
                      {label}
                    </button>
                  ))}
                </div>

                <h2 className="text-2xl font-display font-bold text-earth-800 mb-1">
                  {mode === 'login' ? 'Welcome back 👋' : 'Join AgriConnect 🌾'}
                </h2>
                <p className="text-sm font-body text-earth-400 mb-6">
                  {mode === 'login' ? 'Sign in to your dashboard' : 'Create your free account today'}
                </p>

                {/* Google OAuth */}
                <div className="mb-6">
                  <a href={`${ServerUrl}/api/auth/google`}
                    className="flex items-center justify-center gap-3 w-full py-3 px-4 rounded-xl border-2 font-body font-medium text-sm border-earth-200 text-earth-700 hover:border-earth-400 hover:shadow-md bg-white transition-all hover:-translate-y-0.5 active:scale-95">
                    <svg width="20" height="20" viewBox="0 0 48 48" className="shrink-0">
                      <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
                      <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
                      <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
                      <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
                    </svg>
                    Continue with Google
                  </a>
                </div>

                {/* Divider */}
                <div className="flex items-center gap-3 mb-6">
                  <div className="flex-1 h-px bg-earth-100" />
                  <span className="text-xs text-earth-400 font-body">or with email</span>
                  <div className="flex-1 h-px bg-earth-100" />
                </div>

                {error && (
                  <div className="mb-5 p-3.5 bg-red-50 border border-red-200 rounded-xl text-red-600 text-sm font-body flex items-start gap-2">
                    <span>⚠️</span><span>{error}</span>
                  </div>
                )}
                {success && (
                  <div className="mb-5 p-3 bg-leaf-50 border border-leaf-200 rounded-xl text-leaf-700 text-sm font-body flex items-center gap-2">
                    <MdCheckCircle size={16} /> {success}
                  </div>
                )}

                <form onSubmit={mode === 'login' ? handleLogin : handleRegister} className="space-y-4">
                  {mode === 'register' && (
                    <>
                      <div>
                        <label className="label flex items-center gap-1"><MdPerson size={14} /> Full Name *</label>
                        <input className="input" placeholder="e.g. Hari Bahadur Tamang"
                          value={form.name} onChange={set('name')} required />
                      </div>
                      <div>
                        <label className="label">I am a…</label>
                        <div className="grid grid-cols-2 gap-3">
                          {['Consumer', 'Farmer'].map(r => (
                            <label key={r}
                              className={`flex items-center gap-3 p-3.5 rounded-xl border-2 cursor-pointer transition-colors
                                ${form.role === r ? 'border-leaf-400 bg-leaf-50' : 'border-earth-200 hover:border-earth-300'}`}>
                              <input type="radio" name="role" value={r}
                                checked={form.role === r} onChange={set('role')} className="sr-only" />
                              {r === 'Farmer'
                                ? <GiFarmer size={22} className={form.role === r ? 'text-leaf-600' : 'text-earth-400'} />
                                : <MdPerson size={22} className={form.role === r ? 'text-leaf-600' : 'text-earth-400'} />}
                              <div>
                                <div className={`text-sm font-semibold font-body ${form.role === r ? 'text-leaf-700' : 'text-earth-700'}`}>{r}</div>
                                <div className="text-xs text-earth-400 font-body">{r === 'Farmer' ? 'Sell produce' : 'Buy fresh'}</div>
                              </div>
                            </label>
                          ))}
                        </div>
                      </div>
                    </>
                  )}

                  {/* Email */}
                  <div>
                    <label className="label flex items-center gap-1"><MdEmail size={14} /> Email Address *</label>
                    <div className="relative">
                      <input
                        className={`input pr-10 ${emailError ? 'border-red-400' : emailOk ? 'border-leaf-400' : ''}`}
                        type="email" placeholder="your@email.com"
                        value={form.email} onChange={set('email')} required />
                      <span className="absolute right-3.5 top-1/2 -translate-y-1/2 text-sm">
                        {checkingEmail
                          ? <span className="spinner" style={{ width: 16, height: 16, borderWidth: 2 }} />
                          : emailOk ? '✅' : emailError ? '❌' : ''}
                      </span>
                    </div>
                    {emailError && <p className="text-xs text-red-500 mt-1.5 font-body">⚠️ {emailError}</p>}
                    {emailOk && <p className="text-xs text-leaf-600 mt-1.5 font-body">✓ Email is available</p>}
                  </div>

                  {/* Password */}
                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <label className="label mb-0 flex items-center gap-1"><MdLock size={14} /> Password *</label>
                      {mode === 'login' && (
                        <button type="button"
                          onClick={() => { setMode('forgot'); setError(''); setSuccess(''); }}
                          className="text-xs text-leaf-600 hover:text-leaf-700 font-body font-medium hover:underline transition-colors">
                          Forgot password?
                        </button>
                      )}
                    </div>
                    <div className="relative">
                      <input className="input pr-10"
                        type={showPw ? 'text' : 'password'} placeholder="Min. 6 characters"
                        value={form.password} onChange={set('password')} required minLength={6} />
                      <button type="button" onClick={() => setShowPw(p => !p)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-earth-400 hover:text-earth-600">
                        {showPw ? <MdVisibilityOff size={18} /> : <MdVisibility size={18} />}
                      </button>
                    </div>
                    {mode === 'register' && <StrengthBar pw={form.password} />}
                  </div>

                  {/* Location (register only) */}
                  {mode === 'register' && (
                    <LocationPicker
                      label={
                        <span className="flex items-center gap-1">
                          <MdLocationOn size={14} />
                          {form.role === 'Farmer' ? 'Farm Location' : 'Your City'}
                        </span>
                      }
                      placeholder={form.role === 'Farmer' ? 'Search your farm location…' : 'Search your city…'}
                      value={form.location}
                      onChange={loc => setForm(p => ({ ...p, location: loc }))}
                    />
                  )}

                  <button
                    type="submit"
                    disabled={loading || (mode === 'register' && !!emailError)}
                    className="btn-primary w-full justify-center py-3.5 text-base mt-2 disabled:opacity-60 disabled:cursor-not-allowed">
                    {loading
                      ? <><span className="spinner" style={{ width: 18, height: 18, borderWidth: 2 }} /> Please wait…</>
                      : mode === 'login'
                        ? <><MdLock size={18} /> Sign In</>
                        : <><GiWheat size={18} /> Create Account</>}
                  </button>
                </form>

                <p className="text-center text-sm text-earth-500 font-body mt-5">
                  {mode === 'login' ? "Don't have an account? " : 'Already registered? '}
                  <button className="text-leaf-600 font-semibold hover:underline"
                    onClick={() => { setMode(mode === 'login' ? 'register' : 'login'); resetForm(); }}>
                    {mode === 'login' ? 'Register here' : 'Sign in'}
                  </button>
                </p>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
