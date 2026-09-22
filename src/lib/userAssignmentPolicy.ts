import { UserAssignment } from '../types';

function assignmentKey(assignment: Pick<UserAssignment, 'divisionCode' | 'hierarchyCode'>): string {
  return `${String(assignment.divisionCode || '').trim().toUpperCase()}|${String(assignment.hierarchyCode || '').trim()}`;
}

/**
 * Merge the currently selected hierarchy into the user's persisted assignment list.
 *
 * Saving the form must never replace the only existing assignment just because the
 * Admin selected a second hierarchy in the picker. Existing assignments remain in
 * their original order; an edited assignment with the same key refreshes its
 * metadata in-place; a genuinely new hierarchy is appended.
 */
export function mergeUserAssignments(
  existing: UserAssignment[] | null | undefined,
  draft: UserAssignment,
): UserAssignment[] {
  const merged = new Map<string, UserAssignment>();

  for (const assignment of Array.isArray(existing) ? existing : []) {
    const divisionCode = String(assignment?.divisionCode || '').trim().toUpperCase();
    if (!divisionCode) continue;
    merged.set(assignmentKey({ ...assignment, divisionCode }), { ...assignment, divisionCode });
  }

  const draftDivision = String(draft?.divisionCode || '').trim().toUpperCase();
  if (draftDivision) {
    const normalizedDraft = { ...draft, divisionCode: draftDivision };
    merged.set(assignmentKey(normalizedDraft), normalizedDraft);
  }

  return Array.from(merged.values());
}

export function getPrimaryUserAssignment(
  assignments: UserAssignment[] | null | undefined,
  fallback: UserAssignment,
): UserAssignment {
  return Array.isArray(assignments) && assignments.length > 0 ? assignments[0] : fallback;
}
