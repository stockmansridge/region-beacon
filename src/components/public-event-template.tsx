import { EventPublicLanding, type PublicEventData, type PublicVenueData } from "@/components/event-public-landing";
import {
  resolvePublicTemplateVersion,
  type PublicStyleOverrideDocument,
  type PublicTemplateVersion,
} from "@/lib/public-style-overrides";
import type { PublicNavMode } from "@/components/public-nav-context";
import { applyV2Theme, PublicEventBrandingScope } from "@/components/public-event-branding-scope";

export type PublicEventTemplateData = PublicEventData & {
  public_template_version?: string | null;
  v2_style_config?: PublicStyleOverrideDocument | null;
};

export function PublicEventTemplate({
  subdomain,
  event,
  venues,
  mode = "live",
  previewNotice,
  forceTemplate,
}: {
  subdomain: string | null;
  event: PublicEventTemplateData;
  venues: PublicVenueData[];
  mode?: PublicNavMode;
  previewNotice?: React.ReactNode;
  forceTemplate?: PublicTemplateVersion;
}) {
  const template = forceTemplate ?? resolvePublicTemplateVersion(event.public_template_version);
  const renderedEvent = template === "v2" ? applyV2Theme(event) : { ...event, style_overrides: null };
  return (
    <PublicEventBrandingScope event={event} forceV2={template === "v2"}>
      <EventPublicLanding
        subdomain={subdomain}
        event={renderedEvent}
        venues={venues}
        mode={mode}
        previewNotice={previewNotice}
        templateVersion={template}
        brandingScoped
      />
    </PublicEventBrandingScope>
  );
}