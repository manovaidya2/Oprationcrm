import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, Archive, GraduationCap, Loader2, MessageSquareWarning, Search, Send } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { toast } from 'sonner';
import { docsApi, marksheetRequestsApi, paymentQueriesApi } from '@/lib/api';
import { MARKSHEET_REQUEST_OPTIONS } from '@/lib/documentOptions';
import { refreshNavCounts } from '@/lib/navCounts';
import { useLiveRefresh } from '@/lib/realtime';

// The counselor's own marksheet requests, straight to the Inventory team (not through the centre or the accountant):
// for any of their students with an enrollment number, request a marksheet that is not in the New Inventory.
// When the course fee has not come in, ask the centre's Viewer Counselor to get it (a payment query).

const fmtDt = d => (d ? new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—');
const money = v => `₹${Number(v || 0).toLocaleString('en-IN')}`;
const keyOf = n => String(n || '').trim().toLowerCase().replace(/\s+/g, ' ');
const QUERY_TEXT = 'Course fee has not come in — please talk to the centre and get it paid.';

const PLACE = {
  office:     { label: 'In office',        tone: 'bg-emerald-50 text-emerald-700' },
  check:      { label: 'In office · to check', tone: 'bg-emerald-50 text-emerald-700' },
  sent:       { label: 'Sent to centre',   tone: 'bg-sky-50 text-sky-700' },
  received:   { label: 'With centre',      tone: 'bg-sky-50 text-sky-700' },
  correction: { label: 'At university (correction)', tone: 'bg-orange-50 text-orange-700' },
};
// where a direct request is
function requestState(r) {
  switch (r.status) {
    case 'With_Inventory':        return { label: 'With Inventory — to ask university', tone: 'bg-indigo-50 text-indigo-700' };
    case 'Sent_To_University':    return r.correctionOpen ? { label: 'At university for correction', tone: 'bg-orange-50 text-orange-700' } : { label: 'At university', tone: 'bg-amber-50 text-amber-700' };
    case 'University_Dispatched': return { label: 'Courier from university', tone: 'bg-amber-50 text-amber-700' };
    case 'Dispatch_Received':     return { label: 'Received — being checked', tone: 'bg-violet-50 text-violet-700' };
    case 'In_Inventory':          return { label: 'In the New Inventory', tone: 'bg-emerald-50 text-emerald-700' };
    case 'Closed':                return { label: 'Closed', tone: 'bg-slate-100 text-slate-600' };
    default:                      return { label: String(r.status || '').replace(/_/g, ' '), tone: 'bg-slate-100 text-slate-600' };
  }
}
const lastAt = d => [...(d.statusHistory || [])].reverse()[0]?.at || d.updatedAt;

function Chip({ tone, children, title }) {
  return <span title={title} className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold ${tone}`}>{children}</span>;
}

export default function RequestMarksheetsPage() {
  const [tab, setTab] = useState('students');
  const [rows, setRows] = useState([]);
  const [truncated, setTruncated] = useState(false);
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchInput, setSearchInput] = useState('');
  const [q, setQ] = useState('');
  const [centre, setCentre] = useState('');
  const [reqFilter, setReqFilter] = useState('open'); // open | all
  const [reqFor, setReqFor] = useState(null);       // student to request marksheets for
  const [picked, setPicked] = useState([]);
  const [custom, setCustom] = useState('');
  const [urgent, setUrgent] = useState(false);
  const [queryFor, setQueryFor] = useState(null);   // student to raise a payment query for
  const [queryText, setQueryText] = useState(QUERY_TEXT);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setQ(searchInput.trim()), 300);
    return () => clearTimeout(t);
  }, [searchInput]);

  const [reloadKey, setReloadKey] = useState(0);
  const load = () => setReloadKey(k => k + 1);
  useEffect(() => {
    let alive = true;
    Promise.all([marksheetRequestsApi.students(q ? { search: q } : {}), marksheetRequestsApi.list()])
      .then(([s, r]) => {
        if (!alive) return;
        setRows(s?.students || []);
        setTruncated(!!s?.truncated);
        setRequests(Array.isArray(r) ? r : []);
      })
      .catch(e => toast.error(e.message || 'Failed to load'))
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [q, reloadKey]);
  useLiveRefresh(['documents', 'payment-queries', 'payments'], load);   // the Inventory moved a request, a query changed, a fee came in

  const centres = useMemo(() => {
    const m = new Map();
    rows.forEach(s => { if (s.center?._id) m.set(s.center._id, s.center.name); });
    return [...m.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  }, [rows]);
  const inCentre = rows.filter(s => !centre || s.center?._id === centre);
  // everyone; the ones with an enrollment number (can be requested) first
  const shown = [...inCentre].sort((a, b) => (Number(b.canRequest) - Number(a.canRequest)) || a.name.localeCompare(b.name));
  const openRequests = requests.filter(r => !['In_Inventory', 'Closed'].includes(r.status));
  const shownRequests = (reqFilter === 'open' ? openRequests : requests).filter(r => !q || [r.name, r.student?.name, r.student?.enrollmentNumber].some(v => String(v || '').toLowerCase().includes(q.toLowerCase())));

  function openRequest(s) { setReqFor(s); setPicked([]); setCustom(''); setUrgent(false); }
  function openQuery(s) { setQueryFor(s); setQueryText(QUERY_TEXT); }

  async function submitRequest() {
    const names = [...picked, ...(custom.trim() ? [custom.trim()] : [])];
    if (!names.length) return toast.error('Choose the marksheet');
    setBusy(true);
    try {
      const res = await marksheetRequestsApi.create({ studentId: reqFor._id, names, urgent });
      if (res.created?.length) toast.success(`${res.created.length === 1 ? `${res.created[0].name} requested` : `${res.created.length} marksheets requested`}${urgent ? ' as urgent' : ''} — sent to the Inventory`);
      (res.failed || []).forEach(f => toast.error(`${f.name}: ${f.error}`));
      setReqFor(null);
      load();
    } catch (e) { toast.error(e.message); } finally { setBusy(false); }
  }

  // mark an open request urgent (or back to normal): the Inventory team (and the university, if it has it) is told
  async function toggleUrgent(r) {
    setBusy(true);
    try {
      await docsApi.setUrgent(r._id, !r.urgent);
      toast.success(r.urgent ? `${r.name}: back to normal` : `${r.name}: marked urgent — the Inventory has been told`);
      load();
    } catch (e) { toast.error(e.message); } finally { setBusy(false); }
  }

  async function submitQuery() {
    setBusy(true);
    try {
      await paymentQueriesApi.create({ studentId: queryFor._id, message: queryText.trim() });
      toast.success(`Payment query sent to ${queryFor.viewers.map(v => v.name).join(', ')}`);
      refreshNavCounts();
      setQueryFor(null);
      load();
    } catch (e) { toast.error(e.message); } finally { setBusy(false); }
  }

  if (loading) return <div className="flex h-64 items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground"/></div>;

  const held = new Set((reqFor?.inventory || []).map(i => keyOf(i.name)));
  const asked = new Set((reqFor?.requests || []).map(r => keyOf(r.name)));

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Request Marksheets</h1>
          <p className="text-sm text-slate-500">Request a student's marksheet from the Inventory once the enrollment number is in. Course fee not in? Ask the centre's Viewer Counselor.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <label className="flex h-10 min-w-[260px] items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-slate-400">
            <Search className="h-4 w-4"/>
            <input type="search" value={searchInput} onChange={e => setSearchInput(e.target.value)} placeholder="Search student or enrollment no."
              aria-label="Search" className="flex-1 bg-transparent text-sm text-slate-900 outline-none"/>
          </label>
          <Button asChild variant="outline" className="h-10"><Link to="/payment-queries"><MessageSquareWarning className="mr-2 h-4 w-4"/>Payment queries</Link></Button>
        </div>
      </header>

      <div role="tablist" aria-label="View" className="inline-flex rounded-xl bg-slate-100 p-1">
        {[['students', 'Students', inCentre.length], ['requests', 'My requests', openRequests.length]].map(([k, label, n]) => (
          <button key={k} type="button" role="tab" aria-selected={tab === k} onClick={() => setTab(k)}
            className={`flex items-center gap-1.5 rounded-lg px-4 py-1.5 text-sm font-semibold transition-colors ${tab === k ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}>
            {label}<span className={`rounded-full px-1.5 text-[11px] leading-4 tabular-nums ${tab === k ? 'bg-indigo-100 text-indigo-700' : 'bg-slate-200 text-slate-600'}`}>{n}</span>
          </button>
        ))}
      </div>

      {tab === 'students' ? (
        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 p-3">
            <span className="text-xs text-slate-500">{inCentre.length} student{inCentre.length === 1 ? '' : 's'} · {inCentre.filter(s => !s.canRequest).length} without an enrollment number yet</span>
            {centres.length > 1 && (
              <select value={centre} onChange={e => setCentre(e.target.value)} aria-label="Centre" className="ml-auto h-8 rounded-lg border border-slate-200 bg-white px-2 text-xs">
                <option value="">All centres</option>
                {centres.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
              </select>
            )}
          </div>
          {truncated && <p className="border-b border-slate-100 bg-amber-50 px-4 py-2 text-xs text-amber-800">Showing the first 500 students — search to narrow it down.</p>}
          {shown.length === 0 ? (
            <div className="px-4 py-14 text-center text-sm text-slate-500"><GraduationCap className="mx-auto mb-2 h-7 w-7 text-slate-300"/>
              No students{q ? ` matching "${q}"` : ''}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[880px] text-sm">
                <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                  <tr><th className="px-4 py-2.5">Student</th><th className="px-4 py-2.5">Centre</th><th className="px-4 py-2.5">Course fee</th><th className="px-4 py-2.5">Marksheets</th><th className="px-4 py-2.5 text-right">Actions</th></tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {shown.map(s => (
                    <tr key={s._id} className="align-top hover:bg-slate-50/60">
                      <td className="px-4 py-3">
                        <Link to={`/students/${s._id}`} className="font-semibold text-slate-900 hover:text-indigo-700 hover:underline">{s.name}</Link>
                        <div className="text-xs text-slate-500">{[s.enrollmentNumber, s.courseName, s.courseYear].filter(Boolean).join(' · ')}</div>
                        {!s.enrollmentNumber && <Chip tone="bg-slate-100 text-slate-600">No enrollment no. yet</Chip>}
                      </td>
                      <td className="px-4 py-3 text-slate-700">{s.center?.name || '—'}</td>
                      <td className="px-4 py-3">
                        <div className="text-slate-800">{money(s.fee.paidAmount)} <span className="text-slate-500">of {money(s.fee.netFee)}</span></div>
                        {s.fee.dueAmount > 0 ? <div className="text-xs font-semibold text-amber-700">{money(s.fee.dueAmount)} due</div>
                          : s.fee.netFee > 0 ? <div className="text-xs font-semibold text-emerald-700">Fully paid</div>
                          : <div className="text-xs text-slate-500">No fee set</div>}
                        {s.fee.pendingAmount > 0 && <div className="text-xs text-slate-500">{money(s.fee.pendingAmount)} waiting for verification</div>}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex max-w-xs flex-wrap gap-1">
                          {s.inventory.map(i => <Chip key={i._id} tone={PLACE[i.place]?.tone || PLACE.office.tone} title={PLACE[i.place]?.label}>{i.name}</Chip>)}
                          {s.requests.map(r => <Chip key={r._id} tone={r.urgent ? 'bg-red-50 text-red-700' : requestState(r).tone} title={requestState(r).label}>{r.name} · {r.urgent ? 'urgent' : 'requested'}</Chip>)}
                          {!s.inventory.length && !s.requests.length && <span className="text-xs text-slate-400">None in the inventory</span>}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap justify-end gap-2">
                          <Button size="sm" disabled={!s.canRequest} onClick={() => openRequest(s)}
                            title={s.canRequest ? 'Request a marksheet from the Inventory' : (s.enrollmentNumber ? 'No university on the student' : 'No enrollment number yet')}>
                            <Send className="mr-1.5 h-3.5 w-3.5"/>Request marksheet
                          </Button>
                          {s.openQuery ? (
                            <Button asChild size="sm" variant="outline" className="border-amber-300 text-amber-800"><Link to="/payment-queries">Query open</Link></Button>
                          ) : s.fee.dueAmount > 0 && (
                            <Button size="sm" variant="outline" onClick={() => openQuery(s)}><MessageSquareWarning className="mr-1.5 h-3.5 w-3.5"/>Payment query</Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      ) : (
        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="flex flex-wrap gap-2 border-b border-slate-100 p-3">
            {[['open', `Open ${openRequests.length}`], ['all', `All ${requests.length}`]].map(([v, label]) => (
              <button key={v} type="button" aria-pressed={reqFilter === v} onClick={() => setReqFilter(v)}
                className={`rounded-full px-3 py-1 text-xs font-semibold ${reqFilter === v ? 'bg-slate-900 text-white' : 'border border-slate-200 bg-white text-slate-600 hover:border-slate-300'}`}>{label}</button>
            ))}
          </div>
          {shownRequests.length === 0 ? (
            <div className="px-4 py-14 text-center text-sm text-slate-500"><Archive className="mx-auto mb-2 h-7 w-7 text-slate-300"/>No marksheet requests{reqFilter === 'open' ? ' open' : ''}</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] text-sm">
                <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                  <tr><th className="px-4 py-2.5">Marksheet</th><th className="px-4 py-2.5">Student</th><th className="px-4 py-2.5">Where it is</th><th className="px-4 py-2.5">Requested</th><th className="px-4 py-2.5">Last update</th><th className="px-4 py-2.5 text-right">Urgent</th></tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {shownRequests.map(r => {
                    const st = requestState(r);
                    return (
                      <tr key={r._id} className="hover:bg-slate-50/60">
                        <td className="px-4 py-3 font-semibold text-slate-900">{r.name}{r.urgent && <span className="ml-2 align-middle"><Chip tone="bg-red-50 text-red-700">Urgent</Chip></span>}</td>
                        <td className="px-4 py-3"><div className="text-slate-800">{r.student?.name}</div><div className="text-xs text-slate-500">{[r.student?.enrollmentNumber, r.center?.name].filter(Boolean).join(' · ')}</div></td>
                        <td className="px-4 py-3"><Chip tone={st.tone}>{st.label}</Chip>{r.correctionOpen && r.correctionNote && <div className="mt-1 text-xs text-orange-700">{r.correctionNote}</div>}</td>
                        <td className="px-4 py-3 text-slate-600">{fmtDt(r.createdAt)}{r.uploadedBy?.name ? <div className="text-xs text-slate-500">by {r.uploadedBy.name}</div> : null}</td>
                        <td className="px-4 py-3 text-slate-600">{fmtDt(lastAt(r))}</td>
                        <td className="px-4 py-3 text-right">
                          {['With_Inventory', 'Sent_To_University', 'University_Dispatched', 'Dispatch_Received'].includes(r.status) && (
                            <Button size="sm" variant="outline" disabled={busy} onClick={() => toggleUrgent(r)}
                              className={r.urgent ? '' : 'border-red-200 text-red-700 hover:bg-red-50'}>
                              {r.urgent ? 'Remove urgent' : 'Mark urgent'}
                            </Button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      {/* request marksheets */}
      <Dialog open={!!reqFor} onOpenChange={open => { if (!open) setReqFor(null); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Request marksheet — {reqFor?.name}</DialogTitle></DialogHeader>
          <p className="-mt-2 text-xs text-slate-500">{[reqFor?.enrollmentNumber, reqFor?.center?.name].filter(Boolean).join(' · ')} · goes to the Inventory, which asks the university</p>
          <div className="max-h-72 space-y-0.5 overflow-y-auto rounded-lg border border-slate-200 p-1.5">
            {MARKSHEET_REQUEST_OPTIONS.map(name => {
              const why = held.has(keyOf(name)) ? 'In the inventory' : asked.has(keyOf(name)) ? 'Already requested' : '';
              const on = picked.includes(name);
              return (
                <label key={name} className={`flex items-center gap-2 rounded-md px-2 py-1.5 text-sm ${why ? 'cursor-not-allowed text-slate-400' : 'cursor-pointer hover:bg-slate-50'}`}>
                  <input type="checkbox" disabled={!!why} checked={on} className="h-4 w-4 accent-indigo-600"
                    onChange={() => setPicked(p => (on ? p.filter(x => x !== name) : [...p, name]))}/>
                  <span className="flex-1">{name}</span>
                  {why && <span className="text-[11px] font-semibold">{why}</span>}
                </label>
              );
            })}
          </div>
          <div>
            <Label className="text-xs font-semibold text-slate-600">Another marksheet (type the name)</Label>
            <Input value={custom} onChange={e => setCustom(e.target.value)} placeholder="e.g. Semester 5 Marksheet" className="mt-1"/>
          </div>
          <label className={`flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2.5 text-sm ${urgent ? 'border-red-300 bg-red-50 text-red-800' : 'border-slate-200 text-slate-700'}`}>
            <input type="checkbox" checked={urgent} onChange={e => setUrgent(e.target.checked)} className="h-4 w-4 accent-red-600"/>
            <span><b>Urgent</b> — the Inventory sees it first, and the university gets it under Urgent requests</span>
          </label>
          <DialogFooter>
            <Button variant="outline" onClick={() => setReqFor(null)}>Cancel</Button>
            <Button onClick={submitRequest} disabled={busy || (!picked.length && !custom.trim())}>{busy && <Loader2 className="mr-1.5 h-4 w-4 animate-spin"/>}Send to Inventory{picked.length + (custom.trim() ? 1 : 0) > 1 ? ` (${picked.length + (custom.trim() ? 1 : 0)})` : ''}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* payment query to the centre's Viewer Counselor */}
      <Dialog open={!!queryFor} onOpenChange={open => { if (!open) setQueryFor(null); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Payment query — {queryFor?.name}</DialogTitle></DialogHeader>
          <div className="grid grid-cols-2 gap-3 rounded-xl bg-slate-50 p-3 text-sm">
            <div><div className="text-xs font-semibold text-slate-500">Centre</div><div className="font-medium">{queryFor?.center?.name}</div></div>
            <div><div className="text-xs font-semibold text-slate-500">Course fee due</div><div className="font-semibold text-amber-700">{money(queryFor?.fee.dueAmount)}</div><div className="text-xs text-slate-500">paid {money(queryFor?.fee.paidAmount)} of {money(queryFor?.fee.netFee)}</div></div>
          </div>
          {queryFor?.viewers.length ? (
            <p className="text-xs text-slate-600">Goes to: <b>{queryFor.viewers.map(v => v.name).join(', ')}</b> (Viewer Counselor of the centre). They talk to the centre and close it once the fee is confirmed.</p>
          ) : (
            <p className="flex items-start gap-1.5 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-800"><AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0"/>No Viewer Counselor is assigned to this centre — ask Admin to assign one.</p>
          )}
          <div>
            <Label className="text-xs font-semibold text-slate-600">Message</Label>
            <Textarea value={queryText} onChange={e => setQueryText(e.target.value)} rows={3} className="mt-1"/>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setQueryFor(null)}>Cancel</Button>
            <Button onClick={submitQuery} disabled={busy || !queryFor?.viewers.length}>{busy && <Loader2 className="mr-1.5 h-4 w-4 animate-spin"/>}Send query</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
