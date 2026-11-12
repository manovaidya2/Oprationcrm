import { useEffect, useState } from 'react';
import { Loader2, UserPlus, Users, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { centersApi, counselorsApi } from '@/lib/api';

// Counselors working on one centre. Students stay under the main counselor; any extra counselor
// added here gets the same access to the centre and its students, so they can cover for the main one.
export function CenterCounselorsPanel({ centerId, onChange }) {
  const [rows, setRows] = useState([]);
  const [allCounselors, setAllCounselors] = useState([]);
  const [loading, setLoading] = useState(true);
  const [pick, setPick] = useState('');
  const [busy, setBusy] = useState('');   // 'add' or the id being removed

  useEffect(() => {
    let cancelled = false;
    Promise.all([centersApi.getCounselors(centerId), counselorsApi.getAll()])
      .then(([list, all]) => { if (!cancelled) { setRows(list); setAllCounselors(all); } })
      .catch(e => { if (!cancelled) toast.error(e.message || 'Failed to load counselors'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [centerId]);

  const options = allCounselors.filter(c => c.isActive !== false && !rows.some(r => String(r._id) === String(c._id)));

  async function add() {
    if (!pick) return;
    const name = allCounselors.find(c => c._id === pick)?.name || 'Counselor';
    setBusy('add');
    try {
      setRows(await centersApi.addCounselor(centerId, pick));
      setPick('');
      toast.success(`${name} can now work on this centre`);
      onChange?.();
    } catch (e) { toast.error(e.message); }
    finally { setBusy(''); }
  }

  async function remove(counselor) {
    if (!confirm(`Remove ${counselor.name} from this centre? They will lose access to its students.`)) return;
    setBusy(counselor._id);
    try {
      setRows(await centersApi.removeCounselor(centerId, counselor._id));
      toast.success(`${counselor.name} removed from this centre`);
      onChange?.();
    } catch (e) { toast.error(e.message); }
    finally { setBusy(''); }
  }

  return (
    <div className="space-y-3 rounded-lg border border-indigo-100 bg-indigo-50/40 p-3">
      <div className="flex items-center gap-1.5 text-sm font-semibold text-slate-700">
        <Users className="h-4 w-4 text-indigo-600"/>Counselors on this centre
      </div>

      {loading ? (
        <div className="flex justify-center py-3"><Loader2 className="h-5 w-5 animate-spin text-slate-300"/></div>
      ) : (
        <div className="space-y-1.5">
          {rows.length === 0 && <p className="text-xs text-muted-foreground">No counselor on this centre yet.</p>}
          {rows.map(c => (
            <div key={c._id} className="flex items-center justify-between gap-2 rounded-md border border-slate-200 bg-white px-3 py-2">
              <div className="min-w-0">
                <div className="flex items-center gap-2 text-sm font-medium text-slate-800">
                  <span className="truncate">{c.name}</span>
                  {c.isPrimary && <span className="rounded-full bg-indigo-100 px-2 py-0.5 text-[10px] font-semibold text-indigo-700">Main</span>}
                </div>
                {c.email && <div className="truncate text-xs text-muted-foreground">{c.email}</div>}
              </div>
              {!c.isPrimary && (
                <Button variant="ghost" size="sm" className="text-red-500 hover:bg-red-50 hover:text-red-700"
                  disabled={!!busy} onClick={() => remove(c)} title="Remove from this centre">
                  {busy === c._id ? <Loader2 className="h-3.5 w-3.5 animate-spin"/> : <X className="h-3.5 w-3.5"/>}
                </Button>
              )}
            </div>
          ))}
        </div>
      )}

      <div className="flex gap-2">
        <Select value={pick} onValueChange={setPick} disabled={loading}>
          <SelectTrigger className="bg-white"><SelectValue placeholder="Add another counselor..."/></SelectTrigger>
          <SelectContent>
            {options.length === 0
              ? <div className="px-2 py-3 text-center text-xs text-muted-foreground">No other counselor available</div>
              : options.map(c => <SelectItem key={c._id} value={c._id}>{c.name}</SelectItem>)}
          </SelectContent>
        </Select>
        <Button onClick={add} disabled={!pick || !!busy}>
          {busy === 'add' ? <Loader2 className="mr-1 h-4 w-4 animate-spin"/> : <UserPlus className="mr-1 h-4 w-4"/>}Add
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">
        An added counselor can open this centre and work on all its students, so the work continues when the main counselor is not available.
        Students stay under the main counselor.
      </p>
    </div>
  );
}
