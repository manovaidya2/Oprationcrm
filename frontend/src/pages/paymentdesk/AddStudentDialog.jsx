import { useState } from 'react';
import { AlertTriangle, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { deskApi } from '@/lib/api';
import { cn } from '@/lib/utils';
import { Field, ScreenshotField } from './shared';
import { EPS, fmt, r2, selectCls, todayYmd, useMeta } from './helpers';

const STAGES = [
  ['Submitted', 'Submitted (waiting for counsellor approval)'],
  ['Counselor_Approved', 'Counsellor approved'],
  ['Sent_To_University', 'Sent to university'],
  ['Enrolled', 'Enrolled (enrollment number needed)'],
];
const blank = () => ({
  name: '', fatherName: '', phone: '', email: '', gender: '', centerId: '', courseName: '', courseYear: '', universityId: '', applicationStatus: 'Submitted', enrollmentNumber: '',
  totalFee: '', discount: '',
  amount: '', mode: 'UPI', utrRef: '', paidAt: todayYmd(), accountId: '', note: '',
});

// Add a new student from the Day Book: basic details, centre, fee and (optionally) the first payment, all in one go.
export default function AddStudentDialog({ open, onClose, onSaved }) {
  const meta = useMeta();
  const accounts = (meta?.accounts || []).filter(a => a.isActive !== false);
  const universities = (meta?.universities || []).filter(u => u.isActive !== false);
  const [f, setF] = useState(blank);
  const [file, setFile] = useState(null);
  const [busy, setBusy] = useState(false);
  const [dup, setDup] = useState(null);
  const set = patch => setF(p => ({ ...p, ...patch }));

  const total = Number(f.totalFee) || 0, discount = Number(f.discount) || 0;
  const net = Math.max(0, r2(total - discount));
  const amount = Number(f.amount) || 0;
  const paying = amount > 0;
  const overFee = paying && amount > net + EPS;
  const badDiscount = discount > total;
  const enrolledNeedsNo = f.applicationStatus === 'Enrolled' && !f.enrollmentNumber.trim();
  const ready = f.name.trim() && f.centerId && !badDiscount && !enrolledNeedsNo && (!paying || (net > 0 && !overFee && f.utrRef.trim() && f.paidAt));

  const close = () => { if (busy) return; setF(blank()); setFile(null); setDup(null); onClose(); };
  const save = async (confirmDuplicate = false) => {
    setBusy(true);
    try {
      const fd = new FormData();
      Object.entries(f).forEach(([k, v]) => fd.append(k, v ?? ''));
      if (confirmDuplicate) fd.append('confirmDuplicate', 'true');
      if (paying && file) fd.append('paymentScreenshot', file);
      const s = await deskApi.addStudent(fd);
      toast.success(`${s.name} added${paying ? ` with a verified payment of ${fmt(amount)}` : ''}. Balance ${fmt(s.due)}.`);
      setF(blank()); setFile(null); setDup(null);
      onSaved(s);
    } catch (e) {
      if (e.status === 409 && e.details?.duplicateMatches) setDup(e.details.duplicateMatches);
      else toast.error(e.message);
    } finally { setBusy(false); }
  };

  return (
    <Dialog open={open} onOpenChange={o => !o && close()}>
      <DialogContent className="max-h-[94vh] max-w-4xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Add student</DialogTitle>
          <DialogDescription>Create the student with their centre, fee and (if they have already paid) the first payment. The payment is saved as <b>verified</b>. The centre and counsellor are told.</DialogDescription>
        </DialogHeader>

        <section className="space-y-3">
          <h4 className="text-sm font-semibold text-slate-800">1. Centre and student details</h4>
          <div className="grid gap-3 md:grid-cols-3">
            <Field label="Centre *" className="md:col-span-2">
              <select className={selectCls} value={f.centerId} onChange={e => set({ centerId: e.target.value })}>
                <option value="">Select the centre this student is from…</option>
                {(meta?.centers || []).map(c => <option key={c._id} value={c._id}>{c.name || c.organisationName}{c.city ? ` · ${c.city}` : ''}</option>)}
              </select>
            </Field>
            <Field label="Status">
              <select className={selectCls} value={f.applicationStatus} onChange={e => set({ applicationStatus: e.target.value })}>
                {STAGES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </Field>
            <Field label="Student name *" className="md:col-span-2"><Input autoFocus value={f.name} onChange={e => set({ name: e.target.value })} /></Field>
            <Field label="Father's name"><Input value={f.fatherName} onChange={e => set({ fatherName: e.target.value })} /></Field>
            <Field label="Phone"><Input value={f.phone} onChange={e => set({ phone: e.target.value })} placeholder="10-digit mobile" /></Field>
            <Field label="Email"><Input type="email" value={f.email} onChange={e => set({ email: e.target.value })} /></Field>
            <Field label="Gender">
              <select className={selectCls} value={f.gender} onChange={e => set({ gender: e.target.value })}>
                <option value="">—</option><option>Male</option><option>Female</option><option>Other</option>
              </select>
            </Field>
            <Field label="Course"><Input value={f.courseName} onChange={e => set({ courseName: e.target.value })} placeholder="e.g. BCOM" /></Field>
            <Field label="Course year / semester"><Input value={f.courseYear} onChange={e => set({ courseYear: e.target.value })} placeholder="e.g. 1st year" /></Field>
            <Field label="University">
              <select className={selectCls} value={f.universityId} onChange={e => set({ universityId: e.target.value })}>
                <option value="">—</option>{universities.map(u => <option key={u._id} value={u._id}>{u.name}</option>)}
              </select>
            </Field>
            {f.applicationStatus === 'Enrolled' && (
              <Field label="Enrollment number *"><Input value={f.enrollmentNumber} onChange={e => set({ enrollmentNumber: e.target.value })} className={cn(enrolledNeedsNo && 'border-red-400')} /></Field>
            )}
          </div>
        </section>

        <section className="space-y-3">
          <h4 className="text-sm font-semibold text-slate-800">2. Fee</h4>
          <div className="grid gap-3 md:grid-cols-3">
            <Field label="Total fee (₹)"><Input type="number" min="0" value={f.totalFee} onChange={e => set({ totalFee: e.target.value })} /></Field>
            <Field label="Discount (₹)">
              <Input type="number" min="0" value={f.discount} onChange={e => set({ discount: e.target.value })} className={cn(badDiscount && 'border-red-400')} />
              {badDiscount && <span className="text-[11px] text-red-600">More than the total fee</span>}
            </Field>
            <div className="flex items-end"><div className="w-full rounded-md border border-slate-300 bg-slate-50 px-3 py-2 text-sm">Fee to pay <b className="float-right tabular-nums">{fmt(net)}</b></div></div>
          </div>
        </section>

        <section className="space-y-3">
          <h4 className="text-sm font-semibold text-slate-800">3. Payment already received <span className="font-normal text-slate-500">(optional)</span></h4>
          <div className="grid gap-3 md:grid-cols-4">
            <Field label="Amount paid (₹)">
              <Input type="number" min="0" value={f.amount} onChange={e => set({ amount: e.target.value })} className={cn(overFee && 'border-red-400')} />
              {overFee && <span className="text-[11px] text-red-600">More than the fee to pay ({fmt(net)})</span>}
            </Field>
            <Field label="Date of UTR (payment date)"><Input type="date" value={f.paidAt} disabled={!paying} onChange={e => set({ paidAt: e.target.value })} /></Field>
            <Field label="UTR / reference no. *" className="md:col-span-2"><Input value={f.utrRef} disabled={!paying} onChange={e => { set({ utrRef: e.target.value }); setDup(null); }} placeholder={paying ? 'e.g. 4123 5678 9012' : 'Enter an amount first'} /></Field>
            <Field label="Mode">
              <select className={selectCls} value={f.mode} disabled={!paying} onChange={e => set({ mode: e.target.value })}>
                <option value="UPI">UPI</option><option value="Bank Transfer">Bank Transfer</option>
              </select>
            </Field>
            <Field label="Account name (received in)" className="md:col-span-2">
              <select className={selectCls} value={f.accountId} disabled={!paying} onChange={e => { const a = accounts.find(x => x._id === e.target.value); set({ accountId: e.target.value, mode: a?.mode || f.mode }); }}>
                <option value="">— Not specified —</option>{accounts.map(a => <option key={a._id} value={a._id}>{a.label} ({a.mode})</option>)}
              </select>
            </Field>
            <Field label="Note (optional)"><Input value={f.note} disabled={!paying} onChange={e => set({ note: e.target.value })} /></Field>
          </div>
          {paying && <ScreenshotField file={file} onFile={setFile} />}
          {paying && !overFee && net > 0 && <div className="text-xs text-slate-600">Balance after this payment: <b>{fmt(Math.max(0, r2(net - amount)))}</b></div>}
          {dup?.length > 0 && (
            <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900">
              <AlertTriangle className="mr-1 inline h-3.5 w-3.5" /><b>This UTR is already on other payments:</b>
              <ul className="mt-1 list-disc pl-5">{dup.slice(0, 6).map((m, i) => <li key={i}>{m.source}: {m.studentName} — {fmt(m.amount)}</li>)}</ul>
              Save only if this is genuinely a different bank transfer.
            </div>
          )}
        </section>

        <DialogFooter className="items-center gap-2">
          <span className="mr-auto text-xs text-slate-500">{ready ? 'Ready to save' : 'Fill the fields marked *'}</span>
          <Button variant="outline" onClick={close} disabled={busy}>Cancel</Button>
          <Button onClick={() => save(!!dup)} disabled={busy || !ready}>
            {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}{dup ? 'Save anyway' : paying ? 'Add student and payment' : 'Add student'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
