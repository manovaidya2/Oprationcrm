import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Trash2, Key, Loader2, Users, UserPlus, Shield, ToggleLeft, ToggleRight, CreditCard, Pencil, Building2 } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { authApi, centersApi, universitiesApi, paymentAccountsApi } from '@/lib/api';
import { useAuth } from '@/context/AuthContext';

const ROLE_COLORS = {
  Admin:'bg-red-100 text-red-700', Counselor:'bg-indigo-100 text-indigo-700',
  Center:'bg-sky-100 text-sky-700', Accountant:'bg-amber-100 text-amber-700',
  University:'bg-purple-100 text-purple-700', Dispatch:'bg-teal-100 text-teal-700',
};

const ALL_ROLES = ['Admin','Counselor','Center','Accountant','University','Dispatch'];

export default function SettingsPage() {
  const { user: me } = useAuth();
  const navigate = useNavigate();

  const [users,        setUsers]        = useState([]);
  const [centers,      setCenters]      = useState([]);
  const [universities, setUniversities] = useState([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [pwdOpen,    setPwdOpen]    = useState(null);
  const [saving,     setSaving]     = useState(false);
  const [form,  setForm]  = useState({ name:'', email:'', password:'', role:'', centerId:'', universityId:'' });
  const [pwd,   setPwd]   = useState('');

  // Payment Accounts
  const [accounts,     setAccounts]     = useState([]);
  const [accOpen,      setAccOpen]      = useState(false);
  const [editAcc,      setEditAcc]      = useState(null);
  const EMPTY_ACC = { label:'', mode:'UPI', upiId:'', upiName:'', bankName:'', accountHolder:'', accountNumber:'', ifscCode:'', branch:'' };
  const [accForm,      setAccForm]      = useState({ ...EMPTY_ACC });

  useEffect(() => {
    if (me && me.role !== 'Admin') { toast.error('Admin access only'); navigate('/'); }
  }, [me, navigate]);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const [u, c, unis, accs] = await Promise.all([authApi.listUsers(), centersApi.getAll(), universitiesApi.getAll(), paymentAccountsApi.listAll()]);
      setUsers(u); setCenters(c); setUniversities(unis); setAccounts(accs);
    } catch { toast.error('Failed to load'); } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function createUser() {
    if (!form.name || !form.email || !form.password || !form.role) return toast.error('All fields required');
    if (form.role === 'Center' && !form.centerId) return toast.error('Center required for Center role');
    if (form.role === 'University' && !form.universityId) return toast.error('University required for University role');
    setSaving(true);
    try {
      await authApi.createUser(form);
      toast.success('User created'); setCreateOpen(false);
      setForm({ name:'', email:'', password:'', role:'', centerId:'', universityId:'' }); load();
    } catch(e) { toast.error(e.message); } finally { setSaving(false); }
  }

  async function resetPwd() {
    if (!pwd || pwd.length < 6) return toast.error('Min 6 characters');
    setSaving(true);
    try { await authApi.resetPassword(pwdOpen._id, pwd); toast.success('Password updated'); setPwdOpen(null); setPwd(''); }
    catch(e) { toast.error(e.message); } finally { setSaving(false); }
  }

  async function toggleUser(u) {
    try { await authApi.toggleUser(u._id); toast.success(u.isActive?'Deactivated':'Activated'); load(); }
    catch(e) { toast.error(e.message); }
  }

  async function deleteUser(id) {
    if (!confirm('Delete user permanently?')) return;
    try { await authApi.deleteUser(id); toast.success('Deleted'); load(); }
    catch(e) { toast.error(e.message); }
  }

  if (loading) return <div className="flex h-64 items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground"/></div>;

  async function saveAcc() {
    if (!accForm.label.trim()) return toast.error('Account label required');
    if (!accForm.mode) return toast.error('Select payment mode');
    if (accForm.mode === 'UPI' && !accForm.upiId.trim()) return toast.error('UPI ID required');
    if (accForm.mode === 'Bank Transfer' && !accForm.bankName.trim()) return toast.error('Bank name required');
    if (accForm.mode === 'Bank Transfer' && !accForm.accountNumber.trim()) return toast.error('Account number required');
    setSaving(true);
    try {
      if (editAcc) { await paymentAccountsApi.update(editAcc._id, accForm); toast.success('Account updated'); }
      else         { await paymentAccountsApi.create(accForm);               toast.success('Account added'); }
      setAccOpen(false); setEditAcc(null); setAccForm({ ...EMPTY_ACC }); load();
    } catch(e) { toast.error(e.message); } finally { setSaving(false); }
  }

  async function deleteAcc(acc) {
    if (!confirm(`Remove "${acc.label}"?`)) return;
    try { await paymentAccountsApi.remove(acc._id); toast.success('Removed'); load(); }
    catch(e) { toast.error(e.message); }
  }

  const grouped = ALL_ROLES.reduce((acc, r) => { acc[r] = users.filter(u => u.role === r); return acc; }, {});

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold flex items-center gap-2"><Shield className="h-5 w-5"/>User Management</h1>
        <Button size="sm" onClick={() => { setForm({ name:'', email:'', password:'', role:'', centerId:'', universityId:'' }); setCreateOpen(true); }}>
          <UserPlus className="h-4 w-4 mr-1"/>Create User
        </Button>
      </div>

      <div className="text-sm text-muted-foreground">{users.length} total users across {ALL_ROLES.length} roles</div>

      {ALL_ROLES.map(role => {
        const roleUsers = grouped[role] || [];
        if (roleUsers.length === 0) return null;
        return (
          <Card key={role}>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${ROLE_COLORS[role]}`}>{role}</span>
                <span className="text-muted-foreground font-normal">({roleUsers.length})</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {roleUsers.map(u => (
                <div key={u._id} className={`flex items-center justify-between gap-3 rounded-lg px-3 py-2 ${u.isActive===false?'opacity-50 bg-muted/30':'bg-muted/20'}`}>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium">{u.name} {String(u._id)===String(me._id||me.id) && <span className="text-xs text-muted-foreground">(you)</span>}</div>
                    <div className="text-xs text-muted-foreground truncate">{u.email}</div>
                    {u.centerId?.name && <div className="text-xs text-sky-600">{u.centerId.name}</div>}
                    {u.universityId?.name && <div className="text-xs text-purple-600">🎓 {u.universityId.name}</div>}
                  </div>
                  {String(u._id) !== String(me._id||me.id) && (
                    <div className="flex gap-1 flex-shrink-0">
                      <Button variant="ghost" size="sm" title={u.isActive===false?'Activate':'Deactivate'} onClick={()=>toggleUser(u)}>
                        {u.isActive===false ? <ToggleLeft className="h-4 w-4 text-gray-400"/> : <ToggleRight className="h-4 w-4 text-green-600"/>}
                      </Button>
                      <Button variant="ghost" size="sm" title="Reset Password" onClick={()=>{ setPwdOpen(u); setPwd(''); }}>
                        <Key className="h-3.5 w-3.5"/>
                      </Button>
                      <Button variant="ghost" size="sm" title="Delete" className="text-red-500 hover:text-red-700 hover:bg-red-50" onClick={()=>deleteUser(u._id)}>
                        <Trash2 className="h-3.5 w-3.5"/>
                      </Button>
                    </div>
                  )}
                </div>
              ))}
            </CardContent>
          </Card>
        );
      })}

      {/* ── Payment Accounts Section ─────────────────────── */}
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2">
              <CreditCard className="h-4 w-4 text-indigo-600"/>Payment Accounts
            </CardTitle>
            <Button size="sm" onClick={() => { setEditAcc(null); setAccForm({ ...EMPTY_ACC }); setAccOpen(true); }}>
              <Plus className="h-4 w-4 mr-1"/>Add Account
            </Button>
          </div>
          <p className="text-xs text-muted-foreground mt-1">Company accounts shown to centers when recording payments</p>
        </CardHeader>
        <CardContent className="space-y-2">
          {accounts.length === 0
            ? <p className="text-sm text-muted-foreground italic text-center py-4">No payment accounts yet — add one above</p>
            : accounts.map(acc => (
              <div key={acc._id} className={`flex items-center justify-between rounded-lg border px-4 py-3 ${acc.isActive ? 'bg-background' : 'bg-muted/30 opacity-60'}`}>
                <div className="flex items-center gap-3 min-w-0">
                  <div className={`h-8 w-8 rounded-lg flex items-center justify-center flex-shrink-0 ${acc.mode === 'UPI' ? 'bg-blue-100' : 'bg-emerald-100'}`}>
                    <CreditCard className={`h-4 w-4 ${acc.mode === 'UPI' ? 'text-blue-600' : 'text-emerald-600'}`}/>
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-sm">{acc.label}</span>
                      <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${acc.mode === 'UPI' ? 'bg-blue-100 text-blue-700' : 'bg-emerald-100 text-emerald-700'}`}>{acc.mode}</span>
                      {!acc.isActive && <span className="text-xs bg-red-100 text-red-600 px-1.5 py-0.5 rounded">Inactive</span>}
                    </div>
                    <div className="text-xs text-muted-foreground mt-0.5">
                      {acc.mode === 'UPI' && acc.upiId && <span>UPI: <span className="font-mono font-medium">{acc.upiId}</span>{acc.upiName ? ` — ${acc.upiName}` : ''}</span>}
                      {acc.mode === 'Bank Transfer' && <span>{acc.bankName}{acc.accountNumber ? ` · A/C: ${acc.accountNumber}` : ''}{acc.ifscCode ? ` · ${acc.ifscCode}` : ''}</span>}
                    </div>
                  </div>
                </div>
                <div className="flex gap-1 flex-shrink-0">
                  <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => { setEditAcc(acc); setAccForm({ label:acc.label, mode:acc.mode, upiId:acc.upiId||'', upiName:acc.upiName||'', bankName:acc.bankName||'', accountHolder:acc.accountHolder||'', accountNumber:acc.accountNumber||'', ifscCode:acc.ifscCode||'', branch:acc.branch||'' }); setAccOpen(true); }}>
                    <Pencil className="h-3.5 w-3.5"/>
                  </Button>
                  <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive hover:text-destructive" onClick={() => deleteAcc(acc)}>
                    <Trash2 className="h-3.5 w-3.5"/>
                  </Button>
                </div>
              </div>
            ))
          }
        </CardContent>
      </Card>

      {/* Create User Dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Create User</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label>Full Name *</Label><Input value={form.name} onChange={e=>setForm(p=>({...p,name:e.target.value}))}/></div>
            <div><Label>Email *</Label><Input type="email" value={form.email} onChange={e=>setForm(p=>({...p,email:e.target.value}))}/></div>
            <div><Label>Password *</Label><Input type="password" value={form.password} onChange={e=>setForm(p=>({...p,password:e.target.value}))} placeholder="Min 6 characters"/></div>
            <div>
              <Label>Role *</Label>
              <Select value={form.role} onValueChange={v=>setForm(p=>({...p,role:v,centerId:'',universityId:''}))}>
                <SelectTrigger><SelectValue placeholder="Select role…"/></SelectTrigger>
                <SelectContent>{ALL_ROLES.map(r=><SelectItem key={r} value={r}>{r}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            {form.role === 'Center' && (
              <div>
                <Label>Assign to Center *</Label>
                <Select value={form.centerId} onValueChange={v=>setForm(p=>({...p,centerId:v}))}>
                  <SelectTrigger><SelectValue placeholder="Select center…"/></SelectTrigger>
                  <SelectContent>{centers.map(c=><SelectItem key={c._id} value={c._id}>{c.name} — {c.city}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            )}
            {form.role === 'University' && (
              <div>
                <Label>Assign to University *</Label>
                <Select value={form.universityId} onValueChange={v=>setForm(p=>({...p,universityId:v}))}>
                  <SelectTrigger><SelectValue placeholder="Select university…"/></SelectTrigger>
                  <SelectContent>{universities.map(u=><SelectItem key={u._id} value={u._id}>{u.name}{u.shortName?` (${u.shortName})`:''}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={()=>setCreateOpen(false)}>Cancel</Button>
            <Button onClick={createUser} disabled={saving}>{saving&&<Loader2 className="h-4 w-4 mr-1 animate-spin"/>}Create</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reset Password Dialog */}
      <Dialog open={!!pwdOpen} onOpenChange={()=>setPwdOpen(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Reset Password: {pwdOpen?.name}</DialogTitle></DialogHeader>
          <div><Label>New Password *</Label><Input type="password" value={pwd} onChange={e=>setPwd(e.target.value)} placeholder="Min 6 characters"/></div>
          <DialogFooter>
            <Button variant="outline" onClick={()=>setPwdOpen(null)}>Cancel</Button>
            <Button onClick={resetPwd} disabled={saving}>{saving&&<Loader2 className="h-4 w-4 mr-1 animate-spin"/>}Reset</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add/Edit Payment Account Dialog */}
      <Dialog open={accOpen} onOpenChange={v => { setAccOpen(v); if (!v) { setEditAcc(null); setAccForm({ ...EMPTY_ACC }); } }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CreditCard className="h-4 w-4 text-indigo-600"/>
              {editAcc ? 'Edit Payment Account' : 'Add Payment Account'}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Display Label *</Label>
              <Input value={accForm.label} onChange={e=>setAccForm(p=>({...p,label:e.target.value}))} placeholder="e.g. Main SBI Account, Company UPI" className="mt-1"/>
            </div>
            <div>
              <Label>Payment Mode *</Label>
              <Select value={accForm.mode} onValueChange={v=>setAccForm(p=>({...p,mode:v}))}>
                <SelectTrigger className="mt-1"><SelectValue/></SelectTrigger>
                <SelectContent>
                  <SelectItem value="UPI">UPI</SelectItem>
                  <SelectItem value="Bank Transfer">Bank Transfer</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {accForm.mode === 'UPI' && (
              <div className="space-y-2 p-3 bg-blue-50 border border-blue-200 rounded-xl">
                <p className="text-xs font-bold text-blue-700 uppercase tracking-wider">UPI Details</p>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <Label className="text-xs">UPI ID *</Label>
                    <Input value={accForm.upiId} onChange={e=>setAccForm(p=>({...p,upiId:e.target.value}))} placeholder="name@bank" className="mt-0.5 h-9 text-sm font-mono"/>
                  </div>
                  <div>
                    <Label className="text-xs">UPI Name</Label>
                    <Input value={accForm.upiName} onChange={e=>setAccForm(p=>({...p,upiName:e.target.value}))} placeholder="Account name" className="mt-0.5 h-9 text-sm"/>
                  </div>
                </div>
              </div>
            )}
            {accForm.mode === 'Bank Transfer' && (
              <div className="space-y-2 p-3 bg-emerald-50 border border-emerald-200 rounded-xl">
                <p className="text-xs font-bold text-emerald-700 uppercase tracking-wider">Bank Details</p>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <Label className="text-xs">Bank Name *</Label>
                    <Input value={accForm.bankName} onChange={e=>setAccForm(p=>({...p,bankName:e.target.value}))} placeholder="e.g. SBI, HDFC" className="mt-0.5 h-9 text-sm"/>
                  </div>
                  <div>
                    <Label className="text-xs">Account Holder *</Label>
                    <Input value={accForm.accountHolder} onChange={e=>setAccForm(p=>({...p,accountHolder:e.target.value}))} placeholder="As per bank" className="mt-0.5 h-9 text-sm"/>
                  </div>
                  <div>
                    <Label className="text-xs">Account Number *</Label>
                    <Input value={accForm.accountNumber} onChange={e=>setAccForm(p=>({...p,accountNumber:e.target.value}))} placeholder="Account no." className="mt-0.5 h-9 text-sm font-mono"/>
                  </div>
                  <div>
                    <Label className="text-xs">IFSC Code</Label>
                    <Input value={accForm.ifscCode} onChange={e=>setAccForm(p=>({...p,ifscCode:e.target.value}))} placeholder="e.g. SBIN0001234" className="mt-0.5 h-9 text-sm font-mono"/>
                  </div>
                  <div className="col-span-2">
                    <Label className="text-xs">Branch</Label>
                    <Input value={accForm.branch} onChange={e=>setAccForm(p=>({...p,branch:e.target.value}))} placeholder="Branch name" className="mt-0.5 h-9 text-sm"/>
                  </div>
                </div>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setAccOpen(false); setEditAcc(null); setAccForm({ ...EMPTY_ACC }); }}>Cancel</Button>
            <Button onClick={saveAcc} disabled={saving} className="bg-indigo-600 hover:bg-indigo-700">
              {saving && <Loader2 className="h-4 w-4 mr-1 animate-spin"/>}
              {editAcc ? 'Save Changes' : 'Add Account'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}