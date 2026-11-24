import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { CalendarClock, Search, X } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { centersApi, studentsApi } from '@/lib/api';
import { AdmissionTimeline } from '@/components/AdmissionTimeline';

// Counselor view of the admission payment timeline across every centre they work on
// (the server limits the list to their own students / centres).
export default function AdmissionTimelinePage() {
  const navigate = useNavigate();
  const [centers, setCenters] = useState([]);
  const [centerId, setCenterId] = useState('all');
  const [search, setSearch] = useState('');
  const [data, setData] = useState({ key: null, rows: [] });

  useEffect(() => { centersApi.getAll().then(setCenters).catch(() => {}); }, []);

  useEffect(() => {
    let off = false;
    studentsApi.admissionTimeline(centerId === 'all' ? {} : { centerId })
      .then(res => { if (!off) setData({ key: centerId, rows: res?.rows || [] }); })
      .catch(e => { if (!off) { toast.error(e.message || 'Failed to load timeline'); setData({ key: centerId, rows: [] }); } });
    return () => { off = true; };
  }, [centerId]);

  const loading = data.key !== centerId;
  const q = search.trim().toLowerCase();
  const rows = data.rows.filter(r => !q || [r.name, r.phone, r.center?.name, r.courseName]
    .some(v => String(v || '').toLowerCase().includes(q)));
  return (
    <div className="space-y-4">
      <div>
        <h1 className="flex items-center gap-2 text-xl font-semibold">
          <CalendarClock className="h-5 w-5 text-indigo-600"/>Admission Timeline
        </h1>
        <p className="text-xs text-muted-foreground">Admissions in your centres whose course fee is not fully paid, by days since submission.</p>
      </div>

      <div className="flex flex-wrap gap-3">
        <div className="relative min-w-48 flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"/>
          <Input className="pl-9 pr-9" placeholder="Search student, phone, centre, course..." value={search} onChange={e => setSearch(e.target.value)}/>
          {search && (
            <button type="button" aria-label="Clear search" onClick={() => setSearch('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
              <X className="h-4 w-4"/>
            </button>
          )}
        </div>
        <Select value={centerId} onValueChange={setCenterId}>
          <SelectTrigger className="w-56"><SelectValue placeholder="All my centres"/></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All my centres</SelectItem>
            {centers.map(c => <SelectItem key={c._id} value={c._id}>{c.name || c.organisationName}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      <AdmissionTimeline rows={rows} loading={loading} showCentre onOpen={row => navigate(`/students/${row._id}`)}/>
    </div>
  );
}
