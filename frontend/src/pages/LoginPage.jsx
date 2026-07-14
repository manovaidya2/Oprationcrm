import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { toast } from 'sonner';

const ROLE_HOME = {
  Admin: '/', Counselor: '/counselor', Center: '/center',
  Accountant: '/accountant', University: '/university', Dispatch: '/dispatch',
  PaymentCoordinator: '/payment-coordinator',
};

const DEMO_ACCOUNTS = [
  { label: 'Admin',       email: 'admin@edu.io',       color: '#ef4444' },
  { label: 'Counselor',   email: 'aarav@edu.io',        color: '#6366f1' },
  { label: 'Center',      email: 'mumbai@center.io',    color: '#06b6d4' },
  { label: 'Accountant',  email: 'accountant@edu.io',   color: '#f59e0b' },
  { label: 'Pay Coord',    email: 'paymentcoordinator@edu.io', color: '#14b8a6' },
  { label: 'University',  email: 'university@edu.io',   color: '#8b5cf6' },
  { label: 'Dispatch',    email: 'dispatch@edu.io',     color: '#10b981' },
];

const EyeIcon = ({ open }) => open ? (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>
  </svg>
) : (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/>
    <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/>
    <line x1="1" y1="1" x2="23" y2="23"/>
  </svg>
);

const MailIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/>
    <polyline points="22,6 12,13 2,6"/>
  </svg>
);

const LockIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
    <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
  </svg>
);

const LogoMark = ({ size = 42 }) => (
  <svg width={size} height={size} viewBox="0 0 42 42" fill="none">
    <rect width="42" height="42" rx="11" fill="#4f46e5"/>
    <path d="M10 22 L21 12 L32 22" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
    <rect x="16" y="22" width="10" height="9" rx="1.5" fill="white" opacity="0.95"/>
    <rect x="13" y="19" width="6" height="6" rx="1" fill="white" opacity="0.4"/>
    <rect x="23" y="19" width="6" height="6" rx="1" fill="white" opacity="0.4"/>
    <circle cx="31" cy="14" r="4" fill="#fbbf24"/>
    <path d="M29.5 14 L31 15.5 L33.5 12.5" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
);

const FeatureRow = ({ icon, title, desc }) => (
  <div className="flex items-start gap-3">
    <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 text-lg"
      style={{ background: 'rgba(255,255,255,0.1)' }}>
      {icon}
    </div>
    <div>
      <div className="text-sm font-semibold text-white leading-tight">{title}</div>
      <div className="text-xs mt-0.5" style={{ color: 'rgba(255,255,255,0.5)' }}>{desc}</div>
    </div>
  </div>
);

export default function LoginPage() {
  const { login }  = useAuth();
  const navigate   = useNavigate();
  const [email,    setEmail]    = useState('');
  const [password, setPassword] = useState('');
  const [show,     setShow]     = useState(false);
  const [loading,  setLoading]  = useState(false);
  const [focused,  setFocused]  = useState(null);

  async function handleSubmit(e) {
    e.preventDefault();
    if (!email || !password) return toast.error('Fill in all fields');
    setLoading(true);
    try {
      const user = await login(email, password);
      toast.success('Welcome, ' + user.name + '!');
      navigate(ROLE_HOME[user.role] || '/');
    } catch (err) {
      toast.error(err.message || 'Login failed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen w-full flex bg-white overflow-y-auto relative text-slate-800">

      {/* Crosshatch */}
      <div className="absolute inset-0 z-0 pointer-events-none" style={{
        backgroundImage: 'repeating-linear-gradient(22.5deg, transparent, transparent 2px, rgba(75,85,99,0.04) 2px, rgba(75,85,99,0.04) 3px, transparent 3px, transparent 8px), repeating-linear-gradient(67.5deg, transparent, transparent 2px, rgba(107,114,128,0.03) 2px, rgba(107,114,128,0.03) 3px, transparent 3px, transparent 8px)',
      }}/>

      {/* LEFT PANEL */}
      <div className="hidden lg:flex w-[46%] min-h-screen flex-col justify-between px-10 py-10 relative z-10 overflow-hidden"
        style={{ background: 'linear-gradient(145deg, #312e81 0%, #4f46e5 50%, #6d28d9 100%)' }}>

        {/* Grid overlay */}
        <div className="absolute inset-0 pointer-events-none" style={{
          backgroundImage: 'linear-gradient(rgba(255,255,255,0.04) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.04) 1px, transparent 1px)',
          backgroundSize: '40px 40px',
        }}/>
        <div className="absolute -top-24 -right-24 w-80 h-80 rounded-full pointer-events-none"
          style={{ background: 'radial-gradient(circle, rgba(139,92,246,0.4) 0%, transparent 65%)' }}/>
        <div className="absolute -bottom-24 -left-16 w-72 h-72 rounded-full pointer-events-none"
          style={{ background: 'radial-gradient(circle, rgba(99,102,241,0.3) 0%, transparent 65%)' }}/>

        {/* Logo */}
        <div className="flex items-center gap-3 relative z-10">
          <LogoMark size={44}/>
          <div>
            <div className="text-xl font-black text-white leading-none tracking-tight">Counseling Ops</div>
            <div className="text-[10px] font-bold tracking-[0.2em] uppercase mt-1"
              style={{ color: 'rgba(255,255,255,0.45)' }}>CRM Platform</div>
          </div>
        </div>

        {/* Content */}
        <div className="relative z-10 space-y-8">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full px-3 py-1 mb-4 text-[10px] font-bold tracking-widest uppercase"
              style={{ background: 'rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.8)', border: '1px solid rgba(255,255,255,0.15)' }}>
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"/>
              Multi-University Architecture
            </div>
            <h2 className="text-[2.2rem] font-black text-white leading-tight tracking-tight">
              Admissions,<br/>
              <span style={{ color: 'rgba(196,181,253,0.9)' }}>streamlined.</span>
            </h2>
            <p className="mt-3 text-sm leading-relaxed max-w-xs"
              style={{ color: 'rgba(255,255,255,0.5)' }}>
              End-to-end student admission management across centers, counselors, universities, and dispatch.
            </p>
          </div>

          <div className="space-y-4">
            <FeatureRow icon="🎓" title="Multi-University Support"   desc="Isolated workflows per university"/>
            <FeatureRow icon="📋" title="Full Application Lifecycle" desc="Draft → Submit → Verify → Enroll"/>
            <FeatureRow icon="💳" title="Payment Verification"       desc="UPI & Bank Transfer with UTR tracking"/>
            <FeatureRow icon="📦" title="Document Dispatch"          desc="Courier tracking from university to center"/>
          </div>
        </div>

        {/* Stats */}
        <div className="relative z-10 flex items-center gap-8 pt-4 border-t"
          style={{ borderColor: 'rgba(255,255,255,0.1)' }}>
          {[['6', 'User Roles'], ['∞', 'Universities'], ['100%', 'Data Isolated']].map(([val, label]) => (
            <div key={label}>
              <div className="text-2xl font-black text-white leading-none">{val}</div>
              <div className="text-[10px] mt-1" style={{ color: 'rgba(255,255,255,0.4)' }}>{label}</div>
            </div>
          ))}
        </div>
      </div>

      {/* RIGHT PANEL */}
      <div className="flex-1 flex items-center justify-center px-6 py-12 lg:py-0 lg:px-14 relative z-10">
        <div className="w-full max-w-[360px]">

          {/* Mobile logo */}
          <div className="flex items-center gap-3 mb-8 lg:hidden">
            <LogoMark size={36}/>
            <div>
              <div className="text-base font-black text-slate-900">Counseling Ops CRM</div>
              <div className="text-[9px] font-bold text-slate-400 tracking-widest uppercase">Platform</div>
            </div>
          </div>

          <div className="mb-8">
            <h1 className="text-[1.7rem] font-black text-slate-900 tracking-tight leading-tight mb-1.5">
              Welcome back
            </h1>
            <p className="text-slate-500 text-sm">Sign in to access your portal</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-[10px] font-bold text-slate-500 mb-1.5 tracking-[0.12em] uppercase">
                Email Address
              </label>
              <div className={`flex items-center bg-white border rounded-xl transition-all duration-200 ${
                focused === 'email' ? 'border-indigo-500 ring-4 ring-indigo-500/10 shadow-sm' : 'border-slate-200 hover:border-slate-300'
              }`}>
                <span className="pl-3.5 text-slate-400 flex-shrink-0"><MailIcon/></span>
                <input type="email" value={email} onChange={e => setEmail(e.target.value)}
                  onFocus={() => setFocused('email')} onBlur={() => setFocused(null)}
                  placeholder="you@example.com" autoComplete="email" required
                  className="w-full py-3 px-2.5 text-sm text-slate-800 placeholder-slate-400 bg-transparent outline-none"/>
              </div>
            </div>

            <div>
              <label className="block text-[10px] font-bold text-slate-500 mb-1.5 tracking-[0.12em] uppercase">
                Password
              </label>
              <div className={`flex items-center bg-white border rounded-xl transition-all duration-200 ${
                focused === 'password' ? 'border-indigo-500 ring-4 ring-indigo-500/10 shadow-sm' : 'border-slate-200 hover:border-slate-300'
              }`}>
                <span className="pl-3.5 text-slate-400 flex-shrink-0"><LockIcon/></span>
                <input type={show ? 'text' : 'password'} value={password}
                  onChange={e => setPassword(e.target.value)}
                  onFocus={() => setFocused('password')} onBlur={() => setFocused(null)}
                  placeholder="••••••••••" autoComplete="current-password" required
                  className="w-full py-3 px-2.5 text-sm text-slate-800 placeholder-slate-400 bg-transparent outline-none"/>
                <button type="button" onClick={() => setShow(p => !p)}
                  className="pr-3.5 text-slate-400 hover:text-slate-600 transition-colors flex-shrink-0">
                  <EyeIcon open={show}/>
                </button>
              </div>
            </div>

            <button type="submit" disabled={loading}
              className="w-full py-3 rounded-xl font-bold text-sm text-white flex items-center justify-center gap-2 transition-all duration-200 active:scale-[0.98] disabled:opacity-70 mt-1"
              style={{
                background: 'linear-gradient(135deg, #4f46e5 0%, #6d28d9 100%)',
                boxShadow: '0 4px 16px rgba(79,70,229,0.35), 0 1px 3px rgba(79,70,229,0.12)',
              }}>
              {loading ? (
                <>
                  <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                  </svg>
                  Signing in…
                </>
              ) : (
                <>
                  Sign In
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/>
                  </svg>
                </>
              )}
            </button>
          </form>

          {/* Demo accounts */}
          {/* <div className="mt-6 pt-5 border-t border-slate-100">
            <p className="text-[10px] font-bold text-slate-400 tracking-[0.12em] uppercase mb-2.5">
              Demo accounts · password: password123
            </p>
            <div className="grid grid-cols-2 gap-1.5">
              {DEMO_ACCOUNTS.map(a => (
                <button key={a.email}
                  onClick={() => { setEmail(a.email); setPassword('password123'); }}
                  className="text-left text-xs px-2.5 py-2 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 hover:border-slate-300 transition-all duration-150 group">
                  <div className="flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: a.color }}/>
                    <span className="font-semibold text-slate-700 group-hover:text-slate-900">{a.label}</span>
                  </div>
                  <span className="text-[10px] text-slate-400 block truncate mt-0.5 pl-3.5">{a.email}</span>
                </button>
              ))}
            </div>
          </div> */}

          <p className="text-center text-[10.5px] text-slate-400 mt-5">
            © 2026 Counseling Ops CRM · All rights reserved
          </p>
        </div>
      </div>
    </div>
  );
}
