const mongoose = require('mongoose');

const conversationSchema = new mongoose.Schema({
  kind: {
    type: String,
    enum: ['internal', 'ticket'],
    required: true,
    index: true,
  },
  title: { type: String, trim: true, default: '' },
  participants: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User', index: true }],
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },

  ticket: {
    subject: { type: String, trim: true },
    priority: { type: String, enum: ['Low', 'Normal', 'High', 'Urgent'], default: 'Normal' },
    status: { type: String, enum: ['Open', 'In_Progress', 'Resolved', 'Closed'], default: 'Open', index: true },
    center: { type: mongoose.Schema.Types.ObjectId, ref: 'Center', index: true },
    student: { type: mongoose.Schema.Types.ObjectId, ref: 'Student', index: true },
    assignedTo: { type: mongoose.Schema.Types.ObjectId, ref: 'User', index: true },
    acceptedAt: Date,
    resolutionNote: { type: String, trim: true },
    resolvedAt: Date,
    resolvedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    closeNote: { type: String, trim: true },
    closeReason: { type: String, trim: true },
    closedWithoutResolution: { type: Boolean, default: false },
    closedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    closedAt: Date,
  },

  lastMessageAt: { type: Date, default: Date.now, index: true },
  lastMessagePreview: { type: String, default: '' },
}, { timestamps: true });

conversationSchema.index({ kind: 1, participants: 1, lastMessageAt: -1 });

module.exports = mongoose.model('Conversation', conversationSchema);
