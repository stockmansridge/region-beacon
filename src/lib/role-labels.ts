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
