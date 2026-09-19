const jwt  = require('jsonwebtoken');
const User = require('../models/User');
const University = require('../models/University');

async function protect(req, _res, next) {
  try {
    const header = req.headers.authorization || '';
    const token  = header.startsWith('Bearer ') ? header.slice(7) : null;
    if (!token) { const e = new Error('Not authenticated'); e.status = 401; throw e; }

    const payload = jwt.verify(token, process.env.JWT_SECRET);
    const user    = await User.findById(payload.sub).lean();
    if (!user || !user.isActive) { const e = new Error('User not found or inactive'); e.status = 401; throw e; }
    // Inactive university => all of its logins stop working immediately (existing sessions too)
    if (user.role === 'University' && user.universityId) {
      const uni = await University.findById(user.universityId).select('isActive').lean();
      if (uni && uni.isActive === false) { const e = new Error('University is inactive'); e.status = 401; throw e; }
    }
    req.user = user;
    next();
  } catch (e) {
    if (!e.status) e.status = 401;
    next(e);
  }
}

function requireRole(...roles) {
  return (req, _res, next) => {
    if (!req.user) { const e = new Error('Not authenticated'); e.status = 401; return next(e); }
    if (!roles.includes(req.user.role)) { const e = new Error('Forbidden'); e.status = 403; return next(e); }
    next();
  };
}

module.exports = { protect, requireRole };
