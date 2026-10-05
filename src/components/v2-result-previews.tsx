/**
 * Editor-only result screen previews. Renders the SAME presentation views the public
 * controllers render, with clearly labelled sample outcomes. Never mounts the
 * claim/redeem/camera/storage controllers, so preview has zero side effects.
 */
import { CheckinView, type Outcome as CheckinOutcome } from "@/routes/checkin.$qrToken";
import { BonusView, type Outcome as BonusOutcome } from "@/routes/collect.bonus.$token";
import { TastingView, type Outcome as TastingOutcome } from "@/routes/tasting.$qrToken";
import { ScannerView } from "@/routes/scan";
import { ResultPreviewProvider } from "@/components/result-preview";
import { PublicEventBrandingScope, type PublicBrandingEvent } from "@/components/public-event-branding-scope";

export type ResultPreviewPage = "scan" | "checkin" | "bonus" | "tasting";

export const RESULT_PAGE_STATES: Record<ResultPreviewPage, Array<[string, string]>> = {
  scan: [["ready", "Camera ready (placeholder)"], ["permission", "Camera blocked"], ["invalid", "Wrong QR code"], ["no_passport", "No passport yet"]],
  checkin: [["stamped", "Stamp collected"], ["repeat", "Already stamped"], ["qr_invalid", "Invalid code"], ["no_passport", "No passport"], ["event_not_live", "Event not live"]],
  bonus: [["claimed", "Bonus collected"], ["already", "Already collected"], ["no_passport", "No passport"], ["inactive", "Code inactive"]],
  tasting: [["claimed", "Tasting collected"], ["already", "Already collected"], ["no_passport", "No passport"], ["unavailable", "Unavailable"]],
};

const SAMPLE = "Sample (editor only)";
const diag = { stage: "preview", rpc: null, current_event_id: null, saved_passport_event_ids: [], saved_passport_count: 0, localStorage_key_attempted: null, passport_attempted: false, return_to_stored: false, error: null };
const claim = (name: string) => ({ success: true, already_collected: false, event_id: null, bonus_code_id: null, bonus_code_name: name, tasting_qr_id: null, tasting_qr_label: name, venue_id: null, venue_name: SAMPLE, points_awarded: 5, total_points: 35, venue_points: 30, bonus_points: 5, message: null });

function checkinOutcome(state: string, venueName: string | null): CheckinOutcome {
  if (state === "stamped" || state === "repeat") return { kind: "stamped", venueName: venueName ?? SAMPLE, passportToken: "preview", isNew: state === "stamped", pointsAwarded: state === "stamped" ? 10 : 0, pointsAlreadyAwarded: state === "repeat", totalPoints: 30 };
  if (state === "no_passport") return { kind: "no_passport_for_event", diag, subdomain: null, otherPassports: [] };
  return { kind: state as "qr_invalid" | "event_not_live", diag };
}
function bonusOutcome(state: string): BonusOutcome {
  if (state === "claimed" || state === "already") return { kind: state, row: { ...claim(SAMPLE), already_collected: state === "already" } as never, passportToken: "preview" };
  if (state === "no_passport") return { kind: "no_passport", subdomain: null };
  return { kind: "inactive", message: "This bonus code is not active (sample)." };
}
function tastingOutcome(state: string): TastingOutcome {
  if (state === "claimed" || state === "already") return { kind: state, row: { ...claim(SAMPLE), already_collected: state === "already" } as never, passportToken: "preview" };
  if (state === "no_passport") return { kind: "no_passport", subdomain: null };
  return { kind: "unavailable", message: "This tasting is not available right now (sample)." };
}

const noop = () => {};

export function V2ResultPreview({ page, state, event, venueName }: { page: ResultPreviewPage; state: string; event: Record<string, unknown>; venueName: string | null }) {
  return (
    <PublicEventBrandingScope event={event as PublicBrandingEvent}>
      <ResultPreviewProvider>
        {page === "checkin" && <CheckinView outcome={checkinOutcome(state, venueName)} qrToken="preview" />}
        {page === "bonus" && <BonusView outcome={bonusOutcome(state)} />}
        {page === "tasting" && <TastingView outcome={tastingOutcome(state)} />}
        {page === "scan" && (
          <ScannerView
            subdomain={null}
            event={event}
            eventId={(event.event_id as string | undefined) ?? (event.id as string | undefined) ?? null}
            hasPassport={state !== "no_passport"}
            err={state === "permission" ? { kind: "permission", message: "" } : state === "invalid" ? { kind: "invalid", message: "That QR code is not a GetStampd venue check-in code." } : { kind: "none" }}
            manual=""
            onManualChange={noop}
            onManualGo={noop}
            copied={false}
            onCopySupport={noop}
            camera={<div className="flex aspect-square w-full items-center justify-center rounded-2xl border border-dashed border-[var(--event-border,#E6DCC7)] text-xs text-[var(--event-muted,#7A6F5C)]">Camera preview placeholder — the camera never starts in the editor</div>}
          />
        )}
      </ResultPreviewProvider>
    </PublicEventBrandingScope>
  );
}
