import { usePublicStyleDocument, usePublicStyleEnabled } from "@/components/public-style-scope";
import { publicCopy, PUBLIC_COPY_DEFAULTS, type PublicCopyKey } from "@/lib/public-style-overrides";

/** Result-page button wording: V2 may use event-scoped allowlisted copy; V1 always shows the legacy default. */
export function useResultCopy() {
  const v2 = usePublicStyleEnabled();
  const document = usePublicStyleDocument();
  return (key: PublicCopyKey) => (v2 ? publicCopy(document, key) : PUBLIC_COPY_DEFAULTS[key]);
}
