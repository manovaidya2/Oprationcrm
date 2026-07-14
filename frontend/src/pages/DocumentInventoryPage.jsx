import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  CheckCircle2, ChevronDown, ChevronRight, Clock, FileText, Loader2, PackageCheck, Plus, Search, Send, X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';
import { documentInventoryApi } from '@/lib/api';
import { useAuth } from '@/context/AuthContext';

const RECEIVED_STATUSES = new Set([
  'Dispatch_Received', 'Scanned', 'Accountant_Received', 'Counselor_Received',
  'Center_Notified', 'Payment_Submitted', 'Payment_Verified', 'Dispatched', 'Delivered',
]);

function docState(doc) {
  if (RECEIVED_STATUSES.has(doc.status)) return { label: 'Received from University', tone: 'bg-emerald-50 text-emerald-700 border-emerald-200', icon: CheckCircle2 };
  if (['Sent_To_University', 'University_Dispatched'].includes(doc.status)) return { label: 'Requested', tone: 'bg-amber-50 text-amber-700 border-amber-200', icon: Clock };
  if (doc.catalog) return { label: 'Not Requested', tone: 'bg-slate-50 text-slate-600 border-slate-200', icon: FileText };
  return { label: doc.status?.replace(/_/g, ' ') || 'Pending', tone: 'bg-slate-50 text-slate-600 border-slate-200', icon: FileText };
}

export default function DocumentInventoryPage() {
  const { user } = useAuth();
  const canReceive = ['Admin', 'Dispatch'].includes(user?.role);
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [addTarget, setAddTarget] = useState(null);
  const [names, setNames] = useState('');
  const [received, setReceived] = useState(false);
  const [saving, setSaving] = useState(false);
  const [openStudentId, setOpenStudentId] = useState('');

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setRows(await documentInventoryApi.list());
    } catch (e) {
      toast.error(e.message || 'Failed to load inventory');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const q = search.toLowerCase().trim();
  const filtered = useMemo(() => rows.filter(({ student, docs, requestedDocs = [] }) => {
    if (!q) return true;
    return [
      student?.name,
      student?.enrollmentNumber,
      student?.courseName,
      student?.center?.name,
      student?.university?.name,
      ...docs.map(d => d.name),
      ...requestedDocs.map(d => d.name),
    ].some(v => String(v || '').toLowerCase().includes(q));
  }), [rows, q]);

  async function addDocs() {
    const list = names.split('\n').map(v => v.trim()).filter(Boolean);
    if (list.length === 0) return toast.error('Document name required');
    setSaving(true);
    try {
      await documentInventoryApi.addDocs(addTarget.student._id, { names: list, received: canReceive && received });
      toast.success('Inventory updated');
      setAddTarget(null); setNames(''); setReceived(false); load();
    } catch (e) {
      toast.error(e.message);
    } finally {
      setSaving(false);
    }
  }

  async function markReceived(doc, studentId) {
    setSaving(true);
    try {
      if (doc.catalog) {
        await documentInventoryApi.addDocs(studentId, { names: [doc.name], received: true });
      } else {
        await documentInventoryApi.markReceived(doc._id);
      }
      toast.success('Marked received');
      load();
    } catch (e) {
      toast.error(e.message);
    } finally {
      setSaving(false);
    }
  }

  async function requestDoc(doc, studentId) {
    setSaving(true);
    try {
      if (doc.catalog) {
        await documentInventoryApi.addDocs(studentId, { names: [doc.name], received: false });
      } else {
        await documentInventoryApi.requestDoc(doc._id);
      }
      toast.success('Request sent to dispatch');
      load();
    } catch (e) {
      toast.error(e.message);
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <div className="flex h-64 items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground"/></div>;
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold flex items-center gap-2">
            <PackageCheck className="h-5 w-5"/>Document Inventory ({filtered.length}/{rows.length})
          </h1>
          <p className="text-sm text-muted-foreground">Enrolled students and university document receipt tracking</p>
        </div>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground"/>
        <Input value={search} onChange={e => setSearch(e.target.value)} className="pl-9 pr-9" placeholder="Search student, enrollment, center, course, document..."/>
        {search && <button onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"><X className="h-4 w-4"/></button>}
      </div>

      {filtered.length === 0 ? (
        <div className="text-center py-14 border border-dashed rounded-lg text-muted-foreground">No inventory records found</div>
      ) : filtered.map(row => {
        const { student, docs, requestedDocs = [] } = row;
        const receivedCount = docs.filter(d => RECEIVED_STATUSES.has(d.status)).length;
        const requestedCount = requestedDocs.length;
        const isOpen = openStudentId === student._id;
        return (
          <Card key={student._id}>
            <CardContent className="p-4 space-y-3">
              <div className="flex flex-wrap items-start justify-between gap-3 cursor-pointer" onClick={() => setOpenStudentId(isOpen ? '' : student._id)}>
                <div className="flex min-w-0 flex-1 gap-2">
                  <div className="mt-0.5 text-muted-foreground">
                    {isOpen ? <ChevronDown className="h-4 w-4"/> : <ChevronRight className="h-4 w-4"/>}
                  </div>
                  <div className="min-w-0">
                  <div className="font-semibold text-base truncate">{student.name}</div>
                  <div className="text-sm text-muted-foreground">
                    {student.center?.name || 'No center'} · {student.courseName || 'No course'}
                  </div>
                  <div className="flex flex-wrap gap-2 mt-1">
                    {student.enrollmentNumber && <span className="text-xs font-mono bg-emerald-50 text-emerald-700 border border-emerald-200 rounded px-2 py-0.5">{student.enrollmentNumber}</span>}
                    {student.university?.name && <span className="text-xs bg-purple-50 text-purple-700 border border-purple-200 rounded px-2 py-0.5">{student.university.name}</span>}
                    <span className="text-xs bg-slate-50 text-slate-600 border rounded px-2 py-0.5">{receivedCount}/{docs.length} received</span>
                    {requestedCount > 0 && <span className="text-xs bg-blue-50 text-blue-700 border border-blue-200 rounded px-2 py-0.5">{requestedCount} requested</span>}
                  </div>
                </div>
                </div>
                <div className="flex gap-2" onClick={e => e.stopPropagation()}>
                  <Button size="sm" variant="outline" onClick={() => setOpenStudentId(isOpen ? '' : student._id)}>
                    {isOpen ? 'Hide Docs' : 'View Docs'}
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => setAddTarget(row)} className="gap-1">
                    <Plus className="h-3.5 w-3.5"/>Add Docs
                  </Button>
                </div>
              </div>

              {isOpen && (
                <>
              {docs.length === 0 ? (
                <div className="rounded-lg border border-dashed px-3 py-4 text-sm text-muted-foreground">No document names added yet</div>
              ) : (
                <div className="grid gap-2">
                  {docs.map(doc => {
                    const state = docState(doc);
                    const Icon = state.icon;
                    const isReceived = RECEIVED_STATUSES.has(doc.status);
                    return (
                      <div key={doc._id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border px-3 py-2">
                        <div className="min-w-0">
                          <div className="font-medium truncate">{doc.name}</div>
                          <span className={`inline-flex items-center gap-1 text-xs border rounded-full px-2 py-0.5 mt-1 ${state.tone}`}>
                            <Icon className="h-3 w-3"/>{state.label}
                          </span>
                        </div>
                        <div className="flex gap-2">
                          {!isReceived && canReceive && (
                            <Button size="sm" onClick={() => markReceived(doc, student._id)} disabled={saving}>Tick Received</Button>
                          )}
                          {!isReceived && (
                            <Button size="sm" variant="outline" onClick={() => requestDoc(doc, student._id)} disabled={saving} className="gap-1">
                              <Send className="h-3.5 w-3.5"/>Request
                            </Button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {requestedDocs.length > 0 && (
                <div className="border-t pt-3 space-y-2">
                  <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Requested Documents ({requestedDocs.length})</div>
                  {requestedDocs.map(doc => {
                    const state = docState(doc);
                    const Icon = state.icon;
                    const isReceived = RECEIVED_STATUSES.has(doc.status);
                    return (
                      <div key={doc._id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-blue-100 bg-blue-50/40 px-3 py-2">
                        <div className="min-w-0">
                          <div className="font-medium truncate">{doc.name}</div>
                          <span className={`inline-flex items-center gap-1 text-xs border rounded-full px-2 py-0.5 mt-1 ${state.tone}`}>
                            <Icon className="h-3 w-3"/>{state.label}
                          </span>
                        </div>
                        {!isReceived && canReceive && (
                          <Button size="sm" onClick={() => markReceived(doc, student._id)} disabled={saving}>Tick Received</Button>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
                </>
              )}
            </CardContent>
          </Card>
        );
      })}

      <Dialog open={!!addTarget} onOpenChange={() => { setAddTarget(null); setNames(''); setReceived(false); }}>
        <DialogContent>
          <DialogHeader><DialogTitle>Add Document Names</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="rounded-lg bg-muted/40 px-3 py-2 text-sm">
              <b>{addTarget?.student?.name}</b>
              {addTarget?.student?.enrollmentNumber && <span className="font-mono text-emerald-700 ml-2">{addTarget.student.enrollmentNumber}</span>}
            </div>
            <div>
              <Label>Document names</Label>
              <Textarea rows={5} value={names} onChange={e => setNames(e.target.value)} placeholder={'Migration Certificate\nOriginal Marksheet\nProvisional Certificate'}/>
              <p className="text-xs text-muted-foreground mt-1">One document name per line.</p>
            </div>
            {canReceive && (
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={received} onChange={e => setReceived(e.target.checked)}/>
                Mark these as received from university
              </label>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setAddTarget(null); setNames(''); setReceived(false); }}>Cancel</Button>
            <Button onClick={addDocs} disabled={saving}>{saving && <Loader2 className="h-4 w-4 mr-1 animate-spin"/>}Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
