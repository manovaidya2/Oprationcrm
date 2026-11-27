const asyncHandler = require('express-async-handler');
const StudentDoc = require('../models/StudentDocument');
const InventoryDocument = require('../models/InventoryDocument');
const PaymentQuery = require('../models/PaymentQuery');
const { scopeFilter } = require('./paymentQuery.controller');

// GET /nav-counts — what is open on each work page of this login, for the badges in the sidebar
// ({ '/payment-queries': 3, ... }; a page this login does not have is left out)
const FROM_UNIVERSITY = ['With_Inventory', 'Sent_To_University', 'University_Dispatched', 'Dispatch_Received'];

exports.counts = asyncHandler(async (req, res) => {
  const role = req.user.role;
  const jobs = {};
  if (['Admin', 'Counselor', 'ViewerCounselor'].includes(role)) {
    jobs['/payment-queries'] = (async () => PaymentQuery.countDocuments({ ...(await scopeFilter(req.user)), status: 'Open' }))();
  }
  if (['Admin', 'Inventory'].includes(role)) {
    // counselors' direct marksheet requests not yet in the New Inventory
    jobs['/marksheet-requests'] = StudentDoc.countDocuments({ origin: 'Counselor', status: { $in: FROM_UNIVERSITY } });
    // the Inventory Desk: to request, waiting for the courier, correction check, upload scan (+ marksheets added
    // straight to the New Inventory, to check)
    jobs['/inventory-desk'] = Promise.all([
      StudentDoc.countDocuments({
        status: { $in: FROM_UNIVERSITY },
        $or: [{ origin: { $nin: ['Inventory', 'Added', 'Counselor'] } }, { origin: 'Inventory', status: { $in: ['Sent_To_University', 'University_Dispatched'] } }],
      }),
      InventoryDocument.countDocuments({ correctionCheckPending: true }),
    ]).then(([a, b]) => a + b);
  }
  if (['Admin', 'Dispatch'].includes(role)) {
    // ready to courier, and couriered but not confirmed by the centre yet
    jobs['/dispatch'] = StudentDoc.countDocuments({ origin: { $nin: ['Inventory', 'Added', 'Counselor'] }, status: { $in: ['Payment_Verified', 'Dispatched'] } });
  }
  const keys = Object.keys(jobs);
  const values = await Promise.all(keys.map(k => jobs[k]));
  res.json(Object.fromEntries(keys.map((k, i) => [k, values[i]])));
});
