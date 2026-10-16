import { useState } from 'react';
import { BookOpen, Building2, FileText, Landmark, Receipt, University, Wallet } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import DayBookTab from './paymentdesk/DayBookTab';
import LedgerTab from './paymentdesk/LedgerTab';
import BankBookTab from './paymentdesk/BankBookTab';
import ExpensesTab from './paymentdesk/ExpensesTab';
import DocStatusTab from './paymentdesk/DocStatusTab';
import UniversityBillTab from './paymentdesk/UniversityBillTab';
import AdvanceTab from './paymentdesk/AdvanceTab';

const TABS = [
  { value: 'daybook', label: 'Day Book', icon: BookOpen, Comp: DayBookTab },
  { value: 'ledger', label: 'Ledger', icon: Building2, Comp: LedgerTab },
  { value: 'advance', label: 'Centre Advance', icon: Wallet, Comp: AdvanceTab },
  { value: 'bank', label: 'Bank / Cash Book', icon: Landmark, Comp: BankBookTab },
  { value: 'expenses', label: 'Income & Expenses', icon: Receipt, Comp: ExpensesTab },
  { value: 'docs', label: 'Document Status', icon: FileText, Comp: DocStatusTab },
  { value: 'bill', label: 'University Bill', icon: University, Comp: UniversityBillTab },
];

export default function PaymentDeskPage() {
  const [tab, setTab] = useState('daybook');

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight text-slate-900">
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-sky-100 text-sky-700"><Landmark className="h-5 w-5" /></span>
            Payment Desk
          </h1>
          <p className="mt-1 max-w-3xl text-sm text-slate-500">
            Day book, ledger, bank book, expenses, document status and university bills. Everything is read live from the CRM, and edits are saved to the real student and payment records.
          </p>
        </div>
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="h-auto flex-wrap justify-start gap-1 rounded-xl border border-slate-200 bg-slate-100 p-1.5">
          {TABS.map(t => (
            <TabsTrigger key={t.value} value={t.value} className="gap-2 rounded-lg px-4 py-2 text-sm data-[state=active]:bg-white data-[state=active]:shadow-sm">
              <t.icon className="h-4 w-4" />{t.label}
            </TabsTrigger>
          ))}
        </TabsList>
        {TABS.map(t => (
          <TabsContent key={t.value} value={t.value} className="mt-5">{tab === t.value && <t.Comp />}</TabsContent>
        ))}
      </Tabs>
    </div>
  );
}
