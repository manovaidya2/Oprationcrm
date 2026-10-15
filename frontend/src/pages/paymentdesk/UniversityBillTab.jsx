import { Field, Pill, Stat, RangeBar, DownloadBtn, Spinner } from './shared';
import {
  useMemo, useState } from 'react';
import { ArrowLeft, Loader2, Lock, Plus, Save, Trash2, Unlock, Users } from 'lucide-react';
import { toast } from 'sonner';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { deskApi } from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import { cn } from '@/lib/utils';
import {
  selectCls, fmt, fmtDate, r2, todayYmd, monthStartYmd, dateInput, useMeta, useDeskData, TABLE_WRAP, TH, TD, ROW, ROW_CLICK, SUMMARY,
} from './helpers';

const NUM_FIELDS = ['totalFee', 'discount', 'oldAdjust', 'prevOutstanding'];
const n = v => Number(v) || 0;
// payable = fee − discount − old adjust;  total outstanding = payable + outstanding of previous amount
const calc = r => { const payable = r2(n(r.totalFee) - n(r.discount) - n(r.oldAdjust)); return { payable, outstanding: r2(payable + n(r.prevOutstanding)) }; };
let uidSeq = 0;
const toRow = (r, include = true) => ({
  uid: `${r._id || r.document || r.student || 'manual'}-${uidSeq++}`, include,
  kind: r.kind, student: r.student || null, document: r.document || null, date: r.date ? dateInput(r.date) : '',
  enrollment: r.enrollment || '', name: r.name || '', course: r.course || '', docType: r.docType || '',
  totalFee: String(r.totalFee ?? 0), discount: String(r.discount ?? 0), oldAdjust: String(r.oldAdjust ?? 0), prevOutstanding: String(r.prevOutstanding ?? 0),
  billed: r.billed || null,
});

// ── Editor ───────────────────────────────────────────────────
function Editor({ draft, onBack, onChanged }) {
  const { user } = useAuth();
  const [bill, setBill] = useState(draft);
  const [busy, setBusy] = useState(false);
  const locked = bill.status === 'Final';
  const setRow = (uid, patch) => setBill(b => ({ ...b, rows: b.rows.map(r => r.uid === uid ? { ...r, ...patch } : r) }));
  const used = bill.rows.filter(r => r.include);

  const totals = useMemo(() => used.reduce((t, r) => {
    const c = calc(r);
    return { fee: r2(t.fee + n(r.totalFee)), discount: r2(t.discount + n(r.discount)), adj: r2(t.adj + n(r.oldAdjust)), prev: r2(t.prev + n(r.prevOutstanding)), payable: r2(t.payable + c.payable), outstanding: r2(t.outstanding + c.outstanding) };
  }, { fee: 0, discount: 0, adj: 0, prev: 0, payable: 0, outstanding: 0 }), [used]);

  const payload = () => ({
    universityId: bill.universityId, title: bill.title, from: bill.from, to: bill.to, note: bill.note,
    rows: used.map(r => ({ kind: r.kind, student: r.student, document: r.document, date: r.date || undefined, enrollment: r.enrollment, name: r.name, course: r.course, docType: r.docType,
      totalFee: n(r.totalFee), discount: n(r.discount), oldAdjust: n(r.oldAdjust), prevOutstanding: n(r.prevOutstanding) })),
  });

  const save = async () => {
    if (!bill.title.trim()) return toast.error('Give the bill a title, e.g. "October 2026"');
    if (!used.length) return toast.error('Tick at least one row');
    setBusy(true);
    try {
      const saved = bill.id ? await deskApi.updateBill(bill.id, payload()) : await deskApi.createBill(payload());
      setBill(b => ({ ...b, id: saved._id, status: saved.status }));
      toast.success('Bill saved');
      onChanged();
    } catch (e) { toast.error(e.message); }
    finally { setBusy(false); }
  };
  const setStatus = async (status) => {
    setBusy(true);
    try {
      if (status === 'Final') await deskApi.updateBill(bill.id, payload());   // save latest values first
      const saved = await deskApi.updateBill(bill.id, { status });
      setBill(b => ({ ...b, status: saved.status }));
      toast.success(status === 'Final' ? 'Bill marked final and locked' : 'Bill re-opened');
      onChanged();
    } catch (e) { toast.error(e.message); }
    finally { setBusy(false); }
  };
  const remove = async () => {
    if (!window.confirm(`Delete the bill "${bill.title}"?`)) return;
    try { await deskApi.deleteBill(bill.id); toast.success('Bill deleted'); onChanged(); onBack(); }
    catch (e) { toast.error(e.message); }
  };
  const addRow = () => setBill(b => ({ ...b, rows: [...b.rows, toRow({ kind: 'Student', name: '', date: todayYmd() })] }));

  const cell = (r, f) => (
    <input type="number" min="0" disabled={locked || !r.include} value={r[f]} onChange={e => setRow(r.uid, { [f]: e.target.value })}
      className="h-8 w-24 rounded-md border border-input bg-white px-2 text-right text-sm tabular-nums disabled:bg-slate-50 disabled:text-slate-400" />
  );

  return (
    <div className="space-y-4">
      <Card><CardContent className="space-y-3 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Button size="sm" variant="ghost" onClick={onBack}><ArrowLeft className="mr-1 h-4 w-4" />All bills</Button>
          <div className="flex flex-wrap items-center gap-2">
            {bill.status && <Pill tone={locked ? 'bg-slate-800 text-white border-slate-800' : 'bg-amber-50 text-amber-700 border-amber-200'}>{locked ? 'Final' : 'Draft'}</Pill>}
            {bill.id && <DownloadBtn path={`/payment-desk/export/university-bills/${bill.id}.csv`} />}
            {bill.id && (locked
              ? <Button size="sm" variant="outline" onClick={() => setStatus('Draft')} disabled={busy}><Unlock className="mr-1.5 h-3.5 w-3.5" />Re-open</Button>
              : <Button size="sm" variant="outline" onClick={() => setStatus('Final')} disabled={busy}><Lock className="mr-1.5 h-3.5 w-3.5" />Mark final</Button>)}
            {bill.id && (user?.role === 'Admin' || !locked) && <Button size="sm" variant="ghost" className="text-red-600" onClick={remove}><Trash2 className="mr-1 h-4 w-4" />Delete</Button>}
            {!locked && <Button size="sm" onClick={save} disabled={busy}>{busy ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Save className="mr-1.5 h-4 w-4" />}Save bill</Button>}
          </div>
        </div>
        <div className="grid gap-3 md:grid-cols-4">
          <Field label="University"><Input disabled value={bill.universityName} /></Field>
          <Field label="Bill title"><Input disabled={locked} value={bill.title} onChange={e => setBill(b => ({ ...b, title: e.target.value }))} placeholder="e.g. October 2026" /></Field>
          <Field label="Period"><Input disabled value={`${bill.from ? fmtDate(bill.from) : '—'} to ${bill.to ? fmtDate(bill.to) : '—'}`} /></Field>
          <Field label="Note"><Input disabled={locked} value={bill.note || ''} onChange={e => setBill(b => ({ ...b, note: e.target.value }))} /></Field>
        </div>
        <div className="rounded-md bg-indigo-50 px-3 py-2 text-xs text-indigo-900">
          Students and documents are fetched for you. <b>Total fee</b> starts as the student's fee in the CRM. Type the university's fee over it, and fill discount, old adjust and the outstanding of the previous amount.
          Payable = fee − discount − old adjust. Total outstanding = payable + previous outstanding. Untick a row to leave it out of this bill.
        </div>
        <div className={SUMMARY}>
          <Stat label="Rows in bill" value={used.length} />
          <Stat label="Total fee" value={fmt(totals.fee)} />
          <Stat label="Discount" value={fmt(totals.discount)} />
          <Stat label="Old adjust" value={fmt(totals.adj)} />
          <Stat label="Previous outstanding" value={fmt(totals.prev)} />
          <Stat label="Payable" value={fmt(totals.payable)} tone="text-indigo-700" />
          <Stat label="Total outstanding" value={fmt(totals.outstanding)} tone="text-red-600" />
        </div>
      </CardContent></Card>

      <div className={TABLE_WRAP}>
        <table className="w-full min-w-[1200px] text-[13px]">
          <thead className="bg-slate-50"><tr>
            <th className="w-10 p-2" />
            {['Date of transaction', 'Enrollment', 'Name of student', 'Course', 'Type of document'].map(h => <th key={h} className={TH}>{h}</th>)}
            {['Total fee', 'Discount', 'Old adjust', 'Outstanding of previous amount', 'Payable', 'Total outstanding'].map(h => <th key={h} className={cn(TH, 'text-right')}>{h}</th>)}
          </tr></thead>
          <tbody>
            {bill.rows.length === 0 && <tr><td colSpan={12} className="p-10 text-center text-slate-400">No students or documents found for this university in this period</td></tr>}
            {bill.rows.map(r => {
              const c = calc(r);
              return (
                <tr key={r.uid} className={cn(ROW, !r.include && 'text-slate-400')}>
                  <td className="p-2 text-center"><input type="checkbox" disabled={locked} checked={r.include} onChange={e => setRow(r.uid, { include: e.target.checked })} /></td>
                  <td className={cn(TD, 'whitespace-nowrap')}>{r.date ? fmtDate(r.date) : '—'}</td>
                  <td className={TD}>{r.student || r.document ? r.enrollment : <Input className="h-8 w-28" disabled={locked} value={r.enrollment} onChange={e => setRow(r.uid, { enrollment: e.target.value })} />}</td>
                  <td className={TD}>{r.student || r.document ? <span className="font-medium">{r.name}</span> : <Input className="h-8 w-40" disabled={locked} value={r.name} onChange={e => setRow(r.uid, { name: e.target.value })} placeholder="Student name" />}
                    {r.billed && <div className="mt-0.5"><Pill tone="bg-amber-50 text-amber-700 border-amber-200">already in “{r.billed.title}”</Pill></div>}</td>
                  <td className={TD}>{r.course}</td>
                  <td className={TD}>{r.student || r.document ? r.docType : <Input className="h-8 w-36" disabled={locked} value={r.docType} onChange={e => setRow(r.uid, { docType: e.target.value })} placeholder="ADMISSION / document" />}</td>
                  <td className={cn(TD, 'text-right')}>{cell(r, 'totalFee')}</td>
                  <td className={cn(TD, 'text-right')}>{cell(r, 'discount')}</td>
                  <td className={cn(TD, 'text-right')}>{cell(r, 'oldAdjust')}</td>
                  <td className={cn(TD, 'text-right')}>{cell(r, 'prevOutstanding')}</td>
                  <td className={cn(TD, 'text-right tabular-nums', r.include && 'font-medium')}>{r.include ? fmt(c.payable) : '—'}</td>
                  <td className={cn(TD, 'text-right tabular-nums', r.include && 'font-semibold text-red-600')}>{r.include ? fmt(c.outstanding) : '—'}</td>
                </tr>
              );
            })}
            {bill.rows.length > 0 && (
              <tr className="border-t-2 border-slate-300 bg-slate-100 font-semibold">
                <td colSpan={6} className={TD}>Total ({used.length} rows)</td>
                <td className={cn(TD, 'text-right tabular-nums')}>{fmt(totals.fee)}</td><td className={cn(TD, 'text-right tabular-nums')}>{fmt(totals.discount)}</td>
                <td className={cn(TD, 'text-right tabular-nums')}>{fmt(totals.adj)}</td><td className={cn(TD, 'text-right tabular-nums')}>{fmt(totals.prev)}</td>
                <td className={cn(TD, 'text-right tabular-nums')}>{fmt(totals.payable)}</td><td className={cn(TD, 'text-right tabular-nums text-red-600')}>{fmt(totals.outstanding)}</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {!locked && <Button variant="outline" size="sm" onClick={addRow}><Plus className="mr-1.5 h-4 w-4" />Add a row manually</Button>}
    </div>
  );
}

// ── List + create ────────────────────────────────────────────
export default function UniversityBillTab() {
  const meta = useMeta();
  const [editor, setEditor] = useState(null);
  const [form, setForm] = useState({ universityId: '', from: monthStartYmd(), to: todayYmd() });
  const [fetching, setFetching] = useState(false);
  const { data: bills, loading, reload } = useDeskData(() => deskApi.bills(), []);
  const universities = meta?.universities || [];

  const fetchStudents = async () => {
    if (!form.universityId) return toast.error('Choose a university');
    setFetching(true);
    try {
      const res = await deskApi.billFetch(form);
      const monthName = new Date(form.to).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
      setEditor({
        id: null, status: null, universityId: form.universityId, universityName: res.university.name, title: monthName, from: form.from, to: form.to, note: '',
        rows: res.rows.map(r => toRow(r, !r.billed)),
      });
      if (res.rows.some(r => r.billed)) toast.info('Rows already used in an earlier bill are left unticked.');
    } catch (e) { toast.error(e.message); }
    finally { setFetching(false); }
  };

  const open = async (id) => {
    try {
      const b = await deskApi.bill(id);
      setEditor({ id: b._id, status: b.status, universityId: b.university._id, universityName: b.university.name, title: b.title, from: b.from, to: b.to, note: b.note || '', rows: b.rows.map(r => toRow(r)) });
    } catch (e) { toast.error(e.message); }
  };

  if (editor) return <Editor key={editor.id || 'new'} draft={editor} onBack={() => { setEditor(null); reload(); }} onChanged={reload} />;

  return (
    <div className="space-y-4">
      <Card><CardContent className="space-y-3 p-4">
        <div className="text-sm font-semibold">New university bill</div>
        <div className="flex flex-wrap items-end gap-3">
          <Field label="University" className="w-64">
            <select className={selectCls} value={form.universityId} onChange={e => setForm(p => ({ ...p, universityId: e.target.value }))}>
              <option value="">Select university…</option>
              {universities.map(u => <option key={u._id} value={u._id}>{u.name}{u.isActive === false ? ' (inactive)' : ''}</option>)}
            </select>
          </Field>
          <RangeBar from={form.from} to={form.to} onChange={(from, to) => setForm(p => ({ ...p, from, to }))} />
          <Button onClick={fetchStudents} disabled={fetching || !form.universityId}>
            {fetching ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Users className="mr-2 h-4 w-4" />}Fetch students
          </Button>
        </div>
        <div className="text-xs text-slate-500">Fetches students enrolled with this university, and documents sent to it, between these dates. You then type the university's fee and the other values.</div>
      </CardContent></Card>

      <div className={TABLE_WRAP}>
        <table className="w-full min-w-[800px] text-sm">
          <thead className="bg-slate-50"><tr>
            {['Bill', 'University', 'Period', 'Rows', 'Total fee', 'Payable', 'Total outstanding', 'Status'].map((h, i) => <th key={h} className={cn(TH, i >= 3 && i <= 6 && 'text-right')}>{h}</th>)}
          </tr></thead>
          <tbody>
            {loading && !bills && <tr><td colSpan={8}><Spinner /></td></tr>}
            {bills?.length === 0 && <tr><td colSpan={8} className="p-10 text-center text-slate-400">No bills yet</td></tr>}
            {bills?.map(b => (
              <tr key={b._id} className={ROW_CLICK} onClick={() => open(b._id)}>
                <td className={cn(TD, 'font-medium')}>{b.title}</td><td className={TD}>{b.university?.name}</td>
                <td className={cn(TD, 'whitespace-nowrap')}>{b.from ? fmtDate(b.from) : '—'} to {b.to ? fmtDate(b.to) : '—'}</td>
                <td className={cn(TD, 'text-right')}>{b.rowCount}</td>
                <td className={cn(TD, 'text-right tabular-nums')}>{fmt(b.totals.totalFee)}</td>
                <td className={cn(TD, 'text-right tabular-nums')}>{fmt(b.totals.payable)}</td>
                <td className={cn(TD, 'text-right font-semibold tabular-nums text-red-600')}>{fmt(b.totals.totalOutstanding)}</td>
                <td className={TD}><Pill tone={b.status === 'Final' ? 'bg-slate-800 text-white border-slate-800' : 'bg-amber-50 text-amber-700 border-amber-200'}>{b.status}</Pill></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
