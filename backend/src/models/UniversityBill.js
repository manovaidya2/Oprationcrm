const mongoose = require('mongoose');

// A bill for one university. Students/documents are fetched automatically, but the
// fee the university charges (and discount / adjustments) are typed in manually per row.
const billRowSchema = new mongoose.Schema({
  kind:     { type: String, enum: ['Student', 'Document'], required: true },
  student:  { type: mongoose.Schema.Types.ObjectId, ref: 'Student' },
  document: { type: mongoose.Schema.Types.ObjectId, ref: 'StudentDocument' },
  date:     { type: Date },
  enrollment: { type: String, trim: true },
  name:     { type: String, trim: true },
  course:   { type: String, trim: true },
  docType:  { type: String, trim: true },
  totalFee: { type: Number, default: 0 },          // fee as charged by the university
  discount: { type: Number, default: 0 },
  oldAdjust: { type: Number, default: 0 },
  prevOutstanding: { type: Number, default: 0 },
});

const universityBillSchema = new mongoose.Schema({
  university: { type: mongoose.Schema.Types.ObjectId, ref: 'University', required: true, index: true },
  title:  { type: String, required: true, trim: true },
  from:   { type: Date },
  to:     { type: Date },
  note:   { type: String, trim: true },
  status: { type: String, enum: ['Draft', 'Final'], default: 'Draft' },
  rows:   [billRowSchema],
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
}, { timestamps: true });

module.exports = mongoose.model('UniversityBill', universityBillSchema);
