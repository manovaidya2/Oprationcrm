// ============================================================
// src/lib/store.js  — Zustand store backed by real API
// Interface is IDENTICAL to old store so no page changes needed
// ============================================================

import { create } from "zustand";
import { api } from "./api";

// ── Helpers (kept for backward compat if any page imports them) ──
export const uid = () => Math.random().toString(36).slice(2, 9);
export const DEFAULT_PIPELINE = [
  { key: "doc_verification", name: "Document Verification" },
  { key: "payment",          name: "Payment Follow-up" },
  { key: "form_submission",  name: "Form Submission" },
];

// Convert MongoDB _id → id (frontend always uses .id)
function norm(obj) {
  if (!obj) return obj;
  if (Array.isArray(obj)) return obj.map(norm);
  const { _id, __v, ...rest } = obj;
  const out = { ...rest, id: _id ?? obj.id };
  for (const k of Object.keys(out)) {
    if (out[k] && typeof out[k] === "object" && !Array.isArray(out[k]) && out[k]._id) {
      out[k] = norm(out[k]);
    }
    if (Array.isArray(out[k])) {
      out[k] = out[k].map((v) =>
        v && typeof v === "object" && v._id ? norm(v) : v
      );
    }
  }
  return out;
}

// Flatten pipeline steps into flat task list (used by TasksPage & DashboardPage)
export function flattenTasks(pipelines) {
  const out = [];
  for (const [studentId, steps] of Object.entries(pipelines)) {
    for (const s of steps) {
      out.push({
        id: `${studentId}:${s.key}`,
        studentId,
        counselorId: s.assignedTo?.id ?? s.assignedTo,
        assignedBy:  s.assignedBy?.id  ?? s.assignedBy,
        kind:        s.name,
        stepKey:     s.key,
        status:      s.status,
        dueDate:     s.dueDate,
        locked:      s.locked,
        verifiedBy:  s.verifiedBy,
        completedAt: s.completedAt,
      });
    }
  }
  return out;
}

// ── Store ────────────────────────────────────────────────────
export const useStore = create((set, get) => ({
  centers:           [],
  counselors:        [],
  students:          [],
  pipelines:         {},
  history:           [],
  docs:              [],
  activities:        [],
  notifications:     [],
  pipelineTemplate:  DEFAULT_PIPELINE,
  role:              "Admin",
  currentCounselorId: null,
  loading:           false,
  error:             null,

  setRole: (role)           => set({ role }),
  setCurrentCounselor: (id) => set({ currentCounselorId: id }),

  // Bootstrap: load everything on app start
  bootstrap: async () => {
    set({ loading: true });
    try {
      const [centers, counselors, students, tasks, docs, activities] = await Promise.all([
        api.centers.getAll(),
        api.counselors.getAll(),
        api.students.getAll(),
        api.tasks.getAll(),
        api.documents.getAll(),
        api.dashboard.getActivities(),
      ]);

      const normCenters    = norm(centers);
      const normCounselors = norm(counselors);
      const normStudents   = norm(students);
      const normDocs       = norm(docs);
      const normActivities = norm(activities);

      // Rebuild pipelines map from flat task list
      const pipelines = {};
      for (const t of norm(tasks)) {
        const sid = typeof t.studentId === "object" ? t.studentId.id : t.studentId;
        if (!pipelines[sid]) pipelines[sid] = [];
        pipelines[sid].push({
          key:         t.stepKey,
          name:        t.kind,
          status:      t.status,
          assignedTo:  typeof t.counselorId === "object" ? t.counselorId.id : t.counselorId,
          assignedBy:  typeof t.assignedBy === "object"  ? t.assignedBy.id  : t.assignedBy,
          dueDate:     t.dueDate,
          locked:      t.locked,
          verifiedBy:  t.verifiedBy,
          completedAt: t.completedAt,
        });
      }

      const firstCounselor = normCounselors[0]?.id ?? null;

      set({
        centers: normCenters,
        counselors: normCounselors,
        students: normStudents,
        pipelines,
        docs: normDocs,
        activities: normActivities,
        currentCounselorId: firstCounselor,
        loading: false,
      });

      if (firstCounselor) get().loadNotifications(firstCounselor);
    } catch (err) {
      set({ error: err.message, loading: false });
    }
  },

  loadPipeline: async (studentId) => {
    try {
      const pipeline = norm(await api.tasks.getPipeline(studentId));
      const steps = pipeline.steps.map((s) => ({
        key:         s.key,
        name:        s.name,
        status:      s.status,
        assignedTo:  s.assignedTo?.id ?? s.assignedTo,
        assignedBy:  s.assignedBy?.id ?? s.assignedBy,
        verifiedBy:  s.verifiedBy?.id ?? s.verifiedBy,
        dueDate:     s.dueDate,
        locked:      s.locked,
        completedAt: s.completedAt,
      }));
      set((state) => ({ pipelines: { ...state.pipelines, [studentId]: steps } }));
    } catch (err) {
      console.error("loadPipeline:", err);
    }
  },

  loadHistory: async (studentId) => {
    try {
      const history = norm(await api.tasks.getHistory(studentId));
      set({ history });
    } catch (err) {
      console.error("loadHistory:", err);
    }
  },

  loadNotifications: async (counselorId) => {
    try {
      const notifs = norm(await api.dashboard.getNotifications(counselorId));
      set({ notifications: notifs });
    } catch (err) {
      console.error("loadNotifications:", err);
    }
  },

  // ── CENTER ACTIONS ───────────────────────────────────────
  addCenter: async (data) => {
    const center = norm(await api.centers.create(data));
    set((s) => ({ centers: [...s.centers, center] }));
  },

  updateCenter: async (centerId, data) => {
    const updated = norm(await api.centers.update(centerId, data));
    set((s) => ({ centers: s.centers.map((c) => (c.id === centerId ? updated : c)) }));
  },

  deleteCenter: async (centerId) => {
    await api.centers.delete(centerId);
    set((s) => ({ centers: s.centers.filter((c) => c.id !== centerId) }));
  },

  // ── STUDENT ACTIONS ──────────────────────────────────────
  addStudent: async (data) => {
    const student = norm(await api.students.create(data));
    await get().loadPipeline(student.id);
    set((s) => ({ students: [student, ...s.students] }));
  },

  reassignStudent: async (studentId, counselorId) => {
    const updated = norm(await api.students.update(studentId, { counselorId }));
    set((s) => ({ students: s.students.map((x) => (x.id === studentId ? updated : x)) }));
  },

  // ── TASK ACTIONS ─────────────────────────────────────────
  reassignStep: async (studentId, stepKey, toCounselorId, byCounselorId) => {
    await api.tasks.reassign({ studentId, stepKey, toCounselorId, byCounselorId });
    await get().loadPipeline(studentId);
    if (byCounselorId) get().loadNotifications(byCounselorId);
  },

  startStep: async (studentId, stepKey) => {
    await api.tasks.start({ studentId, stepKey });
    await get().loadPipeline(studentId);
  },

  completeStep: async (studentId, stepKey, byCounselorId) => {
    await api.tasks.complete({ studentId, stepKey, byCounselorId });
    await get().loadPipeline(studentId);
    const updated = norm(await api.students.getById(studentId));
    set((s) => ({ students: s.students.map((x) => (x.id === studentId ? updated : x)) }));
    const activities = norm(await api.dashboard.getActivities());
    set({ activities });
  },

  updatePipelineTemplate: (steps) => set({ pipelineTemplate: steps }),

  // ── DOCUMENT ACTIONS ─────────────────────────────────────
  addDoc: async (studentId, nameOrFile) => {
    let doc;
    if (typeof nameOrFile === "string") {
      doc = norm(await api.documents.uploadByName(studentId, nameOrFile));
    } else {
      doc = norm(await api.documents.upload(studentId, nameOrFile));
    }
    set((s) => ({ docs: [doc, ...s.docs] }));
    const activities = norm(await api.dashboard.getActivities());
    set({ activities });
  },

  setDocStatus: async (docId, status) => {
    const updated = norm(await api.documents.setStatus(docId, status));
    set((s) => ({ docs: s.docs.map((d) => (d.id === docId ? updated : d)) }));
  },

  // ── COUNSELOR ACTIONS ────────────────────────────────────
  assignCounselorToCenter: async (counselorId, centerId) => {
    const updated = norm(await api.counselors.assignCenter(counselorId, centerId));
    set((s) => ({ counselors: s.counselors.map((c) => (c.id === counselorId ? updated : c)) }));
  },

  // ── NOTIFICATION ACTIONS ─────────────────────────────────
  markNotificationsRead: async (counselorId) => {
    await api.dashboard.markRead(counselorId);
    set((s) => ({
      notifications: s.notifications.map((n) =>
        n.counselorId === counselorId ? { ...n, read: true } : n
      ),
    }));
  },
}));
