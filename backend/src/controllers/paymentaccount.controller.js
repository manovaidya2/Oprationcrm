const asyncHandler    = require('express-async-handler');
const PaymentAccount  = require('../models/PaymentAccount');

// GET /api/payment-accounts
exports.list = asyncHandler(async (_req, res) => {
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