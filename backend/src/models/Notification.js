const mongoose = require('mongoose');

const notificationSchema = new mongoose.Schema({
  // recipient
  userId:   { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  role:     { type: String, required: true }, // which role this is for (quick filter)

  message:  { type: String, required: true },
  type:     {
    type: String,
    enum: [
      'student_submitted', 'application_approved', 'application_rejected',
      'changes_requested', 'enrollment_assigned',
      'doc_requested', 'doc_forwarded', 'doc_fee_approved', 'doc_fee_rejected',
      'doc_scanned', 'doc_payment_received', 'doc_dispatched',
      'payment_verified', 'doc_delivered', 'general',
    ],
    default: 'general',
  },

  // contextual links
  studentId:  { type: mongoose.Schema.Types.ObjectId, ref: 'Student' },
  documentId: { type: mongoose.Schema.Types.ObjectId, ref: 'StudentDocument' },

  read: { type: Boolean, default: false },
}, { timestamps: { createdAt: 'at', updatedAt: false } });

module.exports = mongoose.model('Notification', notificationSchema);
