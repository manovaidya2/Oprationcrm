import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, Plus, Loader2, GraduationCap, Filter, ChevronRight, Download } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { toast } from 'sonner';
import { studentsApi, centersApi, counselorsApi } from '@/lib/api';
import { useAuth } from '@/context/AuthContext';

const STATUS_COLORS = {
  Draft: 'bg-gray-100 text-gray-700', Submitted: 'bg-blue-100 text-blue-700',
  Changes_Requested: 'bg-amber-100 text-amber-700', Counselor_Approved: 'bg-indigo-100 text-indigo-700',
  Rejected: 'bg-red-100 text-red-700', Accountant_Pending: 'bg-amber-100 text-amber-700',
  Sent_To_University: 'bg-purple-100 text-purple-700', Enrolled: 'bg-emerald-100 text-emerald-700',
};
const STATUS_LABELS = {
  Draft: 'Draft', Submitted: 'Submitted', Changes_Requested: 'Changes Needed',
  Counselor_Approved: 'Approved', Rejected: 'Rejected',
  Accountant_Pending: 'Fee Pending', Sent_To_University: 'At University', Enrolled: 'Enrolled',
};
const ALL_STATUSES = Object.keys(STATUS_LABELS);

export default function StudentsPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const isAdmin = user?.role === 'Admin';

  const [students,   setStudents]   = useState([]);
  const [centers,    setCenters]    = useState([]);
  const [counselors, setCounselors] = useState([]);
  const [loading,    setLoading]    = useState(true);

  // Filters
  const [search,     setSearch]     = useState('');
  const [statusF,    setStatusF]    = useState('all');
  const [centerF,    setCenterF]    = useState('all');

  // Add student dialog (admin/counselor)
  const [addOpen, setAddOpen] = useState(false);
  const [form,    setForm]    = useState({ name:'', phone:'', email:'', courseName:'', courseYear:'', center:'', counselor:'' });
  const [saving,  setSaving]  = useState(false);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const params = {};
      if (statusF && statusF !== 'all')  params.status = statusF;
      if (centerF && centerF !== 'all')  params.centerId = centerF;
      if (search)   params.search     = search;
      const [s, c, co] = await Promise.all([
        studentsApi.getAll(params),
        centersApi.getAll(),
        counselorsApi.getAll(),
      ]);
      setStudents(s); setCenters(c); setCounselors(co);
    } catch { toast.error('Failed to load students'); }
    finally { setLoading(false); }
  }, [search, statusF, centerF]);

  useEffect(() => { load(); }, [load]);

  async function addStudent() {
    if (!form.name || !form.center || !form.counselor) return toast.error('Name, center and counselor required');
    setSaving(true);
    try {
      await studentsApi.create(form);
      toast.success('Student added'); setAddOpen(false);
      setForm({ name:'', phone:'', email:'', courseName:'', courseYear:'', center:'', counselor:'' });
      load();
    } catch(e) { toast.error(e.message); } finally { setSaving(false); }
  }

  // CSV export
  function exportCSV() {
  const headers = [
    'Name','Father Name','Mother Name','DOB','Gender','Phone','Email','Aadhaar',
    'Address','Course','Year/Batch','University','10th %','10th Year','10th Board',
    '12th %','12th Year','12th Board','Center','Counselor','Status','Enrollment No'
  ];
  const rows = students.map(s => [
    s.name||'',
    s.fatherName||'',
    s.motherName||'',
    s.dob ? new Date(s.dob).toLocaleDateString('en-IN',{day:'2-digit',month:'short',year:'numeric'}) : '',
    s.gender||'',
    s.phone||'',
    s.email||'',
    s.aadharNumber||'',
    s.address||'',
    s.courseName||'',
    s.courseYear||'',
    s.university?.name || s.universityName || '',
    s.tenth_percent||'',
    s.tenth_year||'',
    s.tenth_board||'',
    s.twelfth_percent||'',
    s.twelfth_year||'',
    s.twelfth_board||'',
    s.center?.name||'',
    s.counselor?.name||'',
    STATUS_LABELS[s.applicationStatus] || s.applicationStatus || '',
    s.enrollmentNumber||'',
  ]);
    const csv = [headers, ...rows].map(r => r.map(v => `"${v}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = 'students.csv'; a.click();
    URL.revokeObjectURL(url);
    toast.success('CSV downloaded');
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Students ({students.length})</h1>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={exportCSV}><Download className="h-4 w-4 mr-1"/>CSV</Button>
          {isAdmin && <Button size="sm" onClick={() => setAddOpen(true)}><Plus className="h-4 w-4 mr-1"/>Add Student</Button>}
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input className="pl-9" placeholder="Search name, phone, email, enrollment…" value={search}
            onChange={e => setSearch(e.target.value)} />
        </div>
        <Select value={statusF} onValueChange={setStatusF}>
          <SelectTrigger className="w-44"><SelectValue placeholder="All Statuses" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            {ALL_STATUSES.map(s => <SelectItem key={s} value={s}>{STATUS_LABELS[s]}</SelectItem>)}
          </SelectContent>
        </Select>
        {isAdmin && (
          <Select value={centerF} onValueChange={setCenterF}>
            <SelectTrigger className="w-40"><SelectValue placeholder="All Centers" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Centers</SelectItem>
              {centers.map(c => <SelectItem key={c._id} value={c._id}>{c.name}</SelectItem>)}
            </SelectContent>
          </Select>
        )}
      </div>

      {loading ? (
        <div className="flex h-48 items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground"/></div>
      ) : students.length === 0 ? (
        <div className="text-center py-16 border border-dashed rounded-lg">
          <GraduationCap className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
          <p className="text-muted-foreground">No students found</p>
        </div>
      ) : (
        <div className="space-y-2">
          {students.map(s => (
            <Card key={s._id} className="cursor-pointer hover:border-primary/50 transition-colors"
              onClick={() => navigate(`/students/${s._id}`)}>
              <CardContent className="p-4">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium">{s.name}</span>
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_COLORS[s.applicationStatus] || 'bg-gray-100 text-gray-700'}`}>
                        {STATUS_LABELS[s.applicationStatus] || s.applicationStatus}
                      </span>
                      {s.enrollmentNumber && <span className="text-xs font-mono text-emerald-700 font-medium bg-emerald-50 px-2 py-0.5 rounded">{s.enrollmentNumber}</span>}
                    </div>
                    <div className="flex gap-3 mt-0.5 text-xs text-muted-foreground flex-wrap">
                      {s.center?.name && <span>{s.center.name}</span>}
                      {s.counselor?.name && <span>· {s.counselor.name}</span>}
                      {s.courseName && <span>· {s.courseName} {s.courseYear}</span>}
                      {s.phone && <span>· {s.phone}</span>}
                    </div>
                  </div>
                  <ChevronRight className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Add Student Dialog */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Add Student</DialogTitle></DialogHeader>
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2"><Label>Full Name *</Label><Input value={form.name} onChange={e=>setForm(p=>({...p,name:e.target.value}))} /></div>
            <div><Label>Phone</Label><Input value={form.phone} onChange={e=>setForm(p=>({...p,phone:e.target.value}))} /></div>
            <div><Label>Email</Label><Input value={form.email} onChange={e=>setForm(p=>({...p,email:e.target.value}))} /></div>
            <div><Label>Course</Label><Input value={form.courseName} onChange={e=>setForm(p=>({...p,courseName:e.target.value}))} /></div>
            <div><Label>Year / Batch</Label><Input value={form.courseYear} onChange={e=>setForm(p=>({...p,courseYear:e.target.value}))} /></div>
            <div>
              <Label>Center *</Label>
              <Select value={form.center} onValueChange={v=>setForm(p=>({...p,center:v}))}>
                <SelectTrigger><SelectValue placeholder="Select…"/></SelectTrigger>
                <SelectContent>{centers.map(c=><SelectItem key={c._id} value={c._id}>{c.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <Label>Counselor *</Label>
              <Select value={form.counselor} onValueChange={v=>setForm(p=>({...p,counselor:v}))}>
                <SelectTrigger><SelectValue placeholder="Select…"/></SelectTrigger>
                <SelectContent>{counselors.map(c=><SelectItem key={c._id} value={c._id}>{c.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={()=>setAddOpen(false)}>Cancel</Button>
            <Button onClick={addStudent} disabled={saving}>{saving&&<Loader2 className="h-4 w-4 mr-1 animate-spin"/>}Add Student</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
