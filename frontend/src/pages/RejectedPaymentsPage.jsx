import { useState, useEffect, useCallback } from 'react';
import { Loader2, Trash2, Search, X, AlertTriangle, IndianRupee, Download } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { toast } from 'sonner';
import { paymentsApi } from '@/lib/api';

const fmt   = n => `₹${(Number(n)||0).toLocaleString('en-IN')}`;
const fmtDt = d => d ? new Date(d).toLocaleDateString('en-IN',{day:'2-digit',month:'short',year:'numeric'}) : '—';
const MEDIA = (import.meta.env.VITE_API_URL || 'http://localhost:5000/api').replace('/api', '');

export default function RejectedPaymentsPage() {
  const [records,  setRecords]  = useState([]);
  const [loading,  setLoading]  = useState(true);
  const [search,   setSearch]   = useState('');
  const [delItem,  setDelItem]  = useState(null);
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const data = await paymentsApi.getRejectedPayments();
      setRecords(data);
    } catch(e) { toast.error('Failed to load rejected payments'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const q = search.toLowerCase();
  const filtered = records.filter(r =>
    !q ||
    r.studentName?.toLowerCase().includes(q) ||
    r.centerName?.toLowerCase().includes(q) ||
    r.tx?.utrRef?.toLowerCase().includes(q) ||
    r.enrollmentNumber?.toLowerCase().includes(q)
  );

  async function handleDelete() {
    if (!delItem) return;
    setDeleting(true);
    try {
      await paymentsApi.deleteTransaction(delItem.studentId, delItem.tx._id);
      toast.success('Rejected payment record deleted');
      setDelItem(null);
      load();
    } catch(e) { toast.error(e.message); }
    finally { setDeleting(false); }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold flex items-center gap-2">
          <IndianRupee className="h-5 w-5 text-red-500"/>
          Rejected Payments
          {!loading && <span className="text-sm font-normal text-slate-400">({records.length})</span>}
        </h1>
      </div>

      <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-2.5 text-xs text-amber-700">
        <AlertTriangle className="h-3.5 w-3.5 inline mr-1.5"/>
        These are fee payments rejected by counselor or accountant. Delete them to remove clutter from counselor dashboard.
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground"/>
        <Input className="pl-9 pr-9" placeholder="Search student, center, UTR..."
          value={search} onChange={e => setSearch(e.target.value)}/>
        {search && (
          <button onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
            <X className="h-4 w-4"/>
          </button>
        )}
      </div>

      {loading ? (
        <div className="flex h-48 items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground"/>
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 border border-dashed rounded-xl">
          <IndianRupee className="h-10 w-10 mx-auto text-muted-foreground mb-3 opacity-40"/>
          <p className="text-muted-foreground text-sm">
            {records.length === 0 ? 'No rejected payments' : `No results for "${search}"`}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((r, i) => (
            <Card key={`${r.studentId}-${r.tx._id}-${i}`} className="border-red-200">
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    {/* Student info */}
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <span className="font-semibold text-slate-800">{r.studentName}</span>
                      {r.enrollmentNumber && (
                        <span className="text-xs font-mono text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full">
                          {r.enrollmentNumber}
                        </span>
                      )}
                      <span className="text-xs px-2 py-0.5 rounded-full bg-red-100 text-red-700 border border-red-200 font-medium">
                        ✗ Rejected
                      </span>
                    </div>
                    <div className="text-xs text-slate-400 mb-2 flex flex-wrap gap-2">
                      {r.centerName && <span>{r.centerName}</span>}
                      {r.counselorName && <span>· {r.counselorName}</span>}
                      {r.courseName && <span>· {r.courseName}</span>}
                    </div>

                    {/* Transaction details */}
                    <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 space-y-1.5">
                      <div className="flex items-center gap-3 flex-wrap">
                        <span className="font-bold text-red-700 text-lg">{fmt(r.tx.amount)}</span>
                        {r.tx.mode && (
                          <span className="text-xs bg-slate-100 text-slate-600 px-2 py-0.5 rounded-md font-medium">{r.tx.mode}</span>
                        )}
                        {r.tx.paidAt && (
                          <span className="text-xs text-slate-400">📅 {fmtDt(r.tx.paidAt)}</span>
                        )}
                      </div>
                      {r.tx.upiId && <div className="text-xs text-slate-600">UPI ID: <span className="font-semibold">{r.tx.upiId}</span></div>}
                      {r.tx.utrRef && <div className="text-xs text-slate-600">UTR: <span className="font-mono font-semibold">{r.tx.utrRef}</span></div>}
                      {r.tx.bankName && <div className="text-xs text-slate-600">Bank: <span className="font-semibold">{r.tx.bankName}</span></div>}
                      {r.tx.accountHolder && <div className="text-xs text-slate-600">Account Holder: <span className="font-semibold">{r.tx.accountHolder}</span></div>}
                      {r.tx.accountNumber && <div className="text-xs text-slate-600">Account No: <span className="font-mono font-semibold">{r.tx.accountNumber}</span></div>}
                      {r.tx.note && <div className="text-xs text-slate-400 italic">"{r.tx.note}"</div>}
                      {r.tx.verificationNote && (
                        <div className="text-xs text-red-600 bg-red-100 rounded px-2 py-1 mt-1">
                          Rejection reason: {r.tx.verificationNote}
                        </div>
                      )}
                      {r.tx.paymentScreenshot && (
                        <a href={`${MEDIA}${r.tx.paymentScreenshot}`} target="_blank" rel="noreferrer"
                          className="inline-flex items-center gap-1.5 text-xs text-indigo-600 underline mt-1">
                          <Download className="h-3 w-3"/>View Screenshot
                        </a>
                      )}
                    </div>
                  </div>

                  <Button size="sm" variant="outline"
                    className="border-red-300 text-red-600 hover:bg-red-50 flex-shrink-0"
                    onClick={() => setDelItem(r)}>
                    <Trash2 className="h-3.5 w-3.5 mr-1"/>Delete
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Delete Confirm Dialog */}
      <Dialog open={!!delItem} onOpenChange={v => { if (!v) setDelItem(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-600">
              <Trash2 className="h-4 w-4"/>Delete Rejected Payment
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3">
              <p className="text-sm font-bold text-red-700">{delItem?.studentName}</p>
              {delItem?.centerName && <p className="text-xs text-red-500 mt-0.5">{delItem.centerName}</p>}
            </div>
            <div className="bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 space-y-1.5">
              <p className="text-xs font-bold text-slate-600 uppercase tracking-wide">Payment being deleted:</p>
              <div className="space-y-1 text-xs text-slate-600">
                <div>Amount: <span className="font-bold text-red-600">{fmt(delItem?.tx?.amount)}</span></div>
                {delItem?.tx?.mode && <div>Mode: {delItem.tx.mode}</div>}
                {delItem?.tx?.utrRef && <div>UTR: <span className="font-mono">{delItem.tx.utrRef}</span></div>}
                {delItem?.tx?.paidAt && <div>Date: {fmtDt(delItem.tx.paidAt)}</div>}
              </div>
            </div>
            <p className="text-xs text-red-600 font-semibold">⚠ This will permanently remove this rejected payment record.</p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDelItem(null)}>Cancel</Button>
            <Button onClick={handleDelete} disabled={deleting} className="bg-red-600 hover:bg-red-700">
              {deleting && <Loader2 className="h-4 w-4 mr-1 animate-spin"/>}
              <Trash2 className="h-4 w-4 mr-1"/>Delete Permanently
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}