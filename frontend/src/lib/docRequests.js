// Shared rules for centre document requests, used by the counselor and accountant panels.

const ROLE_NAMES = { Center: 'Centre', Counselor: 'Counselor', ViewerCounselor: 'Viewer Counselor', Admin: 'Admin', Accountant: 'Accountant', PaymentCoordinator: 'Payment Desk', AdmissionMarker: 'Admission Marker' };
export const byLine = actor => (actor?.name ? `${actor.name}${ROLE_NAMES[actor.role] ? ` (${ROLE_NAMES[actor.role]})` : ''}` : '');
export const docPaid = d => (d.payments || []).reduce((s, p) => s + (Number(p.amount) || 0), 0);

// A "Payment_Submitted" document keeps that status after the counselor forwards it; the forward is the
// latest Payment_Submitted history entry, written by counselorForwardPayment ("Counselor reviewed - …").
const COUNSELOR_REVIEWED = /^Counselor reviewed/i;
const lastPaymentEntry = d => [...(d?.statusHistory || [])].reverse().find(h => h.status === 'Payment_Submitted');
export const paymentForwarded = d => COUNSELOR_REVIEWED.test(lastPaymentEntry(d)?.note || '');

// The counselor's approval the accountant is acting on: the payment forward for a payment after the scan,
// else the request forward. { by, at } or null.
export const counselorApproval = d => {
  const h = d?.status === 'Payment_Submitted'
    ? (paymentForwarded(d) ? lastPaymentEntry(d) : null)
    : [...(d?.statusHistory || [])].reverse().find(x => x.status === 'Forwarded');
  return h ? { by: h.changedBy, at: h.at } : null;
};
