import { useCallback, useEffect, useState } from 'react';
import { CheckCircle2, Clock, Eye, EyeOff, FileText, Loader2, Paperclip, Pencil, Plus, Trash2, Wallet } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { DOCUMENT_OPTIONS } from '@/lib/documentOptions';
import { paymentAccountsApi, MEDIA } from '@/lib/api';
import { useAuth } from '@/context/AuthContext';

const ymd = () => { const x = new Date(); return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`; };
const day = d => (d ? new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '');
const inr = n => `₹${Number(n || 0).toLocaleString('en-IN')}`;
const selectCls = 'h-9 w-full rounded-md border border-input bg-background px-2 text-sm';

function PaymentForm({ doc, accounts, onSubmit, onCancel, busy }) {
  const [f, setF] = useState({ amount: String(doc.due || ''), mode: 'UPI', utrRef: '', paidAt: ymd(), accountId: '', note: '' });
  const [file, setFile] = useState(null);
  const set = patch => setF(p => ({ ...p, ...patch }));
  const bad = !(Number(f.amount) > 0) || Number(f.amount) > doc.due + 0.01 || !f.utrRef.trim();
  const submit = () => {
    const fd = new FormData();
    Object.entries(f).forEach(([k, v]) => fd.append(k, v));
    if (file) fd.append('paymentScreenshot', file);
    onSubmit(fd);
  };
  return (
    <div className="mt-2 space-y-2 rounded-md border bg-muted/30 p-3">
      <div className="grid gap-2 md:grid-cols-4">
        <label className="text-xs">Amount (₹)<Input type="number" min="0" value={f.amount} onChange={e => set({ amount: e.target.value })} /></label>
        <label className="text-xs">Mode
          <select className={selectCls} value={f.mode} onChange={e => set({ mode: e.target.value })}><option value="UPI">UPI</option><option value="Bank Transfer">Bank Transfer</option></select>
        </label>
        <label className="text-xs">UTR / reference *<Input value={f.utrRef} onChange={e => set({ utrRef: e.target.value })} /></label>
        <label className="text-xs">Payment date<Input type="date" value={f.paidAt} onChange={e => set({ paidAt: e.target.value })} /></label>
        <label className="text-xs md:col-span-2">Received in account
          <select className={selectCls} value={f.accountId} onChange={e => { const a = accounts.find(x => x._id === e.target.value); set({ accountId: e.target.value, mode: a?.mode || f.mode }); }}>
            <option value="">— Not specified —</option>{accounts.map(a => <option key={a._id} value={a._id}>{a.label}{a.mode ? ` (${a.mode})` : ''}</option>)}
          </select>
        </label>
        <label className="text-xs">Screenshot (optional)<Input type="file" accept="image/*,.pdf" onChange={e => setFile(e.target.files?.[0] || null)} /></label>
        <label className="text-xs">Note<Input value={f.note} onChange={e => set({ note: e.target.value })} /></label>
      </div>
      {Number(f.amount) > doc.due + 0.01 && <div className="text-xs text-red-600">More than the balance of {inr(doc.due)}</div>}
      <div className="flex justify-end gap-2">
        <Button size="sm" variant="outline" onClick={onCancel} disabled={busy}>Cancel</Button>
        <Button size="sm" onClick={submit} disabled={busy || bad}>{busy && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}Save payment</Button>
      </div>
    </div>
  );
}

// Documents of one student (degree, marksheets, other documents), each with a fee and its payments.
// api = { list(id), add(id, body), update(id, docId, body), remove(id, docId), addPayment(id, docId, formData) }
// category: 'Other' (degree / other documents) or 'Marksheet'. canEdit=false is the read-only view (the centre sees only what was shown to it).
export default function StudentDocsPanel({ studentId, api, canEdit, onChange, category = 'Other', asCentre = false }) {
  const isMarksheet = category === 'Marksheet';
  const options = DOCUMENT_OPTIONS.filter(o => /marksheet|transcript/i.test(o) === isMarksheet);
  const isAdmin = useAuth().user?.role === 'Admin';
  const [docs, setDocs] = useState(null);
  const [accounts, setAccounts] = useState([]);
  const [name, setName] = useState('');
  const [fee, setFee] = useState('');
  const [busy, setBusy] = useState(false);
  const [paying, setPaying] = useState(null);       // docId with the payment form open
  const [feeEdit, setFeeEdit] = useState(null);     // { id, value }

  const load = useCallback(() => api.list(studentId, category, asCentre).then(setDocs).catch(e => { toast.error(e.message); setDocs([]); }), [api, studentId, category, asCentre]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => { paymentAccountsApi.list().then(a => setAccounts((a || []).filter(x => x.isActive !== false))).catch(() => {}); }, []);

  const run = async (fn, okMsg) => {
    setBusy(true);
    try { const next = await fn(); setDocs(next); onChange?.(next); if (okMsg) toast.success(okMsg); return true; }
    catch (e) { toast.error(e.message); return false; }
    finally { setBusy(false); }
  };
  const add = async () => { if (await run(() => api.add(studentId, { name: name.trim(), chargeFee: Number(fee) || 0, category }), 'Document added')) { setName(''); setFee(''); } };

  return (
    <div className="space-y-3">
      {canEdit && (
        <div className="rounded-lg border bg-muted/30 p-3">
          <div className="grid gap-2 md:grid-cols-[1.6fr_160px_auto]">
            <div>
              <Input list={`student-doc-options-${category}`} value={name} onChange={e => setName(e.target.value)} placeholder={isMarksheet ? 'Marksheet (e.g. Marksheet Year One)' : 'Document (e.g. Degree Certificate)'} onKeyDown={e => e.key === 'Enter' && name.trim() && add()} />
              <datalist id={`student-doc-options-${category}`}>{options.map(o => <option key={o} value={o} />)}</datalist>
            </div>
            <Input type="number" min="0" value={fee} onChange={e => setFee(e.target.value)} placeholder="Fee (₹)" />
            <Button onClick={add} disabled={busy || !name.trim()}><Plus className="mr-1.5 h-4 w-4" />{isMarksheet ? 'Add marksheet' : 'Add document'}</Button>
          </div>
          <p className="mt-2 text-xs text-muted-foreground">Add each {isMarksheet ? 'marksheet' : 'document'} with its fee, upload the file, then add the payment against it. It shows in the Payment Desk Day Book and Document Status. Use “Show to centre” to let the centre see it.</p>
        </div>
      )}
      {docs === null && <div className="py-6 text-center text-sm text-muted-foreground">Loading…</div>}
      {docs?.length === 0 && (
        <div className="rounded-lg border border-dashed py-10 text-center"><FileText className="mx-auto mb-2 h-8 w-8 text-muted-foreground" /><p className="text-sm text-muted-foreground">{canEdit ? `No ${isMarksheet ? 'marksheets' : 'documents'} added yet` : 'Nothing has been shared with the centre yet'}</p></div>
      )}
      {docs?.map(d => (
        <div key={d._id} className="rounded-lg border bg-card p-3 text-sm">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2 font-medium"><FileText className="h-4 w-4 text-indigo-600" />{d.name}</div>
            <div className="flex flex-wrap items-center gap-3 text-xs">
              {feeEdit?.id === d._id ? (
                <span className="flex items-center gap-1">
                  <Input type="number" className="h-7 w-24" value={feeEdit.value} onChange={e => setFeeEdit({ id: d._id, value: e.target.value })} />
                  <Button size="sm" className="h-7 px-2" disabled={busy} onClick={async () => { if (await run(() => api.update(studentId, d._id, { chargeFee: Number(feeEdit.value) || 0 }), 'Fee updated')) setFeeEdit(null); }}>Save</Button>
                  <Button size="sm" variant="ghost" className="h-7 px-2" onClick={() => setFeeEdit(null)}>Cancel</Button>
                </span>
              ) : (
                <span>Fee <b className="tabular-nums">{inr(d.chargeFee)}</b>{canEdit && <button type="button" className="ml-1 text-muted-foreground hover:text-foreground" title="Change fee" onClick={() => setFeeEdit({ id: d._id, value: String(d.chargeFee || '') })}><Pencil className="inline h-3 w-3" /></button>}</span>
              )}
              <span>Paid <b className="tabular-nums text-emerald-700">{inr(d.paid)}</b></span>
              <span>Balance <b className={`tabular-nums ${d.due > 0 ? 'text-red-600' : 'text-emerald-700'}`}>{inr(d.due)}</b></span>
              {canEdit && d.due > 0 && d.chargeFee > 0 && <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setPaying(paying === d._id ? null : d._id)}><Wallet className="mr-1 h-3.5 w-3.5" />Add payment</Button>}
              {canEdit && (d.payments.length === 0 || isAdmin) && <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-red-600" disabled={busy} title={d.payments.length ? 'Delete this document and its payments (Admin)' : 'Remove this document'}
                onClick={() => { if (d.payments.length && !window.confirm(`Delete "${d.name}" and its ${d.payments.length} payment${d.payments.length === 1 ? '' : 's'} (${inr(d.paid)})? This cannot be undone.`)) return; run(() => api.remove(studentId, d._id), 'Document deleted'); }}><Trash2 className="h-4 w-4" /></Button>}
            </div>
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
            {d.fileUrl
              ? <a className="inline-flex items-center gap-1 rounded border bg-muted/30 px-2 py-1 text-indigo-700 hover:bg-muted" href={`${MEDIA}${d.fileUrl}`} target="_blank" rel="noreferrer" title={d.fileName}><Paperclip className="h-3.5 w-3.5" />View file{d.fileName ? ` · ${d.fileName.slice(0, 28)}` : ''}</a>
              : <span className="text-muted-foreground">No file uploaded</span>}
            {canEdit && (
              <label className="inline-flex cursor-pointer items-center gap-1 rounded border px-2 py-1 hover:bg-muted">
                <Paperclip className="h-3.5 w-3.5" />{d.fileUrl ? 'Replace file' : 'Upload file / screenshot'}
                <input type="file" accept="image/*,.pdf" className="hidden" disabled={busy}
                  onChange={async e => { const f = e.target.files?.[0]; e.target.value = ''; if (!f) return; const fd = new FormData(); fd.append('file', f); await run(() => api.uploadFile(studentId, d._id, fd), 'File uploaded'); }} />
              </label>
            )}
            {canEdit && (
              <Button size="sm" variant={d.visibleToCenter ? 'default' : 'outline'} className="h-7 text-xs" disabled={busy}
                title={d.visibleToCenter ? 'The centre can see this. Click to hide it again.' : 'Let the centre see this document'}
                onClick={() => run(() => api.setVisible(studentId, d._id, !d.visibleToCenter), d.visibleToCenter ? 'Hidden from the centre' : 'Now visible to the centre')}>
                {d.visibleToCenter ? <Eye className="mr-1 h-3.5 w-3.5" /> : <EyeOff className="mr-1 h-3.5 w-3.5" />}{d.visibleToCenter ? 'Shown to centre' : 'Show to centre'}
              </Button>
            )}
          </div>
          {d.payments.length > 0 && (
            <div className="mt-2 space-y-1">
              {d.payments.map(p => (
                <div key={p._id} className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded border bg-muted/20 px-2.5 py-1.5 text-xs">
                  <b className="tabular-nums text-emerald-700">{inr(p.amount)}</b>
                  <span>{p.mode}</span>
                  <span>UTR <b>{p.utrRef}</b></span>
                  <span>{day(p.paidAt)}</span>
                  {p.accountName && <span>{p.accountName}</span>}
                  {p.screenshot && <a className="text-indigo-600 underline" href={`${MEDIA}${p.screenshot}`} target="_blank" rel="noreferrer">screenshot</a>}
                  {p.note && <span className="text-muted-foreground">{p.note}</span>}
                  <span className={`ml-auto inline-flex items-center gap-1 ${p.verified ? 'text-emerald-700' : 'text-amber-700'}`}>{p.verified ? <CheckCircle2 className="h-3.5 w-3.5" /> : <Clock className="h-3.5 w-3.5" />}{p.verified ? 'verified' : 'waiting for verification'}</span>
                  {canEdit && isAdmin && <Button size="sm" variant="ghost" className="h-6 w-6 p-0 text-red-600" disabled={busy} title="Delete this payment (Admin)"
                    onClick={() => { if (window.confirm(`Delete this payment of ${inr(p.amount)} (UTR ${p.utrRef})? This cannot be undone.`)) run(() => api.removePayment(studentId, d._id, p._id), 'Payment deleted'); }}><Trash2 className="h-3.5 w-3.5" /></Button>}
                </div>
              ))}
            </div>
          )}
          {paying === d._id && <PaymentForm doc={d} accounts={accounts} busy={busy} onCancel={() => setPaying(null)}
            onSubmit={async fd => { if (await run(() => api.addPayment(studentId, d._id, fd), 'Payment added')) setPaying(null); }} />}
        </div>
      ))}
    </div>
  );
}
