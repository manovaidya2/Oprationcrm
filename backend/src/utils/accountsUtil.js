// Small helpers shared by the Payment Desk (accounts book) controllers.
const mongoose = require('mongoose');

const EPS = 0.005;
const COUNTED = ['verified', 'not_required'];            // fee payments that count as "paid"
const PENDING = ['pending_counselor', 'pending_accountant'];

const fail = (message, status = 400, details) => {
  const e = new Error(message); e.status = status; if (details) e.details = details; return e;
};
const r2 = n => Math.round((Number(n) || 0) * 100) / 100;
const num = v => { const n = Number(v); return Number.isFinite(n) ? n : NaN; };
const isId = v => mongoose.Types.ObjectId.isValid(String(v || ''));
const esc = s => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function parseYmd(value, label = 'Date') {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value || ''))) throw fail(`${label} must be a valid date`);
  const [y, m, d] = value.split('-').map(Number);
  return new Date(y, m - 1, d);
}

// { from, toExcl } — `to` is inclusive for the user, exclusive here. Defaults to the current month.
function parseRange(q = {}) {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const from = q.from ? parseYmd(q.from, 'From date') : new Date(today.getFullYear(), today.getMonth(), 1);
  const to = q.to ? parseYmd(q.to, 'To date') : today;
  const toExcl = new Date(to); toExcl.setDate(toExcl.getDate() + 1);
  if (toExcl <= from) throw fail('To date must not be before From date');
  return { from, toExcl };
}

// ── CSV ──────────────────────────────────────────────────────
function csvCell(v) {
  if (v === null || v === undefined) return '';
  const s = String(v);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
const istFmt = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', hour12: false,
});
function ist(value, withTime = false) {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  const p = Object.fromEntries(istFmt.formatToParts(d).map(x => [x.type, x.value]));
  const date = `${p.year}-${p.month}-${p.day}`;
  return withTime ? `${date} ${p.hour}:${p.minute}` : date;
}
// `tables` is one table ([header, ...rows]) or several, separated by a blank line.
function sendCsv(res, filename, ...tables) {
  const body = tables.map(t => t.map(r => r.map(csvCell).join(',')).join('\r\n')).join('\r\n\r\n');
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${String(filename).replace(/[^\w.\- ]+/g, '_')}"`);
  res.send('﻿' + body);
}
const stamp = () => ist(new Date());
// A student the university rejected: their payments are not verified, they are adjusted into a centre settlement instead.
const isUniRejected = s => !!s && (['University_Rejected', 'Rejected'].includes(s.applicationStatus) || (['Accountant_Rejected', 'Cancelled'].includes(s.applicationStatus) && s.rejectedVia === 'university'));

module.exports = {
  EPS, COUNTED, PENDING, isUniRejected, fail, r2, num, isId, esc, parseYmd, parseRange, ist, sendCsv, stamp,
};
