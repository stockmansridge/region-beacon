// Default starter text for event-local Terms & Privacy pages.
//
// These strings are intentionally generic, plain-English placeholders. They
// are NOT legal advice. The admin UI must show the caveat:
//   "Default wording is a starting point only. Review with your legal
//    adviser before publishing."
//
// Body fields use double newlines as paragraph breaks and Markdown-style
// "## " headings. The renderer should treat newlines as paragraph breaks
// and `## ` lines as subheadings; no rich HTML is accepted from admins.

export const DEFAULT_TERMS_TITLE = "Event Terms & Conditions";

export const DEFAULT_TERMS_BODY = `## About these terms

These terms apply to your participation in {{EVENT_NAME}} ("the Event") via the GetStampd digital passport. By scanning a venue QR code, registering a visitor passport, or otherwise taking part in the Event, you accept these terms.

## The digital passport

The Event uses a digital passport on GetStampd to track venue visits ("stamps") during the Event period. Each stamp is collected by scanning the official QR code displayed at a participating venue. Stamps are tied to your passport and cannot be transferred.

## Rewards and prize draws

Any rewards, perks, badges or prize draws are specific to {{EVENT_NAME}} and are operated by the event organiser, not by GetStampd. Eligibility, entry thresholds, draw dates and prize details are set by the organiser and may change. Entry into a prize draw does not guarantee a prize, and prizes are only awarded where all stated rules are met.

## Venue participation

Participating venues set their own opening hours, capacity and house rules. The list of venues, their offers, and their availability may change during the Event without notice. The Event organiser is not responsible for individual venue decisions.

## Your responsibilities

You are responsible for behaving lawfully and respectfully at every venue. Drink responsibly, follow venue staff instructions, and do not attempt to manipulate the passport system (for example, by sharing QR codes, scanning on someone else's behalf, or using automated tools).

## Organiser and platform

The Event is organised and operated by the event organiser. GetStampd provides the digital passport technology under licence to the organiser. To the extent permitted by law, GetStampd is not a party to the Event itself and is not liable for venue offerings, prize fulfilment, or on-the-ground event operations.

## Changes

The organiser may update these terms. The most recent version published before you registered applies to your participation. If material changes are made after you register, you will be asked to accept the new version before continuing to use the passport.`;

export const DEFAULT_PRIVACY_TITLE = "Event Privacy Policy";

export const DEFAULT_PRIVACY_BODY = `## What we collect

When you register a passport for {{EVENT_NAME}}, you may be asked to provide your name, email address, mobile number and postcode. The exact fields depend on what the event organiser has chosen to collect. You may also choose to opt in to marketing communications.

## Why we collect it

Your information is used to:

- create and operate your digital passport
- record your participation in the Event (venue check-ins, stamps, rewards eligibility)
- administer any prize draws or rewards offered by the Event
- contact you about your passport or the Event when necessary
- send you marketing communications, only if you have explicitly opted in

## Who can see it

Your information is shared with the Event organiser and their authorised administrators for the sole purpose of running the Event. We do not sell your personal information, and we do not share it with unrelated third parties for their own marketing.

GetStampd, as the platform provider, processes your information on behalf of the organiser.

## Marketing

Marketing opt-in is always optional. If you opt in, you can withdraw your consent at any time by following the unsubscribe instructions in any marketing message, or by contacting the organiser.

## Retention

Your passport and related event data are retained for the duration of the Event and for a reasonable period afterwards to administer rewards, support requests, and statutory record-keeping. After that period the organiser may delete or anonymise the data. Specific retention periods are set by the organiser.

## Your rights

Depending on where you live, you may have rights to access, correct, or request deletion of your personal information. To exercise these rights, or if you have any privacy questions about the Event, please contact the Event organiser using the contact details published on the Event's public page.`;

export const LEGAL_DEFAULT_DISCLAIMER =
  "Default wording is a starting point only. Review with your legal adviser before publishing.";

export const LEGAL_LIMITS = {
  titleMax: 120,
  bodyMax: 20000,
} as const;

/**
 * Helper for the admin UI: substitute simple `{{EVENT_NAME}}` tokens with
 * the live event name when offering the default text. Admin can still edit
 * freely after insertion.
 */
export function applyLegalDefaultTokens(text: string, eventName: string): string {
  return text.replace(/\{\{EVENT_NAME\}\}/g, eventName);
}
