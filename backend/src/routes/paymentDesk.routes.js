const router = require('express').Router();
const { protect, requireRole } = require('../middleware/auth');
const book  = require('../controllers/accountsBook.controller');
const money = require('../controllers/accountsMoney.controller');
const settle = require('../controllers/accountsSettlement.controller');
const addedDocs = require('../controllers/addedDocs.controller');
const upload = require('../middleware/upload');   // optional payment screenshot (image / PDF, max 10 MB)

// Payment desk — Admin, Payment and Accountant only
router.use(protect);
const desk = requireRole('Admin', 'Payment', 'Accountant');

router.get('/meta', desk, book.meta);

// Day book + student autofill + write-back edits
router.get  ('/day-book',                         desk, book.dayBook);
router.post ('/students',                        desk, upload.single('paymentScreenshot'), book.addStudent);
router.get  ('/students/search',                  desk, book.searchStudents);
router.get  ('/students/:id/summary',             desk, book.studentSummary);
router.patch('/students/:id',                     desk, book.editStudent);
router.post ('/payments',                         desk, upload.single('paymentScreenshot'), book.addPayment);
router.post ('/payments/review',                  desk, book.reviewPayments);

// Payment adjustment = settlement (one UTR / screenshot spread over many students)
router.get  ('/settlement/students',              desk, settle.students);
router.post ('/settlements',                      desk, upload.single('paymentScreenshot'), settle.create);
router.get  ('/settlements/:id',                  desk, settle.get);
router.patch('/settlements/:id',                  desk, upload.single('paymentScreenshot'), settle.update);
router.post ('/settlements/:id/reverse',          desk, settle.reverse);
router.patch('/payments/fee/:parentId/:txId',     desk, upload.single('paymentScreenshot'), book.editFeePayment);
router.patch('/payments/doc/:parentId/:txId',     desk, upload.single('paymentScreenshot'), book.editDocPayment);

// Ledger + document status
router.get('/ledger',        desk, book.ledger);
router.get('/doc-status',    desk, book.docStatus);
router.get('/added-docs',    desk, addedDocs.deskList);
router.get('/students/:id/added-docs',                  desk, addedDocs.list);
router.post('/students/:id/added-docs',                 desk, addedDocs.add);
router.post('/students/:id/added-docs/:docId/file',       desk, upload.single('file'), addedDocs.uploadFile);
router.patch('/students/:id/added-docs/:docId/visibility', desk, addedDocs.setVisibility);
router.patch('/students/:id/added-docs/:docId',         desk, addedDocs.update);
router.delete('/students/:id/added-docs/:docId',        desk, addedDocs.remove);
router.delete('/students/:id/added-docs/:docId/payments/:payId', requireRole('Admin'), addedDocs.removePayment);
router.post('/students/:id/added-docs/:docId/payments', desk, upload.single('paymentScreenshot'), addedDocs.addPayment);

// Bank / cash book, income & expenses
router.get   ('/bank-book',     desk, money.bankBook);
router.get   ('/entries',       desk, money.listEntries);
router.post  ('/entries',       desk, money.createEntry);
router.patch ('/entries/:id',   desk, money.updateEntry);
router.delete('/entries/:id',   desk, money.deleteEntry);

// University bill
router.post  ('/university-bills/fetch', desk, money.billFetch);
router.get   ('/university-bills',       desk, money.listBills);
router.post  ('/university-bills',       desk, money.createBill);
router.get   ('/university-bills/:id',   desk, money.getBill);
router.put   ('/university-bills/:id',   desk, money.updateBill);
router.delete('/university-bills/:id',   desk, money.deleteBill);

// CSV downloads (same filters as the screens)
router.get('/export/day-book.csv',              desk, book.exportDayBook);
router.get('/export/ledger.csv',                desk, book.exportLedger);
router.get('/export/doc-status.csv',            desk, book.exportDocStatus);
router.get('/export/bank-book.csv',             desk, money.exportBankBook);
router.get('/export/entries.csv',               desk, money.exportEntries);
router.get('/export/university-bills/:id.csv',  desk, money.exportBill);

module.exports = router;
