const asyncHandler    = require('express-async-handler');
const PaymentAccount  = require('../models/PaymentAccount');
const Center          = require('../models/Center');

// GET /api/payment-accounts
exports.list = asyncHandler(async (req, res) => {
  // If the requester is a Center with a restricted allow-list, only show those accounts
  if (req.user?.role === 'Center' && req.user.centerId) {
    const center = await Center.findById(req.user.centerId).select('allowedPaymentAccounts').lean();
    const allowed = center?.allowedPaymentAccounts || [];
    if (allowed.length > 0) {
      return res.json(await PaymentAccount.find({ _id: { $in: allowed }, isActive: true }).sort('label'));
    }
    // Empty allow-list = no restriction set yet — center sees all active accounts (backward compatible)
  }
  res.json(await PaymentAccount.find({ isActive: true }).sort('label'));
});

// GET /api/payment-accounts/all  (Admin sees inactive too)
exports.listAll = asyncHandler(async (_req, res) => {
  res.json(await PaymentAccount.find().sort('label'));
});

// POST /api/payment-accounts
exports.create = asyncHandler(async (req, res) => {
  const acc = await PaymentAccount.create({ ...req.body, createdBy: req.user._id });
  res.status(201).json(acc);
});

// PUT /api/payment-accounts/:id
exports.update = asyncHandler(async (req, res) => {
  const acc = await PaymentAccount.findByIdAndUpdate(req.params.id, req.body, { new: true });
  if (!acc) { const e = new Error('Not found'); e.status = 404; throw e; }
  res.json(acc);
});

// DELETE /api/payment-accounts/:id  (soft delete)
exports.remove = asyncHandler(async (req, res) => {
  await PaymentAccount.findByIdAndUpdate(req.params.id, { isActive: false });
  res.status(204).end();
});