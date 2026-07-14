const mongoose = require('mongoose');

const studentSchema = new mongoose.Schema({
  // Core info — locked after enrollment number assigned
  name:         { type: String, required: true, trim: true },
  fatherName:   { type: String, trim: true, uppercase: true },
  motherName:   { type: String, trim: true, uppercase: true },
  dob:          { type: Date },
  gender:       { type: String, enum: ['Male', 'Female', 'Other', ''], trim: true },
  phone:        { type: String, trim: true },
  email:        { type: String, trim: true, lowercase: true },
  address:      { type: String, trim: true, uppercase: true },
  aadharNumber: { type: String, trim: true, uppercase: true },

  // Enrollment
  enrollmentNumber: { type: String, trim: true },
  enrollmentNumberChecked: { type: Boolean, default: false },
  enrollmentNumberCheckedAt: { type: Date },
  enrollmentNumberCheckedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  coreLocked:       { type: Boolean, default: false }, // locked after enrollment

  // Academic
  courseName:   { type: String, trim: true, uppercase: true },
  courseYear:   { type: String, trim: true, uppercase: true },
  universityName: { type: String, trim: true },  // denormalized display name
  // 10th details
  tenth_percent:{ type: String, trim: true, uppercase: true },
  tenth_year:   { type: String, trim: true, uppercase: true },
  tenth_board:  { type: String, trim: true, uppercase: true },
  // 12th details
  twelfth_percent:{ type: String, trim: true, uppercase: true },
  twelfth_year:   { type: String, trim: true, uppercase: true },
  twelfth_board:  { type: String, trim: true, uppercase: true },
  // Age
  age:          { type: String, trim: true },

  // Relationships
  center:     { type: mongoose.Schema.Types.ObjectId, ref: 'Center', required: true },
  counselor:  { type: mongoose.Schema.Types.ObjectId, ref: 'Counselor', required: true },
  // University this student is applying to — set at submit time
  university: { type: mongoose.Schema.Types.ObjectId, ref: 'University' },

  // Application status in the admission flow
  applicationStatus: {
    type: String,
    enum: [
      'Draft',              // center filling details
      'Submitted',          // center submitted to counselor
      'Changes_Requested',  // counselor asked center to update
      'Counselor_Approved', // counselor forwarded to accountant
      'Rejected',           // rejected at any stage
      'Accountant_Pending', // accountant reviewing fees
      'Accountant_Approved',// accountant approved → sent to university
      'Sent_To_University', // forwarded to university
      'University_Rejected',// university rejected → back to accountant
      'Accountant_Rejected',// accountant rejected (fee issue) → back to counselor
      'Enrolled',           // university assigned enrollment number
    ],
    default: 'Draft',
  },

  // Notes for rejection / changes
  rejectionReason:    { type: String, trim: true },
  changesRequested:   { type: String, trim: true },
  rejectedVia:        { type: String, enum: ['university', 'accountant', ''], default: '' }, // tracks rejection source for history

  // Amount settlement after rejection or cancellation
  settlementRequested:              { type: Boolean, default: false },  // center requested → counselor notified
  settlementRequestedAt:            { type: Date },
  settlementForwardedToAccountant:  { type: Boolean, default: false },  // counselor forwarded → accountant notified
  settlementForwardedAt:            { type: Date },
  settlementForwardedBy:            { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  amountSettled:                    { type: Boolean, default: false },
  amountSettledAt:                  { type: Date },
  amountSettledBy:                  { type: mongoose.Schema.Types.ObjectId, ref: 'User' },

  // Documents attached at submission time (Aadhaar, 10th marksheet etc.)
  submissionDocs: [{
    name:    { type: String, trim: true },  // e.g. "Aadhaar Card"
    fileUrl: { type: String },
    sizeKb:  { type: Number, default: 0 },
    _id:     false,
  }],

  // Who created / last updated
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },

  // Full status history — every action appended here
  statusHistory: [{
    status:    { type: String, required: true },
    note:      { type: String, default: '' },
    changedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    role:      { type: String, default: '' },
    at:        { type: Date, default: Date.now },
    _id:       false,
  }],
}, { timestamps: true });

module.exports = mongoose.model('Student', studentSchema);
