export const DOCUMENT_OPTIONS = [
  'Marksheet Year One',
  'Marksheet Year Two',
  'Marksheet Year Three',
  'Marksheet Year Four',
  'Marksheet Year Five',
  'Consolidated Marksheet',
  'Final Marksheet',
  'Degree Certificate',
  'Provisional Certificate',
  'Migration Certificate',
  'Simple Transcript',
  'WES Transcript',
  'Bonafide Certificate',
  'Course Completion Certificate',
  'Medium of Instruction Certificate',
  'Enrollment Certificate',
  'Registration Certificate',
  'Transfer Certificate',
  'Character Certificate',
  'Duplicate Marksheet',
  'Duplicate Degree',
  'Other Certificate - Custom',
  'Entrance Exam Result',
  'Admission Offer Letter',
  'Admission Confirmation Letter',
  'Guide Allotment Letter',
  'Course Work Completion Certificate',
  'Coursework Marksheet',
  'RDC/DRC Letter',
  'Synopsis Approval Letter',
  'Progress Report Acknowledgement',
  'Pre-Thesis Letter',
  'Thesis Approval Letter',
  'Plagiarism Certificate',
  'Viva Examination Notification',
  'Viva Voce Letter',
  'Provisional & Migration Certificate',
  'PhD Notification',
];

// Centre document requests: the Documents tab has a Marksheet tab and an Other Documents tab, each with its
// own list. "Other" (OTHER_NAME) lets the centre type a name that is not in the list.
export const OTHER_NAME = '__other__';
const isMarksheetName = name => /marksheet|transcript/i.test(name || '');
export const MARKSHEET_REQUEST_OPTIONS = DOCUMENT_OPTIONS.filter(isMarksheetName);
export const OTHER_REQUEST_OPTIONS = DOCUMENT_OPTIONS.filter(o => !isMarksheetName(o) && o !== 'Other Certificate - Custom');
export const requestOptions = section => (section === 'Marksheet' ? MARKSHEET_REQUEST_OPTIONS : OTHER_REQUEST_OPTIONS);
// The tab a request shows in: the one it was raised from; older requests (no section) go by their name
export const requestSection = doc => doc?.section || (isMarksheetName(doc?.name) ? 'Marksheet' : 'Other');
