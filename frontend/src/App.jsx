import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { Suspense, lazy } from 'react';
import { Toaster } from '@/components/ui/sonner';
import { useAuth } from '@/context/AuthContext';
import { AppLayout } from '@/components/AppLayout';
import LoginPage from '@/pages/LoginPage';

// ── Lazy pages ───────────────────────────────────────────────
const DashboardPage        = lazy(() => import('@/pages/DashboardPage'));
const CenterPortalPage     = lazy(() => import('@/pages/CenterPortalPage'));
const StudentDetailPage    = lazy(() => import('@/pages/StudentDetailPage'));
const CounselorPage        = lazy(() => import('@/pages/CounselorPage'));
const AccountantPage       = lazy(() => import('@/pages/AccountantPage'));
const UniversityPage       = lazy(() => import('@/pages/UniversityPage'));
const UniversityManagePage = lazy(() => import('@/pages/UniversityManagePage'));
const DispatchPage         = lazy(() => import('@/pages/DispatchPage'));
const StudentsPage         = lazy(() => import('@/pages/StudentsPage'));
const CentersPage          = lazy(() => import('@/pages/CentersPage'));
const SettingsPage         = lazy(() => import('@/pages/SettingsPage'));
const ActivityLogPage      = lazy(() => import('@/pages/ActivityLogPage'));
const NotFoundPage         = lazy(() => import('@/pages/NotFoundPage'));

const Spin = () => (
  <div className="flex h-screen items-center justify-center">
    <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
  </div>
);
const W = ({ children }) => <Suspense fallback={<Spin />}>{children}</Suspense>;

// Role → home route mapping
const ROLE_HOME = {
  Admin:      '/',
  Counselor:  '/counselor',
  Center:     '/center',
  Accountant: '/accountant',
  University: '/university',
  Dispatch:   '/dispatch',
};

// Routes each role can access
const ROLE_ALLOWED = {
  Center:     ['/center', '/students/'],
  Accountant: ['/accountant', '/students/'],
  University: ['/university', '/students/'],
  Dispatch:   ['/dispatch', '/students/'],
  Counselor:  ['/counselor', '/students', '/centers', '/settings', '/dashboard'],
};

function ProtectedRoute({ children }) {
  const { user } = useAuth();
  const location = useLocation();
  if (!user) return <Navigate to="/login" replace />;

  const home = ROLE_HOME[user.role] || '/';
  if (location.pathname === '/' && user.role !== 'Admin') {
    return <Navigate to={home} replace />;
  }

  const allowed = ROLE_ALLOWED[user.role];
  if (allowed && !allowed.some(p => location.pathname === p || location.pathname.startsWith(p))) {
    return <Navigate to={home} replace />;
  }

  return children;
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/" element={<ProtectedRoute><AppLayout /></ProtectedRoute>}>
          <Route index element={<W><DashboardPage /></W>} />
          {/* Center portal */}
          <Route path="center"              element={<W><CenterPortalPage /></W>} />
          <Route path="students/:id"        element={<W><StudentDetailPage /></W>} />
          {/* Counselor */}
          <Route path="counselor"           element={<W><CounselorPage /></W>} />
          {/* Accountant */}
          <Route path="accountant"          element={<W><AccountantPage /></W>} />
          {/* University portal (for University role) */}
          <Route path="university"          element={<W><UniversityPage /></W>} />
          {/* University management (Admin only) */}
          <Route path="universities"        element={<W><UniversityManagePage /></W>} />
          {/* Dispatch */}
          <Route path="dispatch"            element={<W><DispatchPage /></W>} />
          {/* Admin / Counselor shared */}
          <Route path="students"            element={<W><StudentsPage /></W>} />
          <Route path="centers"             element={<W><CentersPage /></W>} />
          <Route path="settings"            element={<W><SettingsPage /></W>} />
          <Route path="activity"            element={<W><ActivityLogPage /></W>} />
          <Route path="*"                   element={<W><NotFoundPage /></W>} />
        </Route>
      </Routes>
      <Toaster richColors position="top-right" />
    </BrowserRouter>
  );
}

