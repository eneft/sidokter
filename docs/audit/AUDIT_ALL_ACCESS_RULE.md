# Baseline — ALL Access vs Numbering Hierarchy

## Rule
- `ALL — Semua Bidang` is an access scope, not a document numbering hierarchy.
- A user assigned `ALL` can access documents across all divisions/hierarchies.
- `ALL` must never be used as the division/hierarchy code when issuing an SPO number.
- When an `ALL` user creates or issues an SPO, the workflow must require a concrete target hierarchy.
- The selected target hierarchy determines the SPO numbering code.
- Admin retains global ALL implicitly and follows the same target-hierarchy rule for numbering.
- Structural badge remains a separate elevated access rule and does not replace the ALL hierarchy assignment.

## UI
- User Management > `Pilih Hirarki Lengkap` includes `ALL — Semua Bidang (Akses Global)`.
- Selecting ALL disables lower hierarchy selectors because there is no specific branch to select for the access assignment.
- SPO workflow for an ALL user shows a global-access state and asks for the target hierarchy before numbering/submission.
