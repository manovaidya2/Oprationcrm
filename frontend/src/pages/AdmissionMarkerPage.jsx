import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Building2, ChevronRight, ClipboardPlus, Loader2, MapPin, Search, User, X } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';
import { centersApi } from '@/lib/api';
import { useAuth } from '@/context/AuthContext';

// Home of the Admission Marker role: pick any centre and open its panel to add an admission
// (student, fee, payment, submit). Students and centres are view-only everywhere else.
export default function AdmissionMarkerPage() {
  const navigate = useNavigate();
  const { switchToCenter } = useAuth();
  const [centers, setCenters] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  useEffect(() => {
    centersApi.getAll()
      .then(list => setCenters((list || []).filter(c => c.isActive !== false)))
      .catch(e => toast.error(e.message || 'Failed to load centres'))
      .finally(() => setLoading(false));
  }, []);

  const q = search.trim().toLowerCase();
  const shown = centers.filter(c => !q || [c.name, c.organisationName, c.city, c.state, c.assignedCounselor?.name]
    .some(v => String(v || '').toLowerCase().includes(q)));

  function openCentre(center) {
    switchToCenter(center);
    navigate('/center');
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="flex items-center gap-2 text-xl font-semibold">
          <ClipboardPlus className="h-5 w-5 text-indigo-600"/>Admissions
        </h1>
        <p className="text-xs text-muted-foreground">
          Open a centre's panel to add an admission — student details, fee, payment and submit.
        </p>
      </div>

      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"/>
        <Input className="pl-9 pr-9" placeholder="Search centre, city, counselor..." value={search} onChange={e => setSearch(e.target.value)}/>
        {search && (
          <button type="button" aria-label="Clear search" onClick={() => setSearch('')}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
            <X className="h-4 w-4"/>
          </button>
        )}
      </div>

      {loading ? (
        <div className="flex h-48 items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground"/></div>
      ) : shown.length === 0 ? (
        <div className="rounded-lg border border-dashed py-16 text-center text-sm text-muted-foreground">No centres found</div>
      ) : (
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {shown.map(c => (
            <button key={c._id} type="button" onClick={() => openCentre(c)}
              className="group flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white p-4 text-left shadow-sm transition-all hover:border-indigo-300 hover:shadow">
              <div className="flex min-w-0 items-center gap-3">
                <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-slate-100">
                  <Building2 className="h-5 w-5 text-slate-500"/>
                </div>
                <div className="min-w-0">
                  <div className="truncate font-semibold text-slate-800">{c.name || c.organisationName}</div>
                  {(c.city || c.state) && (
                    <div className="mt-0.5 flex items-center gap-1 text-xs text-slate-400">
                      <MapPin className="h-3 w-3"/>{c.city}{c.state ? `, ${c.state}` : ''}
                    </div>
                  )}
                  <div className="mt-0.5 flex items-center gap-1 text-xs text-indigo-600">
                    <User className="h-3 w-3"/>{c.assignedCounselor?.name || (c.heldByAdmin ? 'Admin' : 'No counselor')}
                  </div>
                </div>
              </div>
              <span className="flex flex-shrink-0 items-center gap-1 text-xs font-semibold text-indigo-600">
                Open panel<ChevronRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5"/>
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
