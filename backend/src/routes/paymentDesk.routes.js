const router = require('express').Router();
const { protect, requireRole } = require('../middleware/auth');
const book  = require('../controllers/accountsBook.controller');
const money = require('../controllers/accountsMoney.controller');

// Payment desk — Admin, Payment and Accountant only
router.use(protect);
const desk = requireRole('Admin', 'Payment', 'Accountant');

router.get('/meta', desk, book.meta);

// Day book + student autofill + write-back edits
router.get  ('/day-book',                         desk, book.dayBook);
router.get  ('/students/search',                  desk, book.searchStudents);
router.get  ('/students/:id/summary',             desk, book.studentSummary);
router.patch('/students/:id',                     desk, book.editStudent);
router.post ('/payments',                         desk, book.addPayment);
router.patch('/payments/fee/:parentId/:txId',     desk, book.editFeePayment);
router.patch('/payments/doc/:parentId/:txId',     desk, book.editDocPayment);

// Ledger + document status
router.get('/ledger',        desk, book.ledger);
router.get('/doc-status',    desk, book.docStatus);

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
