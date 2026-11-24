// Admission payment timeline: days since the admission was submitted, while its course fee is not fully paid.
// The stage of each student comes from the server (GET /admission-timeline): 0-14 none, 15-29 yellow,
// 30-44 orange, 45+ red, and from day 50 the student is flagged "cancel admission".
//   dot  - small status dot      top  - column accent bar     pill - count / day chip
//   fill - paid progress bar     bar  - left accent on a student card elsewhere
export const TIMELINE_STAGES = [
  { key: 'none',   label: '0–14 days',  hint: 'Within time',
    dot: 'bg-slate-400',  top: 'border-t-slate-300',  pill: 'bg-slate-100 text-slate-700',   fill: 'bg-indigo-500', bar: 'border-l-slate-300' },
  { key: 'yellow', label: '15–29 days', hint: 'Payment not complete',
    dot: 'bg-yellow-400', top: 'border-t-yellow-400', pill: 'bg-yellow-100 text-yellow-800', fill: 'bg-yellow-400', bar: 'border-l-yellow-400' },
  { key: 'orange', label: '30–44 days', hint: 'Payment overdue',
    dot: 'bg-orange-500', top: 'border-t-orange-500', pill: 'bg-orange-100 text-orange-800', fill: 'bg-orange-500', bar: 'border-l-orange-500' },
  { key: 'red',    label: '45+ days',   hint: 'Critical — cancel from day 50',
    dot: 'bg-red-600',    top: 'border-t-red-600',    pill: 'bg-red-100 text-red-700',       fill: 'bg-red-600',    bar: 'border-l-red-600' },
];

export const stageOf = key => TIMELINE_STAGES.find(s => s.key === key) || TIMELINE_STAGES[0];
