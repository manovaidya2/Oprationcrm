import { useMemo, useState } from 'react';
import { Loader2, Undo2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { deskApi } from '@/lib/api';
import { cn } from '@/lib/utils';
import { Field, ScreenshotField, Spinner } from './shared';
import { fmt, dateInput, selectCls, useDeskData, useMeta, TH, TD, ROW } from './helpers';

// Edit or reverse a whole settlement (payment adjustment). Changes apply to every student on it.
export default function SettlementEditDialog({ settlementId, onClose, onSaved }) {
  const meta = useMeta();
  const accounts = meta?.accounts || [];
  const { data: s, loading } = useDeskData(() => deskApi.settlement(settlementId), [settlementId]);
  const init = useMemo(() => s ? ({ utrRef: s.utrRef || '', paidAt: dateInput(s.paidAt), mode: s.mode, accountId: s.paidToAccount ? String(s.paidToAccount) : '', note: s.note || '' }) : null, [s]);
  const [form, setForm] = useState(null);
  const [file, setFile] = useState(null);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const v = form || init;
  const changed = v ? Object.keys(v).filter(k => String(v[k] ?? '') !== String(init[k] ?? '')) : [];
  const dirty = changed.length + (file ? 1 : 0) > 0;
  const reversed = s?.status === 'Reversed';
  const set = (k, val) => setForm({ ...v, [k]: val });

  const save = async () => {
    setBusy(true);
    try {
      const body = Object.fromEntries(changed.map(k => [k, v[k]]));
      body.reason = reason;
      let payload = body;
      if (file) { payload = new FormData(); Object.entries(body).forEach(([k, val]) => payload.append(k, val ?? '')); payload.append('paymentScreenshot', file); }
      await deskApi.updateSettlement(settlementId, payload);
      toast.success(`Saved. All ${s.studentCount} students' payments from this settlement are updated.`);
      onSaved();
    } catch (e) { toast.error(e.message); }
    finally { setBusy(false); }
  };
  const reverse = async () => {
    if (!window.confirm(`Reverse this whole settlement of ${fmt(s.amount)}? The payment is removed from all ${s.studentCount} students and their balances go back up.`)) return;
    setBusy(true);
    try { await deskApi.reverseSettlement(settlementId, reason); toast.success('Settlement reversed. The balances are restored.'); onSaved(); }
    catch (e) { toast.error(e.message); }
    finally { setBusy(false); }
  };

  return (
    <Dialog open onOpenChange={o => !o && !busy && onClose()}>
      <DialogContent className="max-h-[92vh] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Payment adjustment — {s ? `${fmt(s.amount)} · ${s.studentCount} student${s.studentCount === 1 ? '' : 's'}` : ''}</DialogTitle>
          <DialogDescription>
            This one payment is shared by all the students below. Changing the UTR, date, account or screenshot here changes it on <b>every</b> one of them. It is the same settlement as in Centre Billing.
          </DialogDescription>
        </DialogHeader>
        {loading && !s ? <Spinner /> : s && (
          <div className="space-y-4">
            <div className="max-h-48 overflow-auto rounded-lg border border-slate-300">
              <table className="w-full text-sm">
                <thead className="sticky top-0"><tr><th className={TH}>Student</th><th className={cn(TH, 'text-right')}>Total fee</th><th className={cn(TH, 'text-right')}>Adjusted</th></tr></thead>
                <tbody>
                  {s.allocations.map((a, i) => (
                    <tr key={i} className={ROW}>
                      <td className={TD}>{a.student?.name} <span className="text-xs text-slate-500">{a.student?.enrollmentNumber}</span></td>
                      <td className={cn(TD, 'text-right tabular-nums')}>{fmt(a.totalFee)}</td>
                      <td className={cn(TD, 'text-right font-semibold tabular-nums text-amber-700')}>{fmt(a.amount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {reversed ? (
              <div className="rounded-md border border-slate-300 bg-slate-50 px-3 py-2 text-sm text-slate-700">This settlement was reversed{s.reversalReason ? `: ${s.reversalReason}` : ''}. It can no longer be changed.</div>
            ) : (
              <div className="grid gap-3 md:grid-cols-3">
                <Field label="UTR / reference"><Input value={v.utrRef} onChange={e => set('utrRef', e.target.value)} /></Field>
                <Field label="Payment date"><Input type="date" value={v.paidAt} onChange={e => set('paidAt', e.target.value)} /></Field>
                <Field label="Mode">
                  <select className={selectCls} value={v.mode} onChange={e => set('mode', e.target.value)}><option value="UPI">UPI</option><option value="Bank Transfer">Bank Transfer</option></select>
                </Field>
                <Field label="Received in account" className="md:col-span-2">
                  <select className={selectCls} value={v.accountId} onChange={e => set('accountId', e.target.value)}>
                    <option value="">— Not specified —</option>
                    {accounts.map(a => <option key={a._id} value={a._id}>{a.label} ({a.mode})</option>)}
                  </select>
                </Field>
                <Field label="Note"><Input value={v.note} onChange={e => set('note', e.target.value)} /></Field>
                <div className="md:col-span-3"><ScreenshotField file={file} onFile={setFile} current={s.paymentScreenshot} /></div>
                <Field label="Reason (optional)" className="md:col-span-3"><Textarea value={reason} onChange={e => setReason(e.target.value)} placeholder="Saved in the Activity Log. If empty: “Edited from Payment Desk”." /></Field>
              </div>
            )}
          </div>
        )}
        <DialogFooter className="items-center gap-2">
          {s && !reversed && <Button variant="outline" className="mr-auto border-red-300 text-red-700 hover:bg-red-50" onClick={reverse} disabled={busy}><Undo2 className="mr-1.5 h-4 w-4" />Reverse whole settlement</Button>}
          <Button variant="outline" onClick={onClose} disabled={busy}>Close</Button>
          {s && !reversed && <Button onClick={save} disabled={busy || !dirty}>{busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Save for all {s.studentCount}</Button>}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
