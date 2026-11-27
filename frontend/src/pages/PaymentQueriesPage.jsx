import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { CheckCircle2, Loader2, MessageSquareWarning, Search, Send } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { toast } from 'sonner';
import { paymentQueriesApi } from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import { refreshNavCounts } from '@/lib/navCounts';
import { useLiveRefresh } from '@/lib/realtime';

// Payment queries: a counselor asks the centre's Viewer Counselor to get a student's course fee from the centre.
// Both sides write what happened; it is closed once confirmed (e.g. the centre has paid).

const fmtDt = d => (d ? new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—');
const fmtFull = d => (d ? new Date(d).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', hour12: true }) : '');
const money = v => `₹${Number(v || 0).toLocaleString('en-IN')}`;
const daysSince = d => Math.max(0, Math.floor((Date.now() - new Date(d).getTime()) / 86400000));

export default function PaymentQueriesPage() {
  const { user } = useAuth();
  const [status, setStatus] = useState('Open');
  const [data, setData] = useState({ queries: [], counts: { Open: 0 } });
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [drafts, setDrafts] = useState({});        // query id -> update being written
  const [closing, setClosing] = useState(null);    // query being closed
  const [closeNote, setCloseNote] = useState('');
  const [busy, setBusy] = useState('');

  const [reloadKey, setReloadKey] = useState(0);
  const load = () => setReloadKey(k => k + 1);
  useEffect(() => {
    let alive = true;
    paymentQueriesApi.list(status)
      .then(d => { if (alive) { setData(d); refreshNavCounts(); } })
      .catch(e => toast.error(e.message || 'Failed to load'))
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [status, reloadKey]);
  useLiveRefresh(['payment-queries', 'payments'], load);   // a query raised / updated / closed, or a fee paid, anywhere

  const q = search.trim().toLowerCase();
  const shown = data.queries.filter(x => !q || [x.student?.name, x.student?.enrollmentNumber, x.center?.name, x.raisedBy?.name].some(v => String(v || '').toLowerCase().includes(q)));

  async function addUpdate(x) {
    const text = (drafts[x._id] || '').trim();
    if (!text) return toast.error('Write the update');
    setBusy(x._id);
    try {
      await paymentQueriesApi.addUpdate(x._id, text);
      setDrafts(d => ({ ...d, [x._id]: '' }));
      toast.success('Update added');
      load();
    } catch (e) { toast.error(e.message); } finally { setBusy(''); }
  }

  async function close() {
    setBusy(closing._id);
    try {
      await paymentQueriesApi.close(closing._id, closeNote.trim());
      toast.success(`Query for ${closing.student?.name} closed`);
      setClosing(null);
      load();
    } catch (e) { toast.error(e.message); } finally { setBusy(''); }
  }

  if (loading) return <div className="flex h-64 items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground"/></div>;

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Payment Queries</h1>
          <p className="text-sm text-slate-500">
            {user?.role === 'ViewerCounselor'
              ? "Course fee not received — talk to the centre, write what happened, and close the query once the fee is confirmed."
              : 'Course fee queries sent to the Viewer Counselors of your centres.'}
          </p>
        </div>
        <label className="flex h-10 min-w-[260px] items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-slate-400">
          <Search className="h-4 w-4"/>
          <input type="search" value={search} onChange={e => setSearch(e.target.value)} placeholder="Search student, centre, counselor"
            aria-label="Search" className="flex-1 bg-transparent text-sm text-slate-900 outline-none"/>
        </label>
      </header>

      <div role="tablist" aria-label="Status" className="inline-flex rounded-xl bg-slate-100 p-1">
        {[['Open', data.counts?.Open], ['Closed', null]].map(([k, n]) => (
          <button key={k} type="button" role="tab" aria-selected={status === k} onClick={() => { setLoading(true); setStatus(k); }}
            className={`flex items-center gap-1.5 rounded-lg px-4 py-1.5 text-sm font-semibold ${status === k ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}>
            {k}{n > 0 && <span className={`rounded-full px-1.5 text-[11px] leading-4 tabular-nums ${status === k ? 'bg-amber-100 text-amber-800' : 'bg-slate-200 text-slate-600'}`}>{n}</span>}
          </button>
        ))}
      </div>

      {shown.length === 0 ? (
        <div className="rounded-2xl border-2 border-dashed border-slate-200 bg-white px-6 py-16 text-center text-sm text-slate-500">
          <MessageSquareWarning className="mx-auto mb-2 h-8 w-8 text-slate-300"/>{q ? `Nothing matches "${search}"` : `No ${status.toLowerCase()} payment queries`}
        </div>
      ) : (
        <ul className="space-y-3">
          {shown.map(x => {
            const paidNow = x.fee?.dueAmount <= 0;
            const age = daysSince(x.createdAt);
            return (
              <li key={x._id} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <Link to={`/students/${x.student?._id}`} className="text-base font-bold text-slate-900 hover:text-indigo-700 hover:underline">{x.student?.name}</Link>
                      {status === 'Open' && <span className={`rounded-md px-1.5 py-0.5 text-[11px] font-bold ${age >= 7 ? 'bg-red-50 text-red-700' : age >= 3 ? 'bg-orange-50 text-orange-700' : 'bg-slate-100 text-slate-600'}`}>{age === 0 ? 'today' : `${age} d`}</span>}
                    </div>
                    <div className="text-xs text-slate-500">{[x.student?.enrollmentNumber, x.student?.courseName, x.center?.name, x.student?.phone].filter(Boolean).join(' · ')}</div>
                    <div className="mt-1 text-xs text-slate-500">Raised by <b className="text-slate-700">{x.raisedBy?.name}</b> on {fmtDt(x.createdAt)}{x.viewers?.length ? ` · to ${x.viewers.map(v => v.name).join(', ')}` : ''}</div>
                  </div>
                  <div className={`rounded-xl px-3 py-2 text-right text-sm ${paidNow ? 'bg-emerald-50' : 'bg-amber-50'}`}>
                    <div className={`font-bold ${paidNow ? 'text-emerald-700' : 'text-amber-800'}`}>{paidNow ? 'Course fee paid' : `${money(x.fee?.dueAmount)} due`}</div>
                    <div className="text-xs text-slate-600">paid {money(x.fee?.paidAmount)} of {money(x.fee?.netFee)}{x.fee?.pendingAmount > 0 ? ` · ${money(x.fee.pendingAmount)} to verify` : ''}</div>
                    <div className="text-[11px] text-slate-500">when raised: {money(x.feeAtRaise?.dueAmount)} due</div>
                  </div>
                </div>

                {x.message && <p className="mt-3 rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-700">{x.message}</p>}

                {x.updates?.length > 0 && (
                  <ol className="mt-3 space-y-2 border-l-2 border-slate-200 pl-3">
                    {x.updates.map(u => (
                      <li key={u._id} className="text-sm">
                        <span className="font-semibold text-slate-800">{u.by?.name || '—'}</span>
                        <span className="text-xs text-slate-500"> · {fmtFull(u.at)}</span>
                        <div className="text-slate-700">{u.text}</div>
                      </li>
                    ))}
                  </ol>
                )}

                {status === 'Open' ? (
                  <div className="mt-3 flex flex-wrap items-end gap-2 border-t border-slate-100 pt-3">
                    <Textarea value={drafts[x._id] || ''} onChange={e => setDrafts(d => ({ ...d, [x._id]: e.target.value }))} rows={1}
                      placeholder="What happened — talked to the centre, promised date…" className="min-h-[40px] flex-1 basis-72"/>
                    <Button variant="outline" disabled={busy === x._id || !(drafts[x._id] || '').trim()} onClick={() => addUpdate(x)}><Send className="mr-1.5 h-4 w-4"/>Add update</Button>
                    <Button className="bg-emerald-600 hover:bg-emerald-700" disabled={busy === x._id} onClick={() => { setClosing(x); setCloseNote(paidNow ? 'Course fee received' : ''); }}>
                      <CheckCircle2 className="mr-1.5 h-4 w-4"/>Close query
                    </Button>
                  </div>
                ) : (
                  <p className="mt-3 border-t border-slate-100 pt-3 text-sm text-emerald-700">
                    Closed {fmtDt(x.closedAt)}{x.closedBy?.name ? ` by ${x.closedBy.name}` : ''}{x.closeNote ? ` — “${x.closeNote}”` : ''}
                  </p>
                )}
              </li>
            );
          })}
        </ul>
      )}

      <Dialog open={!!closing} onOpenChange={open => { if (!open) setClosing(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Close the payment query?</DialogTitle></DialogHeader>
          <p className="text-sm text-slate-600">
            {closing?.student?.name} · {closing?.fee?.dueAmount > 0 ? <b className="text-amber-800">{money(closing.fee.dueAmount)} still due in the system</b> : <b className="text-emerald-700">course fee paid</b>}.
            Close it only once it is confirmed — the counselor{user?.role === 'ViewerCounselor' ? '' : ' and the Viewer Counselor'} will be told.
          </p>
          <div>
            <Label className="text-xs font-semibold text-slate-600">Note</Label>
            <Textarea value={closeNote} onChange={e => setCloseNote(e.target.value)} rows={2} placeholder="e.g. Centre paid ₹10,000 on 2 Dec" className="mt-1"/>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setClosing(null)}>Cancel</Button>
            <Button className="bg-emerald-600 hover:bg-emerald-700" disabled={!!busy} onClick={close}>{busy && <Loader2 className="mr-1.5 h-4 w-4 animate-spin"/>}Confirm and close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
