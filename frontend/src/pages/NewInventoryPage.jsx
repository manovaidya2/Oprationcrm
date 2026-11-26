import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Archive, Building2, ChevronRight, FileText, GraduationCap, Loader2, Search, Users } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { PagerBar } from '@/components/PagerBar';
import { centersApi, newInventoryApi } from '@/lib/api';

const LIMIT = 24;
const selectCls = 'h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm sm:w-64';

// New Inventory: enrolled students; open one to see / add their documents (in the office, sent to or received
// by the centre). It replaced the older Doc Inventory page.
export default function NewInventoryPage() {
  const navigate = useNavigate();
  const [searchInput, setSearchInput] = useState('');
  const [q, setQ] = useState('');
  const [centerId, setCenterId] = useState('');
  const [page, setPage] = useState(1);
  const [centers, setCenters] = useState([]);
  const [result, setResult] = useState({ key: '', data: null, error: '' });

  useEffect(() => { centersApi.getAll().then(c => setCenters(Array.isArray(c) ? c : (c?.centers || []))).catch(() => {}); }, []);
  useEffect(() => {   // search as you type, a moment after typing stops
    const t = setTimeout(() => { setQ(searchInput.trim()); setPage(1); }, 300);
    return () => clearTimeout(t);
  }, [searchInput]);

  const key = JSON.stringify({ q, centerId, page });
  useEffect(() => {
    let alive = true;
    const params = { page, limit: LIMIT, ...(q ? { search: q } : {}), ...(centerId ? { centerId } : {}) };
    newInventoryApi.students(params)
      .then(data => { if (alive) setResult({ key, data, error: '' }); })
      .catch(e => { if (alive) setResult({ key, data: null, error: e.message || 'Could not load students' }); });
    return () => { alive = false; };
  }, [key]);   // eslint-disable-line react-hooks/exhaustive-deps

  const loading = result.key !== key;
  const data = result.data;
  const students = data?.students || [];

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600"><Archive className="h-5 w-5"/></div>
          <div>
            <h1 className="text-2xl font-bold text-slate-800">New Inventory</h1>
            <p className="mt-0.5 max-w-2xl text-xs text-slate-500">
              Each student's marksheets and other documents — in the office, sent to the centre, or received by the centre. When the accountant approves a request and that document is here in the office, the request goes to Dispatch instead of the university.
            </p>
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-2 rounded-xl border border-slate-200 bg-white p-3 shadow-sm sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"/>
          <Input value={searchInput} onChange={e => setSearchInput(e.target.value)} placeholder="Search by student name or enrollment number" className="h-10 border-slate-200 pl-9"/>
        </div>
        <select className={selectCls} value={centerId} onChange={e => { setCenterId(e.target.value); setPage(1); }} aria-label="Centre">
          <option value="">All centres</option>
          {centers.map(c => <option key={c._id} value={c._id}>{c.name || c.organisationName}</option>)}
        </select>
        <div className="flex items-center gap-1.5 whitespace-nowrap px-1 text-xs font-medium text-slate-500">
          <Users className="h-3.5 w-3.5"/>{data ? `${data.total} student${data.total === 1 ? '' : 's'}` : '—'}
        </div>
      </div>

      {result.error && !loading && <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{result.error}</div>}

      {loading && !data ? (
        <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-slate-300"/></div>
      ) : students.length === 0 && !result.error ? (
        <div className="rounded-2xl border-2 border-dashed border-slate-200 py-14 text-center">
          <GraduationCap className="mx-auto mb-2 h-8 w-8 text-slate-300"/>
          <p className="text-sm font-medium text-slate-500">{q || centerId ? 'No student matches' : 'No enrolled students yet'}</p>
        </div>
      ) : (
        <div className={`grid gap-3 sm:grid-cols-2 xl:grid-cols-3 transition-opacity ${loading ? 'pointer-events-none opacity-50' : ''}`}>
          {students.map(s => {
            const total = (s.held?.Marksheet || 0) + (s.held?.Other || 0);
            return (
              <button key={s._id} type="button" onClick={() => navigate(`/new-inventory/${s._id}`)}
                className="group flex flex-col rounded-xl border border-slate-200 bg-white p-4 text-left shadow-sm transition hover:border-indigo-300 hover:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400">
                <div className="flex items-start gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-indigo-100 text-sm font-bold text-indigo-700">{s.name?.charAt(0)?.toUpperCase() || '?'}</div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-semibold text-slate-800">{s.name}</div>
                    {s.enrollmentNumber && <span className="mt-0.5 inline-block rounded-full border border-emerald-200 bg-emerald-50 px-2 font-mono text-xs font-bold text-emerald-700">{s.enrollmentNumber}</span>}
                  </div>
                  <ChevronRight className="h-4 w-4 shrink-0 text-slate-300 transition group-hover:translate-x-0.5 group-hover:text-indigo-500"/>
                </div>
                <div className="mt-2 space-y-0.5 text-xs text-slate-500">
                  {s.center?.name && <div className="flex items-center gap-1.5 truncate"><Building2 className="h-3 w-3 shrink-0"/>{s.center.name}</div>}
                  {(s.courseName || s.courseYear) && <div className="truncate">{`${s.courseName || ''} ${s.courseYear || ''}`.trim()}</div>}
                </div>
                <div className="mt-3 flex flex-wrap gap-1.5 border-t border-slate-100 pt-3 text-xs">
                  <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 font-semibold ${s.held?.Marksheet ? 'border-violet-200 bg-violet-50 text-violet-700' : 'border-slate-200 bg-slate-50 text-slate-400'}`}>
                    <GraduationCap className="h-3 w-3"/>{s.held?.Marksheet || 0} marksheet{s.held?.Marksheet === 1 ? '' : 's'}
                  </span>
                  <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 font-semibold ${s.held?.Other ? 'border-sky-200 bg-sky-50 text-sky-700' : 'border-slate-200 bg-slate-50 text-slate-400'}`}>
                    <FileText className="h-3 w-3"/>{s.held?.Other || 0} other doc{s.held?.Other === 1 ? '' : 's'}
                  </span>
                  {total === 0 && <span className="ml-auto self-center text-slate-400">Nothing held yet</span>}
                </div>
              </button>
            );
          })}
        </div>
      )}

      {data && data.pages > 1 && <PagerBar page={data.page} pages={data.pages} total={data.total} loading={loading} onPage={setPage}/>}
    </div>
  );
}
