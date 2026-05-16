const mongoose = require('mongoose');

const auditSchema = new mongoose.Schema({
  action:    { type: String, required: true },  // e.g. 'student_submitted', 'doc_approved'
  entity:    { type: String, required: true },  // 'Student', 'StudentDocument', 'Payment'
  entityId:  { type: mongoose.Schema.Types.ObjectId, required: true },
  performedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  role:      { type: String },
  details:   { type: Object },
  message:   { type: String },
}, { timestamps: { createdAt: 'at', updatedAt: false } });

auditSchema.index({ entityId: 1 });
auditSchema.index({ performedBy: 1 });

module.exports = mongoose.model('AuditLog', auditSchema);
