import { useState, useEffect, useCallback } from 'react';
import {
  Plus, Pencil, Trash2, Loader2, Building2, CheckCircle2,
  Users, GraduationCap, Search, X, Eye, EyeOff, KeyRound,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { toast } from 'sonner';
import { universitiesApi, authApi } from '@/lib/api';

const COLORS = ['#6366f1','#10b981','#f59e0b','#ef4444','#8b5cf6','#06b6d4','#ec4899','#14b8a6'];

const initUniForm = { name:'', shortName:'', email:'', phone:'', city:'', state:'', website:'', avatarColor:'#6366f1' };
const initUserForm = { name:'', email:'', password:'' };

function StatBadge({ label, value, color = 'bg-muted' }) {
  return (
    <div className={`flex flex-col items-center rounded-lg px-4 py-2 ${color}`}>
      <span className="text-lg font-bold">{value}</span>
      <span className="text-xs text-muted-foreground">{label}</span>
    </div>
  );
}

export default function UniversityManagePage() {
  const [universities, setUniversities] = useState([]);
  const [users,        setUsers]        = useState([]);
  const [loading,      setLoading]      = useState(true);
  const [search,       setSearch]       = useState('');
  const [saving,       setSaving]       = useState(false);

  // University form dialog
  const [uniOpen,   setUniOpen]   = useState(false);
  const [editUni,   setEditUni]   = useState(null); // null = create
  const [uniForm,   setUniForm]   = useState(initUniForm);

  // Create user for university dialog
  const [userOpen,  setUserOpen]  = useState(false);
  const [selUni,    setSelUni]    = useState(null);
  const [userForm,  setUserForm]  = useState(initUserForm);
  const [showPwd,   setShowPwd]   = useState(false);

  // Stats per university
  const [statsMap,  setStatsMap]  = useState({});

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [unis, usrs] = await Promise.all([
        universitiesApi.getAll(),
        authApi.listUsers('University'),
      ]);
      setUniversities(unis);
      setUsers(usrs);
      // Load stats for each university
      const statsResults = await Promise.all(unis.map(u => universitiesApi.stats(u._id).catch(() => ({}))));
      const map = {};
      unis.forEach((u, i) => { map[u._id] = statsResults[i]; });
      setStatsMap(map);
    } catch {
      toast.error('Failed to load universities');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const openCreate = () => { setEditUni(null); setUniForm(initUniForm); setUniOpen(true); };
  const openEdit   = uni => { setEditUni(uni); setUniForm({ name: uni.name, shortName: uni.shortName||'', email: uni.email||'', phone: uni.phone||'', city: uni.city||'', state: uni.state||'', website: uni.website||'', avatarColor: uni.avatarColor||'#6366f1' }); setUniOpen(true); };

  const saveUni = async () => {
    if (!uniForm.name.trim()) return toast.error('University name is required');
    setSaving(true);
    try {
      if (editUni) {
        await universitiesApi.update(editUni._id, uniForm);
        toast.success('University updated');
      } else {
        await universitiesApi.create(uniForm);
        toast.success('University created');
      }
      setUniOpen(false);
      load();
    } catch (e) {
      toast.error(e.message || 'Failed to save university');
    } finally {
      setSaving(false);
    }
  };

  const deleteUni = async (uni) => {
    if (!confirm(`Delete "${uni.name}"? This cannot be undone.`)) return;
    try {
      await universitiesApi.delete(uni._id);
      toast.success('University deleted');
      load();
    } catch (e) {
      toast.error(e.message || 'Cannot delete');
    }
  };

  const openCreateUser = (uni) => {
    setSelUni(uni);
    setUserForm({ name: uni.name + ' Portal', email: '', password: '' });
    setShowPwd(false);
    setUserOpen(true);
  };

  const saveUser = async () => {
    if (!userForm.name || !userForm.email || !userForm.password) return toast.error('All fields required');
    if (userForm.password.length < 6) return toast.error('Password min 6 characters');
    setSaving(true);
    try {
      await authApi.createUser({
        name: userForm.name,
        email: userForm.email,
        password: userForm.password,
        role: 'University',
        universityId: selUni._id,
        avatarColor: selUni.avatarColor,
      });
      toast.success(`Login created for ${selUni.name}`);
      setUserOpen(false);
      load();
    } catch (e) {
      toast.error(e.message || 'Failed to create login');
    } finally {
      setSaving(false);
    }
  };

  const toggleUser = async (u) => {
    const action = u.isActive ? 'deactivate' : 'activate';
    const msg = u.isActive
      ? `Deactivate "${u.name}"? They will not be able to login until reactivated.`
      : `Activate "${u.name}"? They will be able to login again.`;
    if (!confirm(msg)) return;
    try {
      await authApi.toggleUser(u._id);
      toast.success(`User ${action}d successfully`);
      load();
    } catch (e) {
      toast.error(e.message);
    }
  };

  const filtered = universities.filter(u =>
    u.name.toLowerCase().includes(search.toLowerCase()) ||
    (u.shortName||'').toLowerCase().includes(search.toLowerCase()) ||
    (u.city||'').toLowerCase().includes(search.toLowerCase())
  );

  // Users per university map
  const uniUsersMap = {};
  users.forEach(u => {
    const uid = String(u.universityId?._id || u.universityId);
    if (!uniUsersMap[uid]) uniUsersMap[uid] = [];
    uniUsersMap[uid].push(u);
  });

  return (
    <div className="space-y-6 p-4">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Building2 className="h-6 w-6 text-primary"/>
            University Management
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            Add, configure, and manage university portals independently
          </p>
        </div>
        <Button onClick={openCreate} className="gap-2">
          <Plus className="h-4 w-4"/> Add University
        </Button>
      </div>

      {/* Search */}
      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground"/>
        <Input className="pl-9" placeholder="Search universities..." value={search} onChange={e => setSearch(e.target.value)}/>
        {search && <button onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2"><X className="h-4 w-4 text-muted-foreground"/></button>}
      </div>

      {loading ? (
        <div className="flex justify-center py-16"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground"/></div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <Building2 className="h-12 w-12 mx-auto mb-3 opacity-30"/>
          <p className="font-medium">No universities found</p>
          <p className="text-sm">Click "Add University" to create the first one</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {filtered.map(uni => {
            const stats = statsMap[uni._id] || {};
            const uniUsers = uniUsersMap[String(uni._id)] || [];
            return (
              <Card key={uni._id} className="border-l-4" style={{ borderLeftColor: uni.avatarColor || '#6366f1' }}>
                <CardHeader className="pb-2">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-3">
                      <div className="h-10 w-10 rounded-full flex items-center justify-center text-white text-sm font-bold shrink-0"
                           style={{ background: uni.avatarColor || '#6366f1' }}>
                        {uni.shortName || uni.name.slice(0,2).toUpperCase()}
                      </div>
                      <div>
                        <CardTitle className="text-base">{uni.name}</CardTitle>
                        <p className="text-xs text-muted-foreground">{[uni.city, uni.state].filter(Boolean).join(', ')}</p>
                      </div>
                    </div>
                    <div className="flex gap-1 shrink-0">
                      <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => openEdit(uni)} title="Edit">
                        <Pencil className="h-3.5 w-3.5"/>
                      </Button>
                      <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive hover:text-destructive" onClick={() => deleteUni(uni)} title="Delete">
                        <Trash2 className="h-3.5 w-3.5"/>
                      </Button>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  {/* Stats */}
                  <div className="flex flex-wrap gap-2">
  <StatBadge label="Total Students" value={stats.totalStudents ?? '—'} color="bg-slate-50"/>
  <StatBadge label="Pending Enroll" value={stats.pendingEnrollment ?? '—'} color="bg-amber-50"/>
  <StatBadge label="Enrolled" value={stats.enrolled ?? '—'} color="bg-emerald-50"/>
  <StatBadge label="Doc Requests" value={stats.pendingDocs ?? '—'} color="bg-blue-50"/>
  <StatBadge label="Dispatched" value={stats.dispatched ?? '—'} color="bg-teal-50"/>
</div>

                  {/* Contact info */}
                  {(uni.email || uni.phone || uni.website) && (
                    <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                      {uni.email   && <span>✉ {uni.email}</span>}
                      {uni.phone   && <span>📞 {uni.phone}</span>}
                      {uni.website && <a href={uni.website} target="_blank" rel="noreferrer" className="text-blue-600 underline">🌐 Website</a>}
                    </div>
                  )}

                  {/* University Users (logins) */}
                  <div className="border rounded-lg p-2.5 bg-muted/30">
                    <div className="flex items-center justify-between mb-2">
                      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1">
                        <KeyRound className="h-3 w-3"/> Login Accounts ({uniUsers.length})
                      </p>
                      <Button size="sm" variant="outline" className="h-6 text-xs px-2 gap-1" onClick={() => openCreateUser(uni)}>
                        <Plus className="h-3 w-3"/> Add Login
                      </Button>
                    </div>
                    {uniUsers.length === 0 ? (
                      <p className="text-xs text-muted-foreground italic">No login accounts yet — click "Add Login" to create one</p>
                    ) : (
                      <div className="space-y-1">
                        {uniUsers.map(u => (
                          <div key={u._id} className={`flex items-center justify-between rounded px-2 py-1.5 ${u.isActive ? 'bg-background' : 'bg-muted/50 opacity-70'}`}>
                            <div className="flex items-center gap-2 min-w-0">
                              <div className="h-6 w-6 rounded-full flex items-center justify-center text-white text-xs font-bold shrink-0"
                                   style={{ background: u.isActive ? (u.avatarColor || '#8b5cf6') : '#94a3b8' }}>
                                {u.name.slice(0,1)}
                              </div>
                              <div className="min-w-0">
                                <p className={`text-xs font-medium truncate ${!u.isActive ? 'line-through text-muted-foreground' : ''}`}>{u.name}</p>
                                <p className="text-xs text-muted-foreground truncate">{u.email}</p>
                              </div>
                            </div>
                            <div className="flex items-center gap-1.5 shrink-0">
                              <Badge variant={u.isActive ? 'default' : 'secondary'} className={`text-xs h-5 ${u.isActive ? 'bg-emerald-100 text-emerald-700 border-emerald-200' : 'bg-red-100 text-red-600 border-red-200'}`}>
                                {u.isActive ? 'Active' : 'Inactive'}
                              </Badge>
                              <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => toggleUser(u)}
                                title={u.isActive ? 'Deactivate (block login)' : 'Activate (allow login)'}>
                                {u.isActive ? <EyeOff className="h-3 w-3 text-amber-500"/> : <Eye className="h-3 w-3 text-emerald-500"/>}
                              </Button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* ── Create/Edit University Dialog ──────────────────── */}
      <Dialog open={uniOpen} onOpenChange={setUniOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editUni ? 'Edit University' : 'Add New University'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2">
                <Label>University Name *</Label>
                <Input value={uniForm.name} onChange={e => setUniForm(p => ({ ...p, name: e.target.value }))} placeholder="e.g. Delhi University"/>
              </div>
              <div>
                <Label>Short Name</Label>
                <Input value={uniForm.shortName} onChange={e => setUniForm(p => ({ ...p, shortName: e.target.value }))} placeholder="e.g. DU"/>
              </div>
              <div>
                <Label>Email</Label>
                <Input value={uniForm.email} onChange={e => setUniForm(p => ({ ...p, email: e.target.value }))} placeholder="contact@university.edu"/>
              </div>
              <div>
                <Label>Phone</Label>
                <Input value={uniForm.phone} onChange={e => setUniForm(p => ({ ...p, phone: e.target.value }))} placeholder="+91 ..." />
              </div>
              <div>
                <Label>Website</Label>
                <Input value={uniForm.website} onChange={e => setUniForm(p => ({ ...p, website: e.target.value }))} placeholder="https://..."/>
              </div>
              <div>
                <Label>City</Label>
                <Input value={uniForm.city} onChange={e => setUniForm(p => ({ ...p, city: e.target.value }))} placeholder="City"/>
              </div>
              <div>
                <Label>State</Label>
                <Input value={uniForm.state} onChange={e => setUniForm(p => ({ ...p, state: e.target.value }))} placeholder="State"/>
              </div>
            </div>
            <div>
              <Label>Brand Color</Label>
              <div className="flex gap-2 mt-1.5 flex-wrap">
                {COLORS.map(c => (
                  <button key={c}
                    className={`h-7 w-7 rounded-full border-2 transition-transform ${uniForm.avatarColor === c ? 'border-foreground scale-110' : 'border-transparent'}`}
                    style={{ background: c }}
                    onClick={() => setUniForm(p => ({ ...p, avatarColor: c }))}
                  />
                ))}
                <input type="color" value={uniForm.avatarColor} onChange={e => setUniForm(p => ({ ...p, avatarColor: e.target.value }))}
                  className="h-7 w-7 rounded cursor-pointer border border-input bg-transparent"/>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setUniOpen(false)}>Cancel</Button>
            <Button onClick={saveUni} disabled={saving}>
              {saving && <Loader2 className="h-4 w-4 mr-1 animate-spin"/>}
              {editUni ? 'Save Changes' : 'Create University'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Create University Login Dialog ─────────────────── */}
      <Dialog open={userOpen} onOpenChange={setUserOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Create Login for {selUni?.name}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <p className="text-sm text-muted-foreground">
              This will create a dedicated login account for the university portal. This account will only see students and documents assigned to <strong>{selUni?.name}</strong>.
            </p>
            <div>
              <Label>Display Name *</Label>
              <Input value={userForm.name} onChange={e => setUserForm(p => ({ ...p, name: e.target.value }))} placeholder="e.g. Delhi University Portal"/>
            </div>
            <div>
              <Label>Email *</Label>
              <Input type="email" value={userForm.email} onChange={e => setUserForm(p => ({ ...p, email: e.target.value }))} placeholder="university@email.com"/>
            </div>
            <div>
              <Label>Password *</Label>
              <div className="relative">
                <Input type={showPwd ? 'text' : 'password'} value={userForm.password} onChange={e => setUserForm(p => ({ ...p, password: e.target.value }))} placeholder="Min 6 characters" className="pr-10"/>
                <button className="absolute right-3 top-1/2 -translate-y-1/2" onClick={() => setShowPwd(p => !p)}>
                  {showPwd ? <EyeOff className="h-4 w-4 text-muted-foreground"/> : <Eye className="h-4 w-4 text-muted-foreground"/>}
                </button>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setUserOpen(false)}>Cancel</Button>
            <Button onClick={saveUser} disabled={saving}>
              {saving && <Loader2 className="h-4 w-4 mr-1 animate-spin"/>}
              Create Login
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}