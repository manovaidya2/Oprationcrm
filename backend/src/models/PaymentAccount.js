const mongoose = require('mongoose');

const paymentAccountSchema = new mongoose.Schema({
  label:         { type: String, required: true, trim: true },  // Display name e.g. "Main SBI Account"
  mode:          { type: String, enum: ['UPI', 'Bank Transfer'], required: true },
  // UPI fields
  upiId:         { type: String, trim: true },
  upiName:       { type: String, trim: true },
  // Bank fields
  bankName:      { type: String, trim: true },
  accountHolder: { type: String, trim: true },
  accountNumber: { type: String, trim: true },
  ifscCode:      { type: String, trim: true },
  branch:        { type: String, trim: true },
  isActive:      { type: Boolean, default: true },
  createdBy:     { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
}, { timestamps: true });

module.exports = mongoose.model('PaymentAccount', paymentAccountSchema);