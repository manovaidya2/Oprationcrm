import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { deskApi } from '@/lib/api';
import StudentDocsPanel from '@/components/StudentDocsPanel';

// Payment Desk view of a student's documents: degree / other documents and marksheets, each with fee, file and payments.
// It is the same list the counsellor keeps on the student page.
export default function StudentDocsDialog({ studentId, studentName, onClose, onChanged }) {
  return (
    <Dialog open onOpenChange={o => !o && onClose()}>
      <DialogContent className="max-h-[92vh] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Documents and their payments</DialogTitle>
          <DialogDescription>{studentName}. Add a document with its fee and file, then the payment against it. Payments added here are verified straight away.</DialogDescription>
        </DialogHeader>
        <h4 className="text-sm font-semibold">Marksheets</h4>
        <StudentDocsPanel studentId={studentId} category="Marksheet" api={deskApi.addedDocs} canEdit onChange={onChanged} />
        <h4 className="mt-2 text-sm font-semibold">Other documents</h4>
        <StudentDocsPanel studentId={studentId} category="Other" api={deskApi.addedDocs} canEdit onChange={onChanged} />
      </DialogContent>
    </Dialog>
  );
}
