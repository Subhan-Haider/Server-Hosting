import { useState } from 'react';
import { auth, provider, signInWithPopup } from './firebase';

export default function Login({ onLogin }) {
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleGoogleLogin = async () => {
    setLoading(true);
    setError('');
    try {
      const result = await signInWithPopup(auth, provider);
      if (result.user.email !== 'setupg98@gmail.com') {
        throw new Error('Access Denied. Only setupg98@gmail.com is authorized.');
      }
      const token = await result.user.getIdToken();
      onLogin(token);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', background: 'var(--bg-color)' }}>
      <div className="glass-panel" style={{ width: '400px', padding: '40px', textAlign: 'center' }}>
        <h1 style={{ marginBottom: '10px' }}>Server Manager</h1>
        <p style={{ opacity: 0.7, marginBottom: '30px' }}>Sign in to access your dashboard</p>
        
        {error && (
          <div style={{ background: 'rgba(255,50,50,0.1)', color: 'var(--danger)', padding: '12px', borderRadius: '8px', marginBottom: '20px', fontSize: '0.9rem' }}>
            {error}
          </div>
        )}

        <button 
          className="btn btn-primary" 
          style={{ width: '100%', padding: '12px', fontSize: '1rem', display: 'flex', justifyContent: 'center', gap: '10px' }}
          onClick={handleGoogleLogin}
          disabled={loading}
        >
          {loading ? 'Signing in...' : 'Sign in with Google'}
        </button>
      </div>
    </div>
  );
}
