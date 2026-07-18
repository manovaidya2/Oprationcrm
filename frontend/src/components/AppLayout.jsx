import { Outlet, Link, useLocation, useNavigate } from 'react-router-dom';
import { useState, useEffect, useMemo } from 'react';
import {
  LayoutDashboard, Building2, GraduationCap, UserCog, Settings, Activity,
  Bell, LogOut, Menu, X, ChevronRight, IndianRupee,
  Package, Truck, BookOpen, University, XCircle, MessageSquare, LifeBuoy,
  CalendarClock,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useAuth } from '@/context/AuthContext';
import { notifApi } from '@/lib/api';
import { toast } from 'sonner';

// Role-based nav config
const NAV_CONFIG = {
  Admin: [
    { to: '/',             label: 'Dashboard',    icon: LayoutDashboard },
    { to: '/students',     label: 'Students',     icon: GraduationCap },
    { to: '/centers',      label: 'Centers',      icon: Building2 },
    { to: '/document-inventory', label: 'Doc Inventory', icon: Package },
    { to: '/chat',         label: 'Team Chat',    icon: MessageSquare },
    { to: '/universities', label: 'Universities', icon: University },
    { to: '/activity',          label: 'Activity Log',      icon: Activity },
    { to: '/rejected-payments', label: 'Rejected Payments', icon: XCircle },
    { to: '/settings',          label: 'Settings',          icon: Settings },
  ],
  Counselor: [
    { to: '/counselor', label: 'Applications', icon: LayoutDashboard },
    { to: '/students',  label: 'Students',     icon: GraduationCap },
    { to: '/centers',   label: 'Centers',      icon: Building2 },
    { to: '/document-inventory', label: 'Doc Inventory', icon: Package },
    { to: '/chat',      label: 'Team Chat',    icon: MessageSquare },
  ],
  Center: [
    { to: '/center', label: 'My Students', icon: GraduationCap },
    { to: '/help',   label: 'Help',        icon: LifeBuoy },
  ],
  Accountant: [
    { to: '/accountant', label: 'Fee Verification', icon: IndianRupee },
    { to: '/students',   label: 'Students',         icon: GraduationCap },
    { to: '/document-inventory', label: 'Doc Inventory', icon: Package },
    { to: '/chat',       label: 'Team Chat',        icon: MessageSquare },
  ],
  University: [
    { to: '/university', label: 'Student Records', icon: BookOpen },
    { to: '/chat',       label: 'Team Chat',       icon: MessageSquare },
  ],
  Dispatch: [
    { to: '/dispatch', label: 'Documents', icon: Package },
    { to: '/students', label: 'Students', icon: GraduationCap },
    { to: '/document-inventory', label: 'Inventory', icon: BookOpen },
    { to: '/chat', label: 'Team Chat', icon: MessageSquare },
  ],
  PaymentCoordinator: [
    { to: '/payment-coordinator', label: 'Installments', icon: CalendarClock },
    { to: '/payment-due-timeline', label: 'Old Student Records', icon: IndianRupee },
    { to: '/students', label: 'Students', icon: GraduationCap },
    { to: '/document-inventory', label: 'Doc Inventory', icon: BookOpen },
    { to: '/chat', label: 'Team Chat', icon: MessageSquare },
  ],
};

const ROLE_COLORS = {
  Admin:      'bg-red-500',
  Counselor:  'bg-indigo-500',
  Center:     'bg-sky-500',
  Accountant: 'bg-amber-500',
  University: 'bg-purple-500',
  Dispatch:   'bg-teal-500',
  PaymentCoordinator: 'bg-cyan-500',
};

export function AppLayout() {
  const { user, logout } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [notifs, setNotifs] = useState([]);
  const [showNotifs, setShowNotifs] = useState(false);

  const baseNavItems = NAV_CONFIG[user?.role] || [];
  const navItems = user?.role && user.role !== 'Center' && !baseNavItems.some(item => item.to === '/chat')
    ? [...baseNavItems, { to: '/chat', label: 'Team Chat', icon: MessageSquare }]
    : baseNavItems;
  const unread = notifs.filter(n => !n.read).length;
  const chatUnread = notifs.filter(n => !n.read && ['help_ticket', 'ticket_message', 'chat_message'].includes(n.type)).length;

  useEffect(() => {
    notifApi.list().then(setNotifs).catch(() => {});
    const iv = setInterval(() => {
      notifApi.list().then(newNotifs => {
        setNotifs(prev => {
          // Check for genuinely new unread notifications
          const prevUnread = prev.filter(n => !n.read).map(n => n._id);
          const newUnread  = newNotifs.filter(n => !n.read);
          const brandNew   = newUnread.filter(n => !prevUnread.includes(n._id));
          if (brandNew.length > 0) {
            brandNew.slice(0, 3).forEach(n => {
              toast.info(n.message, { duration: 5000 });
            });
          }
          return newNotifs;
        });
      }).catch(() => {});
    }, 10000); // poll every 10 seconds
    return () => clearInterval(iv);
  }, []);

  async function markAllRead() {
    try { await notifApi.readAll(); setNotifs(p => p.map(n => ({ ...n, read: true }))); }
    catch { toast.error('Failed to mark read'); }
  }

  const initials = user?.name?.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase() || 'U';
  const roleColor = ROLE_COLORS[user?.role] || 'bg-gray-500';

  return (
    <div className="min-h-screen bg-background flex">
      {/* Sidebar */}
      <aside className={cn(
        'fixed inset-y-0 left-0 z-40 flex w-60 flex-col border-r bg-card transition-transform duration-200',
        open ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
      )}>
        {/* Brand */}
        <div className="flex h-14 items-center gap-3 border-b px-4">
          <div className={cn('h-7 w-7 rounded-lg flex items-center justify-center text-white text-xs font-bold shrink-0', roleColor)}>
            {user?.role?.[0]}
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-semibold leading-none">EduCRM</div>
            <div className="text-xs text-muted-foreground mt-0.5 truncate">
              {user?.role === 'University' && user?.universityId
                ? typeof user.universityId === 'object'
                  ? user.universityId.name
                  : user.role
                : user?.role}
            </div>
          </div>
          <button className="ml-auto lg:hidden" onClick={() => setOpen(false)}><X className="h-4 w-4" /></button>
        </div>

        {/* Nav */}
        <nav className="flex-1 overflow-y-auto p-3 space-y-1">
          {navItems.map(item => {
            const active = item.to === '/' ? location.pathname === '/' : location.pathname.startsWith(item.to);
            return (
              <Link key={item.to} to={item.to} onClick={() => setOpen(false)}
                className={cn(
                  'flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition-colors',
                  active ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-accent hover:text-foreground'
                )}>
                <item.icon className="h-4 w-4 flex-shrink-0" />
                {item.label}
                {['/chat', '/help'].includes(item.to) && chatUnread > 0 && (
                  <span className={cn(
                    'ml-auto flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-[10px] font-bold',
                    active ? 'bg-white text-primary' : 'bg-red-500 text-white'
                  )}>
                    {chatUnread > 9 ? '9+' : chatUnread}
                  </span>
                )}
                {active && <ChevronRight className="h-3.5 w-3.5 ml-auto" />}
              </Link>
            );
          })}
        </nav>

        {/* User info */}
        <div className="border-t p-3">
          <div className="flex items-center gap-2.5 mb-2">
            <div className={cn('h-8 w-8 rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0', roleColor)}>
              {initials}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium truncate">{user?.name}</div>
              <div className="text-xs text-muted-foreground truncate">{user?.email}</div>
            </div>
          </div>
          <Button variant="ghost" size="sm" className="w-full justify-start text-muted-foreground hover:text-foreground" onClick={logout}>
            <LogOut className="h-4 w-4 mr-2" /> Logout
          </Button>
        </div>
      </aside>

      {/* Overlay */}
      {open && <div className="fixed inset-0 z-30 bg-black/40 lg:hidden" onClick={() => setOpen(false)} />}

      {/* Main */}
      <div className="flex-1 flex flex-col lg:ml-60 min-h-screen">
        {/* Top bar */}
        <header className="sticky top-0 z-20 flex h-14 items-center border-b bg-card/95 backdrop-blur px-4 gap-3">
          <button className="lg:hidden" onClick={() => setOpen(true)}><Menu className="h-5 w-5" /></button>
          <div className="flex-1" />

          {/* Notifications */}
          <div className="relative">
            <button className="relative p-2 rounded-lg hover:bg-accent" onClick={() => { setShowNotifs(p => !p); if (unread > 0) markAllRead(); }}>
              <Bell className="h-5 w-5" />
              {unread > 0 && (
                <span className="absolute -top-0.5 -right-0.5 h-4 w-4 rounded-full bg-red-500 text-white text-[10px] flex items-center justify-center font-bold">
                  {unread > 9 ? '9+' : unread}
                </span>
              )}
            </button>

            {showNotifs && (
              <div className="absolute right-0 top-full mt-2 w-80 rounded-xl border bg-card shadow-xl z-50">
                <div className="flex items-center justify-between border-b px-4 py-2.5">
                  <span className="text-sm font-semibold">Notifications</span>
                  <button onClick={() => setShowNotifs(false)}><X className="h-4 w-4" /></button>
                </div>
                <div className="max-h-80 overflow-y-auto">
                  {notifs.length === 0 ? (
                    <div className="py-8 text-center text-sm text-muted-foreground">No notifications</div>
                  ) : notifs.slice(0, 20).map(n => (
                    <div key={n._id} className={cn('px-4 py-3 text-sm border-b last:border-0', !n.read && 'bg-blue-50 dark:bg-blue-950/20')}>
                      <div className={cn(!n.read && 'font-medium')}>{n.message}</div>
                      <div className="text-xs text-muted-foreground mt-0.5">
                        {new Date(n.at).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 p-4 md:p-6 max-w-6xl mx-auto w-full">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
