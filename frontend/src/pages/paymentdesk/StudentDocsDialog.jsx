import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { deskApi } from '@/lib/api';
import StudentDocsPanel from '@/components/StudentDocsPanel';

// Payment Desk view of a student's documents (degree, marksheets, other) with fee and payments: the same list the counsellor keeps.
export default function StudentDocsDialog({ studentId, studentName, onClose, onChanged }) {
  return (
    <Dialog open onOpenChange={o => !o && onClose()}>
      <DialogContent className="max-h-[92vh] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Documents and their payments</DialogTitle>
          <DialogDescription>{studentName}. Add a document with its fee, then the payment against it. Payments added here are verified straight away.</DialogDescription>
        </DialogHeader>
        <StudentDocsPanel studentId={studentId} api={deskApi.addedDocs} canEdit onChange={onChanged} />
      </DialogContent>
    </Dialog>
  );
}
