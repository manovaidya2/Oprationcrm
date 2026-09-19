// Inactive universities must not appear as options when adding / updating students.
// `keepId` keeps a student's already-assigned university visible in edit forms even if it was
// deactivated later (so the select doesn't go blank).
export function activeUniversities(list, keepId) {
  return (Array.isArray(list) ? list : []).filter(
    u => u && (u.isActive !== false || (keepId && String(u._id) === String(keepId)))
  );
}
