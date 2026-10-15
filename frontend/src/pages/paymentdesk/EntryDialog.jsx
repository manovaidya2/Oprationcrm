import { Field } from './shared';
import {
  useState } from 'react';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { deskApi } from '@/lib/api';
import {
  selectCls, todayYmd, dateInput,
} from './helpers';

const TITLES = { Opening: 'Opening balance', Withdrawal: 'Withdrawal', Expense: 'Expense' };

// Add or edit an Opening balance / Withdrawal / Expense entry.
export default function EntryDialog({ kind: initialKind, entry, accounts, heads, onClose, onSaved }) {
  const editing = !!entry;
  const [kind, setKind] = useState(entry?.kind || initialKind);
  const [f, setF] = useState({
    date: entry ? dateInput(entry.date) : todayYmd(),
    amount: entry ? String(entry.amount) : '',
    mode: entry?.mode || 'Bank',
    accountId: entry?.account?._id || entry?.account || '',
    head: entry?.head || '',
    note: entry?.note || '',
  });
  const [busy, setBusy] = useState(false);
  const set = patch => setF(p => ({ ...p, ...patch }));

  const save = async () => {
    setBusy(true);
    try {
      const body = { ...f, kind, amount: Number(f.amount) };
      if (editing) await deskApi.updateEntry(entry._id, body); else await deskApi.createEntry(body);
      toast.success(`${TITLES[kind]} saved`);
      onSaved();
    } catch (e) { toast.error(e.message); }
    finally { setBusy(false); }
  };

  return (
    <Dialog open onOpenChange={o => !o && !busy && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{editing ? 'Edit' : 'Add'} {TITLES[kind].toLowerCase()}</DialogTitle>
          <DialogDescription>
            {kind === 'Opening' && 'The balance of this account at the start of the chosen date. Collections, withdrawals and expenses after that date are added on top automatically.'}
            {kind === 'Withdrawal' && 'Money taken out of a bank account (or cash). It is deducted from that account in the Bank Book.'}
            {kind === 'Expense' && 'An expense paid from a bank account or from cash. It is deducted from that account in the Bank Book.'}
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-3 md:grid-cols-2">
          {!editing && initialKind !== 'Opening' && (
            <Field label="Entry type" className="md:col-span-2">
              <select className={selectCls} value={kind} onChange={e => setKind(e.target.value)}>
                <option value="Expense">Expense</option><option value="Withdrawal">Withdrawal</option>
              </select>
            </Field>
          )}
          <Field label={kind === 'Opening' ? 'As on date' : 'Date'}><Input type="date" value={f.date} onChange={e => set({ date: e.target.value })} /></Field>
          <Field label="Amount (₹)"><Input type="number" min="0" value={f.amount} onChange={e => set({ amount: e.target.value })} /></Field>
          {kind === 'Expense' && (
            <Field label="Particulars" className="md:col-span-2">
              <select className={selectCls} value={f.head} onChange={e => set({ head: e.target.value })}>
                <option value="">Select expense head…</option>
                {heads.map(h => <option key={h} value={h}>{h}</option>)}
              </select>
            </Field>
          )}
          <Field label="Cash / Bank">
            <select className={selectCls} value={f.mode} onChange={e => set({ mode: e.target.value })}>
              <option value="Bank">Bank</option><option value="Cash">Cash</option>
            </select>
          </Field>
          {f.mode === 'Bank' && (
            <Field label="Account name">
              <select className={selectCls} value={f.accountId} onChange={e => set({ accountId: e.target.value })}>
                <option value="">Select account…</option>
                {accounts.map(a => <option key={a._id} value={a._id}>{a.label}</option>)}
              </select>
            </Field>
          )}
          <Field label="Note (optional)" className="md:col-span-2"><Input value={f.note} onChange={e => set({ note: e.target.value })} /></Field>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button onClick={save} disabled={busy || f.amount === '' || (kind === 'Expense' && !f.head) || (f.mode === 'Bank' && !f.accountId)}>
            {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
