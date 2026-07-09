import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { GiFarmer, GiWheat } from 'react-icons/gi';
import { MdPerson } from 'react-icons/md';
import { useAuth } from '../context/AuthContext';
import { authAPI } from '../utils/api';

/* ── Role picker shown for brand-new Google users ── */
function GoogleRolePicker({ pendingToken, onDone }) {
  const [role,    setRole]    = useState('Consumer');
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState('');

  const handleComplete = async () => {
    setLoading(true); setError('');
    try {
      const { data } = await authAPI.googleComplete(pendingToken, role);
      onDone(data.token);
    } catch (err) {
      setError(err.response?.data?.message || 'Something went wrong. Please try again.');
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-earth-50 flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="flex items-center justify-center gap-2 mb-8">
          <GiWheat size={30} className="text-leaf-600" />
          <span className="font-display font-bold text-2xl text-leaf-700">AgriConnect</span>
        </div>

        <div className="bg-white rounded-3xl shadow-payment border border-earth-100 p-8">
          {/* Google avatar placeholder + welcome */}
          <div className="text-center mb-7">
            <div className="w-16 h-16 rounded-full bg-gradient-to-br from-leaf-300 to-leaf-600 flex items-center justify-center mx-auto mb-4 text-3xl">
              🌾
            </div>
            <h2 className="text-2xl font-display font-bold text-earth-800 mb-1">
              Welcome to AgriConnect!
            </h2>
            <p className="text-sm text-earth-400 font-body">
              One last step — how will you use the platform?
            </p>
          </div>

          {error && (
            <div className="mb-5 p-3 bg-red-50 border border-red-200 rounded-xl text-red-600 text-sm font-body">
              ⚠️ {error}
            </div>
          )}

          {/* Role selector */}
          <div className="grid grid-cols-2 gap-3 mb-7">
            {[
              {
                value: 'Consumer',
                icon: <MdPerson size={32} />,
                title: 'Consumer',
                desc: 'Buy fresh produce directly from farmers',
                emoji: '🛒',
              },
              {
                value: 'Farmer',
                icon: <GiFarmer size={32} />,
                title: 'Farmer',
                desc: 'Sell your crops and reach more buyers',
                emoji: '🌾',
              },
            ].map((r) => (
              <button
                key={r.value}
                onClick={() => setRole(r.value)}
                className={`flex flex-col items-center gap-3 p-5 rounded-2xl border-2 transition-all text-center
                  ${role === r.value
                    ? 'border-leaf-400 bg-leaf-50 shadow-sm'
                    : 'border-earth-200 hover:border-earth-300 bg-white'
                  }`}
              >
                <div className={`${role === r.value ? 'text-leaf-600' : 'text-earth-400'} transition-colors`}>
                  {r.icon}
                </div>
                <div>
                  <div className={`font-semibold font-body text-sm ${role === r.value ? 'text-leaf-700' : 'text-earth-700'}`}>
                    {r.emoji} {r.title}
                  </div>
                  <div className="text-xs text-earth-400 font-body mt-1 leading-tight">{r.desc}</div>
                </div>
                {role === r.value && (
                  <div className="text-leaf-500 text-lg">✓</div>
                )}
              </button>
            ))}
          </div>

          <button
            onClick={handleComplete}
            disabled={loading}
            className="btn-primary w-full justify-center py-3.5 text-base disabled:opacity-60"
          >
            {loading
              ? <><span className="spinner" style={{ width: 18, height: 18, borderWidth: 2 }} /> Setting up your account…</>
              : `Continue as ${role} →`
            }
          </button>
        </div>
      </div>
    </div>
  );
}

/* ── Main callback handler ── */
export default function OAuthCallback() {
  const [params]          = useSearchParams();
  const { loginWithToken } = useAuth();
  const navigate           = useNavigate();
  const [pendingToken, setPendingToken] = useState(null);

  useEffect(() => {
    const token   = params.get('token');
    const pending = params.get('pending');
    const error   = params.get('error');

    if (token) {
      loginWithToken(token);
      navigate('/dashboard', { replace: true });
    } else if (pending) {
      setPendingToken(pending); // show role picker
    } else {
      navigate(`/auth?error=${error || 'oauth_failed'}`, { replace: true });
    }
  }, []);

  // Show role picker for new Google users
  if (pendingToken) {
    return (
      <GoogleRolePicker
        pendingToken={pendingToken}
        onDone={(token) => {
          loginWithToken(token);
          navigate('/dashboard', { replace: true });
        }}
      />
    );
  }

  return (
    <div className="min-h-screen bg-earth-50 flex items-center justify-center">
      <div className="text-center">
        <div className="spinner mx-auto mb-4" />
        <p className="font-body text-earth-500">Signing you in…</p>
      </div>
    </div>
  );
}
