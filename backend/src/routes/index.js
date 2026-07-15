// ============================================================
// routes/index.js  — All routes wired together
// ============================================================
const router  = require('express').Router();
const { z }   = require('zod');
const val     = require('../middleware/validate');
const { protect, requireRole } = require('../middleware/auth');
const upload  = require('../middleware/upload');

const authC   = require('../controllers/auth.controller');
const studentC= require('../controllers/student.controller');
const payC    = require('../controllers/payment.controller');
const docC    = require('../controllers/document.controller');
const misc    = require('../controllers/misc.controller');
const uniC    = require('../controllers/university.controller');
const payAccC = require('../controllers/paymentaccount.controller');
const chatC   = require('../controllers/chat.controller');

// ── Validation schemas ───────────────────────────────────────
const loginSchema     = z.object({ email: z.string().email(), password: z.string().min(1) });
const userCreateSchema= z.object({
  name: z.string().min(1), email: z.string().email(), password: z.string().min(6),
  role: z.enum(['Admin','Counselor','Center','Accountant','University','Dispatch','PaymentCoordinator']),
  centerId:     z.string().optional(),
  universityId: z.string().optional(),
  avatarColor:  z.string().optional(),
  phone:        z.string().optional(),
});
const pwdSchema           = z.object({ password: z.string().min(6) });
const changePwdSchema     = z.object({ currentPassword: z.string().min(1), newPassword: z.string().min(6) });
const avatarSchema        = z.object({ avatarSeed: z.string().min(2).max(40) });

// ── AUTH ─────────────────────────────────────────────────────
router.post('/auth/login',               val(loginSchema), authC.login);
router.get ('/auth/me',                  protect, authC.me);
router.get ('/auth/users',               protect, requireRole('Admin','Counselor'), authC.listUsers);
router.post('/auth/users',               protect, requireRole('Admin','Counselor'), val(userCreateSchema), authC.createUser);
router.patch('/auth/users/:id/password', protect, requireRole('Admin','Counselor'), val(pwdSchema), authC.resetPassword);
router.patch('/auth/me/password',        protect, val(changePwdSchema), authC.changeOwnPassword);
router.patch('/auth/me/avatar',          protect, val(avatarSchema), authC.updateAvatar);
router.patch('/auth/users/:id/toggle',   protect, requireRole('Admin'), authC.toggleUser);
router.delete('/auth/users/:id',         protect, requireRole('Admin'), authC.deleteUser);
// CHAT + HELP TICKETS
router.get   ('/chat/users',                         protect, chatC.users);
router.get   ('/chat/conversations',                 protect, chatC.list);
router.post  ('/chat/conversations',                 protect, chatC.createInternal);
router.delete('/chat/conversations/:id',             protect, chatC.removeInternal);
router.post  ('/chat/tickets',                       protect, requireRole('Center'), chatC.createTicket);
router.get   ('/chat/conversations/:id/messages',    protect, chatC.messages);
router.post  ('/chat/conversations/:id/messages',    protect, chatC.sendMessage);
router.patch ('/chat/tickets/:id/status',            protect, chatC.updateTicketStatus);

// ── UNIVERSITIES ──────────────────────────────────────────────
router.get   ('/universities',          protect, uniC.list);
router.get   ('/universities/:id',      protect, uniC.get);
router.get   ('/universities/:id/stats',protect, uniC.stats);
router.post  ('/universities',          protect, requireRole('Admin'), uniC.create);
router.put   ('/universities/:id',      protect, requireRole('Admin'), uniC.update);
router.delete('/universities/:id',      protect, requireRole('Admin'), uniC.remove);

// ── CENTERS ──────────────────────────────────────────────────
router.get   ('/centers',          protect, misc.listCenters);
router.get   ('/centers/:id',      protect, misc.getCenter);
router.post  ('/centers',          protect, requireRole('Admin','Counselor'), upload.array('verificationDocs', 10), misc.createCenter);
router.put   ('/centers/:id',      protect, requireRole('Admin','Counselor'), misc.updateCenter);
router.delete('/centers/:id',      protect, requireRole('Admin'), misc.deleteCenter);
router.get   ('/centers/:id/students',     protect, misc.getCenterStudents);
router.post  ('/centers/:id/docs',         protect, requireRole('Admin','Counselor'), upload.single('file'), misc.uploadCenterDoc);
router.delete('/centers/:id/docs/:docId',  protect, requireRole('Admin','Counselor'), misc.deleteCenterDoc);
// Allowed universities per center
router.get   ('/centers/:id/universities', protect, misc.getCenterUniversities);
router.put   ('/centers/:id/universities', protect, requireRole('Admin','Counselor'), misc.setCenterUniversities);

// ── COUNSELORS ───────────────────────────────────────────────
router.get   ('/counselors',             protect, misc.listCounselors);
router.get   ('/counselors/:id',         protect, misc.getCounselor);
router.post  ('/counselors',             protect, requireRole('Admin'), misc.createCounselor);
router.put   ('/counselors/:id',         protect, requireRole('Admin'), misc.updateCounselor);
router.delete('/counselors/:id',         protect, requireRole('Admin'), misc.deleteCounselor);
router.post  ('/counselors/:id/centers', protect, requireRole('Admin','Counselor'), misc.addCenterToCounselor);

// ── STUDENTS ─────────────────────────────────────────────────
router.get   ('/students',     protect, studentC.list);
router.get   ('/students/:id', protect, studentC.get);
router.post  ('/students',     protect, requireRole('Admin','Counselor','Center'), upload.array('submissionFiles', 10), studentC.create);
router.put   ('/students/:id', protect, requireRole('Admin','Counselor','Center'), upload.any(), studentC.update);
router.delete('/students/:id', protect, requireRole('Admin'), studentC.remove);

// Application flow
router.post('/students/:id/submit',            protect, requireRole('Admin','Center','Counselor'), upload.array('submissionFiles', 10), studentC.submit);
router.post('/students/:id/approve',           protect, requireRole('Admin','Counselor'), studentC.counselorApprove);
router.post('/students/:id/reject',            protect, requireRole('Admin','Counselor','Accountant'), studentC.reject);
router.post('/students/:id/request-changes',   protect, requireRole('Admin','Counselor'), studentC.requestChanges);
router.post('/students/:id/accountant-action', protect, requireRole('Admin','Accountant'), studentC.accountantAction);
router.post('/students/:id/enrollment',        protect, requireRole('Admin','University'), studentC.assignEnrollment);
router.post('/students/:id/enrollment-check',  protect, requireRole('Admin','Center'), studentC.checkEnrollmentNumber);
router.post('/students/:id/university-reject', protect, requireRole('Admin','University'), studentC.universityReject);
router.post('/students/:id/accountant-forward-to-counselor', protect, requireRole('Admin','Accountant'), studentC.accountantForwardToCounselor);
router.post('/students/:id/cancel',                          protect, requireRole('Admin'),               studentC.cancelApplication);
router.post('/students/:id/transfer-center',                 protect, requireRole('Admin'),               studentC.transferCenter);
router.post('/students/:id/amount-settle',                   protect, requireRole('Admin','Accountant'),  studentC.amountSettle);
router.post('/students/:id/request-settlement',             protect, requireRole('Admin','Center'),            studentC.requestSettlement);
router.post('/students/:id/forward-settlement',             protect, requireRole('Admin','Counselor'),         studentC.forwardSettlement);
router.post('/students/:id/counselor-reforward',    protect, requireRole('Admin','Counselor'), studentC.counselorReforward);
router.post('/students/:id/counselor-send-to-center', protect, requireRole('Admin','Counselor'), studentC.counselorSendToCenter);

// ── PAYMENTS ─────────────────────────────────────────────────
router.get   ('/payment-installments',                          protect, requireRole('Admin','PaymentCoordinator'), payC.installmentTimeline);
router.post  ('/payment-installments/:paymentId/installments/:installmentId/pay', protect, requireRole('Admin','PaymentCoordinator'), upload.single('paymentScreenshot'), payC.markInstallmentPaid);
router.get   ('/payments/:studentId',                          protect, payC.get);
router.put   ('/payments/:studentId',                          protect, requireRole('Admin','Counselor','Center'), payC.upsertFee);
router.post  ('/payments/:studentId/transactions',             protect, requireRole('Admin','Counselor','Center','Accountant'), upload.single('paymentScreenshot'), payC.addTransaction);
router.patch ('/payments/:studentId/transactions/:txId',       protect, requireRole('Admin','Counselor','Center','Accountant'), upload.single('paymentScreenshot'), payC.updateTransaction);
router.patch ('/payments/:studentId/transactions/:txId/counsel-verify',  protect, requireRole('Admin','Counselor'), payC.counselorForwardFeePayment);
router.patch ('/payments/:studentId/transactions/:txId/counsel-reject',  protect, requireRole('Admin','Counselor'), payC.counselorRejectFeePayment);
router.patch ('/payments/:studentId/transactions/:txId/resend',          protect, requireRole('Admin','Center'),    upload.single('paymentScreenshot'), payC.resendTransaction);
router.patch ('/payments/:studentId/transactions/:txId/account-verify',  protect, requireRole('Admin','Accountant'), payC.accountantVerifyFeePayment);
router.delete('/payments/:studentId/transactions/:txId',                 protect, requireRole('Admin','Counselor','Center'), payC.deleteTransaction);
router.get   ('/payments-rejected',                                      protect, requireRole('Admin'), payC.getRejectedPayments);
router.get   ('/document-inventory',                    protect, requireRole('Admin','Accountant','Counselor','Dispatch','PaymentCoordinator'), docC.inventoryList);
router.post  ('/document-inventory/:studentId/docs',    protect, requireRole('Admin','Accountant','Counselor','Dispatch'), docC.inventoryAddDoc);
router.patch ('/document-inventory/docs/:id/receive',   protect, requireRole('Admin','Dispatch'), docC.inventoryReceiveDoc);
router.patch ('/document-inventory/docs/:id/request',   protect, requireRole('Admin','Accountant','Counselor','Dispatch'), docC.inventoryRequestDoc);
router.patch ('/document-inventory/docs/:id/urgent',    protect, requireRole('Admin','Accountant','Counselor','Dispatch'), docC.inventoryUrgentRequestDoc);
// ── DOCUMENTS ────────────────────────────────────────────────
router.get   ('/documents',                       protect, docC.list);
router.get   ('/documents/:id',                   protect, docC.get);
router.post  ('/documents',                       protect, requireRole('Admin','Center','Counselor'), upload.single('file'), docC.create);
router.patch ('/documents/:id',                   protect, requireRole('Admin','Counselor'), upload.single('file'), docC.update);
router.delete('/documents/:id',                   protect, requireRole('Admin','Counselor'), docC.remove);

// Document flow
router.patch('/documents/:id/forward',            protect, requireRole('Admin','Counselor'), docC.forward);
router.patch('/documents/:id/accountant-action',  protect, requireRole('Admin','Accountant'), docC.accountantAction);
router.patch('/documents/:id/dispatch-receive',     protect, requireRole('Admin','Dispatch'), docC.dispatchReceive);
router.patch('/documents/:id/upload-scan',          protect, requireRole('Admin','Dispatch'), upload.single('file'), docC.uploadScan);
router.patch('/documents/:id/accountant-forward-scan', protect, requireRole('Admin','Accountant'), docC.accountantForwardScan);
router.patch('/documents/:id/forward-to-center',    protect, requireRole('Admin','Counselor'), docC.counselorForwardToCenter);
router.patch('/documents/:id/request-dispatch',      protect, requireRole('Admin','Center'), docC.requestDispatch);
router.patch('/documents/:id/forward-payment',       protect, requireRole('Admin','Counselor'), docC.counselorForwardPayment);
router.patch('/documents/:id/university-dispatch',  protect, requireRole('Admin','University'), docC.universityDispatch);
router.post ('/documents/:id/payments',             protect, requireRole('Admin','Center','Counselor'), upload.single('paymentScreenshot'), docC.addPayment);
router.patch('/documents/:id/payments/:payId',      protect, requireRole('Admin','Center','Counselor'), docC.updatePayment);
router.patch('/documents/:id/verify-payment',       protect, requireRole('Admin','Accountant'), docC.verifyPayment);
router.patch('/documents/:id/dispatch-to-center',   protect, requireRole('Admin','Dispatch'), docC.dispatchToCenter);
router.patch('/documents/:id/confirm-delivery', protect, requireRole('Admin','Center'), docC.centerConfirmDelivery);

// ── NOTIFICATIONS ─────────────────────────────────────────────
router.get  ('/notifications',          protect, misc.listNotifications);
router.patch('/notifications/read-all', protect, misc.markRead);
router.patch('/notifications/:id/read', protect, misc.markOneRead);

// ── PAYMENT ACCOUNTS ──────────────────────────────────────────
router.get   ('/payment-accounts',          protect, payAccC.list);
router.get   ('/payment-accounts/all',      protect, requireRole('Admin'), payAccC.listAll);
router.post  ('/payment-accounts',          protect, requireRole('Admin'), payAccC.create);
router.put   ('/payment-accounts/:id',      protect, requireRole('Admin'), payAccC.update);
router.delete('/payment-accounts/:id',      protect, requireRole('Admin'), payAccC.remove);

// ── DASHBOARD ─────────────────────────────────────────────────
router.get('/dashboard/stats', protect, misc.dashboardStats);

// ── AUDIT LOG ─────────────────────────────────────────────────
router.get('/audit', protect, requireRole('Admin'), misc.listAudit);

module.exports = router;
