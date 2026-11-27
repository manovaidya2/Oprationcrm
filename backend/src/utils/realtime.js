const jwt = require('jsonwebtoken');
const { Server } = require('socket.io');
const User = require('../models/User');

// Live updates (socket.io). A logged-in browser joins its own room (user:<id>) and its role's room (role:<role>).
// The server sends two things:
//  - 'notification'  to the users a notification was written for (the bell / toast update at once)
//  - 'changed' { topic } to the roles that show that data, after any request that changed it — no data is sent,
//    the page refetches through the API (which keeps its own permissions)
let io = null;

// which pages show what: the topic of a changed API path, and the roles whose pages listen for it
const TOPICS = [
  { topic: 'payment-queries', test: p => p.startsWith('/api/payment-queries'), roles: ['Admin', 'Counselor', 'ViewerCounselor'] },
  { topic: 'payments', test: p => /^\/api\/(payments|payment-installments)/.test(p), roles: ['Admin', 'Counselor', 'ViewerCounselor'] },
  { topic: 'documents', test: p => /^\/api\/(documents|new-inventory|marksheet-requests|document-inventory)/.test(p), roles: ['Admin', 'Inventory', 'Dispatch', 'Counselor'] },
];

function initRealtime(httpServer) {
  io = new Server(httpServer, {
    cors: { origin: process.env.CLIENT_ORIGIN?.split(',') || '*', credentials: true },
  });
  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth?.token;
      if (!token) throw new Error('Not authenticated');
      const payload = jwt.verify(token, process.env.JWT_SECRET);
      const user = await User.findById(payload.sub).select('role isActive').lean();
      if (!user || !user.isActive) throw new Error('User not found or inactive');
      socket.data.userId = String(user._id);
      socket.data.role = user.role;
      next();
    } catch (e) {
      next(new Error(e.message || 'Not authenticated'));
    }
  });
  io.on('connection', socket => {
    socket.join(`user:${socket.data.userId}`);
    socket.join(`role:${socket.data.role}`);
  });
  return io;
}

// a notification was written for these users
function emitNotification(userIds) {
  if (!io) return;
  [...new Set((userIds || []).filter(Boolean).map(String))].forEach(id => io.to(`user:${id}`).emit('notification'));
}

// after a successful request that changed something: tell the roles whose pages show it
function announceChange(path) {
  if (!io) return;
  TOPICS.filter(t => t.test(path)).forEach(t => io.to(t.roles.map(r => `role:${r}`)).emit('changed', { topic: t.topic }));
}

// Express middleware: every successful POST / PUT / PATCH / DELETE under /api announces its change when it finishes
function announceChanges(req, res, next) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
  res.on('finish', () => {
    if (res.statusCode < 400) announceChange(req.originalUrl.split('?')[0]);
  });
  next();
}

module.exports = { initRealtime, emitNotification, announceChange, announceChanges, TOPICS };
