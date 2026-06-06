/**
 * Map internal role identifiers (agency_owner, platform_admin, …) to
 * user-friendly labels for display. Database identifiers are unchanged.
 */
export function formatRoleLabel(role: string | null | undefined): string {
  if (!role) return "—";
  switch (role) {
    case "agency_owner":
      return "Organisation owner";
    case "agency_admin":
      return "Organisation admin";
    case "agency_staff":
      return "Organisation staff";
    case "agency_member":
      return "Organisation member";
    case "platform_admin":
      return "Platform admin";
    default:
      return role;
  }
}

/**
 * Short, user-friendly "member type" label for the System Admin tables.
 * Combines the role + invite status: a pending invite trumps the role
 * label so admins can see at a glance who hasn't accepted yet.
 */
export function formatMemberType(
  row: {
    role?: string | null;
    scope?: string | null;
    accepted_at?: string | null;
  } | null | undefined,
): string {
  if (!row) return "Unknown";
  const role = row.role ?? null;
  const scope = row.scope ?? null;
  const accepted = row.accepted_at ?? null;
  if (scope === "organisation" && !accepted) return "Pending Invite";
  switch (role) {
    case "platform_admin":
      return "Platform Admin";
    case "agency_owner":
      return "Owner";
    case "agency_admin":
      return "Admin";
    case "agency_staff":
      return "Staff";
    case "agency_member":
      return "Member";
    default:
      return role ? role : "Unknown";
  }
}

