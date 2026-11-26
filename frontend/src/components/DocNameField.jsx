import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { OTHER_NAME, requestOptions } from '@/lib/documentOptions';

// Dropdown of a tab's documents (Marksheet / Other), plus "Other" which asks for the name. The centre's
// requests and the New Inventory use the same lists, so a held document matches a request by name.
// value = { pick, customName }; onChange(patch)
export function DocNameField({ section, value, onChange }) {
  const isMarksheet = section === 'Marksheet';
  const noun = isMarksheet ? 'marksheet' : 'document';
  return (
    <div className="space-y-3">
      <div>
        <Label className="text-xs font-semibold text-slate-600">{isMarksheet ? 'Marksheet' : 'Document'} *</Label>
        <Select value={value.pick} onValueChange={v => onChange({ pick: v })}>
          <SelectTrigger className="mt-1 border-slate-200 h-10"><SelectValue placeholder={`Choose ${noun}`}/></SelectTrigger>
          <SelectContent className="max-h-72">
            {requestOptions(section).map(name => <SelectItem key={name} value={name}>{name}</SelectItem>)}
            <SelectItem value={OTHER_NAME}>Other (type the name)</SelectItem>
          </SelectContent>
        </Select>
      </div>
      {value.pick === OTHER_NAME && (
        <div>
          <Label className="text-xs font-semibold text-slate-600">{isMarksheet ? 'Marksheet' : 'Document'} name *</Label>
          <Input autoFocus maxLength={120} value={value.customName} onChange={e => onChange({ customName: e.target.value })}
            placeholder={isMarksheet ? 'e.g. Semester 3 Marksheet' : 'e.g. Name Correction Letter'} className="mt-1 border-slate-200 h-10"/>
        </div>
      )}
    </div>
  );
}
