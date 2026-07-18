const BASE = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';

function token() { return localStorage.getItem('crm_token'); }

export async function request(path, options = {}) {
  const isFormData = options.body instanceof FormData;
  const headers = {
    // Don't set Content-Type for FormData — browser sets multipart/form-data + boundary automatically
    ...(isFormData ? {} : { 'Content-Type': 'application/json' }),
    ...(token() ? { Authorization: `Bearer ${token()}` } : {}),
    ...options.headers,
  };
  const res = await fetch(`${BASE}${path}`, { ...options, headers });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || err.message || 'Request failed');
  }
  return res.status === 204 ? null : res.json();
}

// File upload (no Content-Type header — browser sets multipart boundary)
export async function uploadRequest(path, method, formData) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { Authorization: `Bearer ${token()}` },
    body: formData,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || 'Upload failed');
  }
  return res.json();
}

// ── AUTH ────────────────────────────────────────────────────
export const authApi = {
  me:             ()         => request('/auth/me'),
  listUsers:      (role)     => request(`/auth/users${role ? `?role=${role}` : ''}`),
  createUser:     (data)     => request('/auth/users', { method: 'POST', body: JSON.stringify(data) }),
  resetPassword:  (id, pwd)  => request(`/auth/users/${id}/password`, { method: 'PATCH', body: JSON.stringify({ password: pwd }) }),
  changeOwnPassword: (currentPassword, newPassword) => request(`/auth/me/password`, { method: 'PATCH', body: JSON.stringify({ currentPassword, newPassword }) }),
  updateAvatar:   (avatarSeed) => request('/auth/me/avatar', { method: 'PATCH', body: JSON.stringify({ avatarSeed }) }),
  toggleUser:     (id)       => request(`/auth/users/${id}/toggle`, { method: 'PATCH' }),
  deleteUser:     (id)       => request(`/auth/users/${id}`, { method: 'DELETE' }),
};

// ── UNIVERSITIES ─────────────────────────────────────────────
export const universitiesApi = {
  getAll:  ()         => request('/universities'),
  getOne:  (id)       => request(`/universities/${id}`),
  stats:   (id)       => request(`/universities/${id}/stats`),
  create:  (data)     => request('/universities', { method: 'POST', body: JSON.stringify(data) }),
  update:  (id, data) => request(`/universities/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  delete:  (id)       => request(`/universities/${id}`, { method: 'DELETE' }),
};

// ── CENTERS ─────────────────────────────────────────────────
export const centersApi = {
  uploadDoc:  (id, fd)       => request(`/centers/${id}/docs`, { method: 'POST', body: fd }),
  deleteDoc:  (id, docId)    => request(`/centers/${id}/docs/${docId}`, { method: 'DELETE' }),
  getAll:  ()         => request('/centers'),
  getOne:  (id)       => request(`/centers/${id}`),
  create:  (data)     => request('/centers', { method: 'POST', body: data instanceof FormData ? data : JSON.stringify(data) }),
  update:  (id, data) => request(`/centers/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  delete:     (id)    => request(`/centers/${id}`, { method: 'DELETE' }),
  getStudents:(id)    => request(`/centers/${id}/students`),
  // University access control
  getUniversities: (id)     => request(`/centers/${id}/universities`),
  setUniversities: (id, ids)=> request(`/centers/${id}/universities`, { method: 'PUT', body: JSON.stringify({ universityIds: ids }) }),
};

// ── COUNSELORS ───────────────────────────────────────────────
export const counselorsApi = {
  getAll:      ()         => request('/counselors'),
  getOne:      (id)       => request(`/counselors/${id}`),
  create:      (data)     => request('/counselors', { method: 'POST', body: JSON.stringify(data) }),
  update:      (id, data) => request(`/counselors/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  delete:      (id)       => request(`/counselors/${id}`, { method: 'DELETE' }),
  addCenter:   (id, cId)  => request(`/counselors/${id}/centers`, { method: 'POST', body: JSON.stringify({ centerId: cId }) }),
};

// ── STUDENTS ─────────────────────────────────────────────────
export const studentsApi = {
  getAll:          (params = {}) => request(`/students?${new URLSearchParams(params)}`),
  getOne:          (id)          => request(`/students/${id}`),
  create:          (data)        => request('/students', { method: 'POST', body: JSON.stringify(data) }),
  update:          (id, data)    => request(`/students/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  delete:          (id, data)    => request(`/students/${id}`, { method: 'DELETE', body: JSON.stringify(data || {}) }),
  // Flow actions
  submit:          (id, data)    => request(`/students/${id}/submit`, { method: 'POST', body: JSON.stringify(data || {}) }),
  approve:         (id)          => request(`/students/${id}/approve`, { method: 'POST' }),
  counselorReforward:    (id)       => request(`/students/${id}/counselor-reforward`, { method: 'POST' }),
  counselorSendToCenter: (id, note) => request(`/students/${id}/counselor-send-to-center`, { method: 'POST', body: JSON.stringify({ note }) }),
  reject:          (id, reason)  => request(`/students/${id}/reject`, { method: 'POST', body: JSON.stringify({ reason }) }),
  requestChanges:  (id, note)    => request(`/students/${id}/request-changes`, { method: 'POST', body: JSON.stringify({ note }) }),
  accountantAction:(id, action, note) => request(`/students/${id}/accountant-action`, { method: 'POST', body: JSON.stringify({ action, note }) }),
  assignEnrollment:(id, num)     => request(`/students/${id}/enrollment`, { method: 'POST', body: JSON.stringify({ enrollmentNumber: num }) }),
  checkEnrollment: (id, note='', data = {}) => request(`/students/${id}/enrollment-check`, { method: 'POST', body: JSON.stringify({ note, ...data }) }),
  universityReject:(id, reason)  => request(`/students/${id}/university-reject`, { method: 'POST', body: JSON.stringify({ reason }) }),
  accountantForwardToCounselor:(id, note) => request(`/students/${id}/accountant-forward-to-counselor`, { method: 'POST', body: JSON.stringify({ note }) }),
  counselorSendToCenterFinal:(id, note)   => request(`/students/${id}/counselor-send-to-center`, { method: 'POST', body: JSON.stringify({ note, finalReject: true }) }),
  amountSettle:      (id)          => request(`/students/${id}/amount-settle`,      { method: 'POST' }),
  cancelApplication: (id, reason)  => request(`/students/${id}/cancel`,             { method: 'POST', body: JSON.stringify({ reason: reason || '' }) }),
  transferCenter:    (id, centerId, note='') => request(`/students/${id}/transfer-center`, { method: 'POST', body: JSON.stringify({ centerId, note }) }),
  requestSettlement: (id, note, data = {}) => request(`/students/${id}/request-settlement`, { method: 'POST', body: JSON.stringify({ note: note || '', ...data }) }),
  forwardSettlement: (id, note)    => request(`/students/${id}/forward-settlement`, { method: 'POST', body: JSON.stringify({ note: note || '' }) }),
};

// ── PAYMENTS ─────────────────────────────────────────────────
export const paymentsApi = {  get:            (sid)          => request(`/payments/${sid}`),
  upsertFee:      (sid, data)    => request(`/payments/${sid}`, { method: 'PUT', body: JSON.stringify(data) }),
  addTransaction: (sid, data)    => request(`/payments/${sid}/transactions`, { method: 'POST', body: JSON.stringify(data) }),
  updateTransaction:      (sid, txId, data) => request(`/payments/${sid}/transactions/${txId}`, { method: 'PATCH', body: JSON.stringify(data) }),
  updateTransactionForm:  (sid, txId, fd)   => request(`/payments/${sid}/transactions/${txId}`, { method: 'PATCH', body: fd }),  // FormData for file upload
  installmentTimeline:    ()                => request('/payment-installments'),
  dueTimeline:            ()                => request('/payment-due-timelines'),
  updatePaymentTimeline:  (paymentId, data) => request(`/payment-installments/${paymentId}/timeline`, { method: 'PUT', body: JSON.stringify(data) }),
  updateInstallmentTimeline: (paymentId, data) => request(`/payment-installments/${paymentId}/installments`, { method: 'PUT', body: JSON.stringify(data) }),
  markInstallmentPaid:    (paymentId, installmentId, fd) => uploadRequest(`/payment-installments/${paymentId}/installments/${installmentId}/pay`, 'POST', fd),
  resendTransaction: async (sid, txId, formData) => {
    const BASE = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';
    const token = localStorage.getItem('crm_token');
    const res = await fetch(`${BASE}/payments/${sid}/transactions/${txId}/resend`, {
      method: 'PATCH', headers: { Authorization: `Bearer ${token}` }, body: formData,
    });
    if (!res.ok) { const e = await res.json(); throw new Error(e.message || 'Failed'); }
    return res.json();
  },
  counselorForwardPayment:(sid, txId)       => request(`/payments/${sid}/transactions/${txId}/counsel-verify`, { method: 'PATCH' }),
  counselorRejectPayment: (sid, txId, note) => request(`/payments/${sid}/transactions/${txId}/counsel-reject`, { method: 'PATCH', body: JSON.stringify({ note }) }),
  accountantVerifyPayment:(sid, txId, data) => request(`/payments/${sid}/transactions/${txId}/account-verify`, { method: 'PATCH', body: JSON.stringify(data) }),
 deleteTransaction:      (sid, txId)       => request(`/payments/${sid}/transactions/${txId}`, { method: 'DELETE' }),
  getRejectedPayments:    ()                => request('/payments-rejected'),};

// ── DOCUMENTS ────────────────────────────────────────────────
export const docsApi = {
  list:           (params = {}) => request(`/documents?${new URLSearchParams(params)}`),
  get:            (id)          => request(`/documents/${id}`),
  create:         (fd)          => uploadRequest('/documents', 'POST', fd),
  update:         (id, fd)      => uploadRequest(`/documents/${id}`, 'PATCH', fd),
  delete:         (id)          => request(`/documents/${id}`, { method: 'DELETE' }),
  // Flow
  forward:        (id)          => request(`/documents/${id}/forward`, { method: 'PATCH' }),
  requestChanges: (id, note)    => request(`/documents/${id}/request-changes`, { method: 'PATCH', body: JSON.stringify({ note }) }),
  accountantAction:(id, action, note) => request(`/documents/${id}/accountant-action`, { method: 'PATCH', body: JSON.stringify({ action, note }) }),
  dispatchReceive:(id)          => request(`/documents/${id}/dispatch-receive`, { method: 'PATCH' }),
  uploadScan:     (id, fd)      => uploadRequest(`/documents/${id}/upload-scan`, 'PATCH', fd),
  addPayment:     (id, data)    => request(`/documents/${id}/payments`, { method: 'POST', body: JSON.stringify(data) }),
  verifyPayment:  (id, approved, note) => request(`/documents/${id}/verify-payment`, { method: 'PATCH', body: JSON.stringify({ approved, note }) }),
  dispatchToCenter:(id, data)   => request(`/documents/${id}/dispatch-to-center`, { method: 'PATCH', body: JSON.stringify(data) }),
  accountantForwardScan:(id)    => request(`/documents/${id}/accountant-forward-scan`, { method: 'PATCH' }),
  universityDispatch:(id, data) => request(`/documents/${id}/university-dispatch`, { method: 'PATCH', body: JSON.stringify(data) }),
  forwardToCenter:  (id)        => request(`/documents/${id}/forward-to-center`, { method: 'PATCH' }),
  requestDispatch:  (id, data = {}) => request(`/documents/${id}/request-dispatch`, { method: 'PATCH', body: JSON.stringify(data) }),
  forwardPayment:   (id)        => request(`/documents/${id}/forward-payment`, { method: 'PATCH' }),
  updatePayment:    (id, payId, data) => request(`/documents/${id}/payments/${payId}`, { method: 'PATCH', body: JSON.stringify(data) }),
  confirmDelivery:  (id, data = {}) => request(`/documents/${id}/confirm-delivery`, { method: 'PATCH', body: JSON.stringify(data) }),
  paymentFollowups: ()          => request('/document-payment-followups'),
  markPaymentFollowup: (id, data) => request(`/documents/${id}/payment-followup`, { method: 'POST', body: JSON.stringify(data) }),
};

export const documentInventoryApi = {
  list:        ()                => request('/document-inventory'),
  addDocs:     (studentId, data) => request(`/document-inventory/${studentId}/docs`, { method: 'POST', body: JSON.stringify(data) }),
  markReceived:(docId, data={})  => request(`/document-inventory/docs/${docId}/receive`, { method: 'PATCH', body: JSON.stringify(data) }),
  requestDoc:  (docId, data={})  => request(`/document-inventory/docs/${docId}/request`, { method: 'PATCH', body: JSON.stringify(data) }),
  urgentDoc:   (docId, data={})  => request(`/document-inventory/docs/${docId}/urgent`, { method: 'PATCH', body: JSON.stringify(data) }),
  markDispatched:(docId, data={}) => request(`/document-inventory/docs/${docId}/dispatched`, { method: 'PATCH', body: JSON.stringify(data) }),
  markDelivered: (docId, data={}) => request(`/document-inventory/docs/${docId}/delivered`, { method: 'PATCH', body: JSON.stringify(data) }),
};

export const chatApi = {
  users:         ()             => request('/chat/users'),
  conversations: (params = {}) => request(`/chat/conversations?${new URLSearchParams(params)}`),
  createChat:    (data)        => request('/chat/conversations', { method: 'POST', body: JSON.stringify(data) }),
  deleteChat:    (id)          => request(`/chat/conversations/${id}`, { method: 'DELETE' }),
  createTicket:  (data)        => request('/chat/tickets', { method: 'POST', body: JSON.stringify(data) }),
  messages:      (id)          => request(`/chat/conversations/${id}/messages`),
  sendMessage:   (id, body)    => request(`/chat/conversations/${id}/messages`, { method: 'POST', body: JSON.stringify({ body }) }),
  updateTicket:  (id, status, data = {})  => request(`/chat/tickets/${id}/status`, { method: 'PATCH', body: JSON.stringify({ status, ...data }) }),
};

// ── NOTIFICATIONS ─────────────────────────────────────────────
export const notifApi = {
  list:     ()   => request('/notifications'),
  readAll:  ()   => request('/notifications/read-all', { method: 'PATCH' }),
  readOne:  (id) => request(`/notifications/${id}/read`, { method: 'PATCH' }),
};

// ── DASHBOARD ─────────────────────────────────────────────────
export const dashApi = {
  stats: () => request('/dashboard/stats'),
};

// ── AUDIT LOG ────────────────────────────────────────────────
export const auditApi = {
  list: (params = {}) => request(`/audit?${new URLSearchParams(params)}`),
};
// ── PAYMENT ACCOUNTS ─────────────────────────────────────────
export const paymentAccountsApi = {
  list:   ()         => request('/payment-accounts'),
  listAll:()         => request('/payment-accounts/all'),
  create: (data)     => request('/payment-accounts', { method: 'POST', body: JSON.stringify(data) }),
  update: (id, data) => request(`/payment-accounts/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  remove: (id)       => request(`/payment-accounts/${id}`, { method: 'DELETE' }),
};
