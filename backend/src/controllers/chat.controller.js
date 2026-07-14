const asyncHandler = require('express-async-handler');
const Conversation = require('../models/Conversation');
const ChatMessage = require('../models/ChatMessage');
const User = require('../models/User');
const Center = require('../models/Center');
const Counselor = require('../models/Counselor');
const { notify, audit } = require('../utils/helpers');

function userId(req) {
  return String(req.user._id || req.user.id);
}

function isParticipant(conversation, id) {
  return (conversation.participants || []).some(p => String(p._id || p) === String(id));
}

async function canAccessConversation(req, conversation) {
  if (req.user.role === 'Admin') return true;
  if (isParticipant(conversation, userId(req))) return true;
  if (conversation.kind === 'ticket') {
    if (req.user.role === 'Center' && String(conversation.ticket?.center) === String(req.user.centerId)) return true;
    if (req.user.role === 'Counselor' && String(conversation.ticket?.assignedTo) === userId(req)) return true;
  }
  return false;
}

async function populateConversation(query) {
  return query
    .populate('participants', 'name email role avatarColor avatarSeed centerId counselorId universityId')
    .populate('createdBy', 'name role')
    .populate('ticket.center', 'name organisationName city')
    .populate('ticket.assignedTo', 'name email role avatarSeed');
}

async function notifyConversation(conversation, sender, message) {
  const ids = (conversation.participants || [])
    .map(p => String(p._id || p))
    .filter(id => id && id !== String(sender._id || sender.id));
  if (!ids.length) return;
  const label = conversation.kind === 'ticket'
    ? `Ticket: ${conversation.ticket?.subject || conversation.title}`
    : conversation.title || 'Team chat';
  await notify(ids, {
    message: `${sender.name || sender.role}: ${message.body.slice(0, 90)}${message.body.length > 90 ? '...' : ''}`,
    type: conversation.kind === 'ticket' ? 'ticket_message' : 'chat_message',
    role: '',
  });
  if (conversation.kind === 'ticket' && sender.role === 'Center' && conversation.ticket?.assignedTo) {
    await notify(conversation.ticket.assignedTo, {
      message: `New help reply in ${label}`,
      type: 'ticket_message',
      role: 'Counselor',
    });
  }
}

exports.users = asyncHandler(async (req, res) => {
  if (req.user.role === 'Center') {
    return res.json([]);
  }
  const users = await User.find({
    isActive: true,
    role: { $ne: 'Center' },
    _id: { $ne: req.user._id },
  })
    .select('name email role avatarColor avatarSeed counselorId universityId')
    .populate('counselorId universityId', 'name')
    .sort('role name')
    .lean();
  res.json(users);
});

exports.list = asyncHandler(async (req, res) => {
  const filter = {};
  if (req.query.kind) filter.kind = req.query.kind;

  if (req.user.role === 'Admin') {
    // Admin can review all internal conversations and help tickets.
  } else if (req.user.role === 'Center') {
    filter.kind = 'ticket';
    filter['ticket.center'] = req.user.centerId;
  } else {
    filter.participants = req.user._id;
  }

  const conversations = await populateConversation(
    Conversation.find(filter).sort('-lastMessageAt -updatedAt')
  );
  res.json(conversations);
});

exports.createInternal = asyncHandler(async (req, res) => {
  if (req.user.role === 'Center') {
    const e = new Error('Centers can use Help tickets, not internal team chat'); e.status = 403; throw e;
  }
  const ids = Array.from(new Set([...(req.body.participantIds || []), String(req.user._id)]));
  if (ids.length < 2) {
    const e = new Error('Select at least one team member'); e.status = 400; throw e;
  }
  const users = await User.find({ _id: { $in: ids }, isActive: true, role: { $ne: 'Center' } }).select('_id name role');
  if (users.length !== ids.length) {
    const e = new Error('Invalid team member selected'); e.status = 400; throw e;
  }
  const isGroup = ids.length > 2;
  const title = (req.body.title || '').trim();
  if (isGroup && !title) {
    const e = new Error('Group name required'); e.status = 400; throw e;
  }
  let conversation = await Conversation.create({
    kind: 'internal',
    title: isGroup ? title : '',
    participants: users.map(u => u._id),
    createdBy: req.user._id,
  });
  conversation = await populateConversation(Conversation.findById(conversation._id));
  await audit('chat_created', 'Conversation', conversation._id, req.user, { kind: 'internal' }, `Internal chat created`);
  res.status(201).json(conversation);
});

exports.removeInternal = asyncHandler(async (req, res) => {
  const conversation = await Conversation.findById(req.params.id);
  if (!conversation) { const e = new Error('Conversation not found'); e.status = 404; throw e; }
  if (conversation.kind !== 'internal') {
    const e = new Error('Help tickets cannot be deleted from team chat'); e.status = 400; throw e;
  }
  const isCreator = String(conversation.createdBy) === userId(req);
  if (req.user.role !== 'Admin' && !isCreator) {
    const e = new Error('Only the group creator or Admin can delete this chat'); e.status = 403; throw e;
  }

  await ChatMessage.deleteMany({ conversation: conversation._id });
  await Conversation.deleteOne({ _id: conversation._id });
  await audit('chat_deleted', 'Conversation', conversation._id, req.user, { kind: 'internal' }, 'Internal chat deleted');
  res.status(204).end();
});

exports.createTicket = asyncHandler(async (req, res) => {
  if (req.user.role !== 'Center') {
    const e = new Error('Only centers can raise help tickets'); e.status = 403; throw e;
  }
  const subject = (req.body.subject || '').trim();
  const body = (req.body.message || '').trim();
  if (!subject || !body) {
    const e = new Error('Subject and message are required'); e.status = 400; throw e;
  }

  const center = await Center.findById(req.user.centerId).select('name assignedCounselor').lean();
  if (!center) { const e = new Error('Center not found'); e.status = 404; throw e; }

  let counselorId = center.assignedCounselor;
  if (!counselorId) {
    const counselor = await Counselor.findOne({ centers: center._id, isActive: true }).select('_id').lean();
    counselorId = counselor?._id;
  }
  if (!counselorId) {
    const e = new Error('No counselor assigned to this center'); e.status = 400; throw e;
  }

  const counselorUser = await User.findOne({ role: 'Counselor', counselorId, isActive: true }).select('_id name role').lean();
  if (!counselorUser) {
    const e = new Error('Assigned counselor login not found'); e.status = 400; throw e;
  }

  let conversation = await Conversation.create({
    kind: 'ticket',
    title: subject,
    participants: [req.user._id, counselorUser._id],
    createdBy: req.user._id,
    ticket: {
      subject,
      priority: req.body.priority || 'Normal',
      status: 'Open',
      center: center._id,
      assignedTo: counselorUser._id,
    },
    lastMessagePreview: body.slice(0, 120),
    lastMessageAt: new Date(),
  });

  await ChatMessage.create({
    conversation: conversation._id,
    sender: req.user._id,
    body,
    readBy: [req.user._id],
  });

  await notify(counselorUser._id, {
    message: `New help ticket from ${center.name}: ${subject}`,
    type: 'help_ticket',
    role: 'Counselor',
  });
  await audit('ticket_created', 'Conversation', conversation._id, req.user, { subject }, `Help ticket created`);
  conversation = await populateConversation(Conversation.findById(conversation._id));
  res.status(201).json(conversation);
});

exports.messages = asyncHandler(async (req, res) => {
  const conversation = await Conversation.findById(req.params.id);
  if (!conversation) { const e = new Error('Conversation not found'); e.status = 404; throw e; }
  if (!(await canAccessConversation(req, conversation))) {
    const e = new Error('Forbidden'); e.status = 403; throw e;
  }
  const messages = await ChatMessage.find({ conversation: conversation._id })
    .populate('sender', 'name email role avatarColor avatarSeed')
    .sort('createdAt')
    .lean();
  await ChatMessage.updateMany(
    { conversation: conversation._id, readBy: { $ne: req.user._id } },
    { $addToSet: { readBy: req.user._id } }
  );
  res.json(messages);
});

exports.sendMessage = asyncHandler(async (req, res) => {
  const body = (req.body.body || '').trim();
  if (!body) { const e = new Error('Message required'); e.status = 400; throw e; }

  let conversation = await Conversation.findById(req.params.id);
  if (!conversation) { const e = new Error('Conversation not found'); e.status = 404; throw e; }
  if (!(await canAccessConversation(req, conversation))) {
    const e = new Error('Forbidden'); e.status = 403; throw e;
  }
  if (conversation.ticket?.status === 'Closed') {
    const e = new Error('Ticket is closed'); e.status = 400; throw e;
  }
  if (conversation.kind === 'ticket' && conversation.ticket?.status === 'Open' && req.user.role === 'Center') {
    const e = new Error('Counselor must accept this ticket before chat starts'); e.status = 400; throw e;
  }

  const message = await ChatMessage.create({
    conversation: conversation._id,
    sender: req.user._id,
    body,
    readBy: [req.user._id],
  });
  conversation.lastMessageAt = new Date();
  conversation.lastMessagePreview = body.slice(0, 120);
  await conversation.save();

  conversation = await Conversation.findById(conversation._id).populate('participants', '_id');
  await notifyConversation(conversation, req.user, message);

  const out = await ChatMessage.findById(message._id).populate('sender', 'name email role avatarColor avatarSeed');
  res.status(201).json(out);
});

exports.updateTicketStatus = asyncHandler(async (req, res) => {
  const status = req.body.status;
  if (!['Open', 'In_Progress', 'Resolved', 'Closed'].includes(status)) {
    const e = new Error('Invalid ticket status'); e.status = 400; throw e;
  }
  const conversation = await Conversation.findById(req.params.id);
  if (!conversation || conversation.kind !== 'ticket') {
    const e = new Error('Ticket not found'); e.status = 404; throw e;
  }
  if (!(await canAccessConversation(req, conversation))) {
    const e = new Error('Forbidden'); e.status = 403; throw e;
  }
  if (req.user.role === 'Center' && !['Closed'].includes(status)) {
    const e = new Error('Center can only close resolved tickets'); e.status = 403; throw e;
  }

  conversation.ticket.status = status;
  if (status === 'In_Progress' && !conversation.ticket.acceptedAt) conversation.ticket.acceptedAt = new Date();
  if (status === 'Closed') conversation.ticket.closedAt = new Date();
  conversation.lastMessageAt = new Date();
  await conversation.save();

  const systemText = status === 'In_Progress' ? 'Ticket accepted by counselor' : `Ticket marked ${status.replace(/_/g, ' ')}`;
  await ChatMessage.create({
    conversation: conversation._id,
    sender: req.user._id,
    body: systemText,
    readBy: [req.user._id],
  });
  await audit('ticket_status_changed', 'Conversation', conversation._id, req.user, { status }, systemText);
  res.json(await populateConversation(Conversation.findById(conversation._id)));
});
