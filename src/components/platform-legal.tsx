import { Link } from "@tanstack/react-router";
import { GetStampdLogo } from "@/components/brand";

const CONTACT_EMAIL = "jonathan@stockmansridge.com.au";
const LAST_UPDATED = "6 June 2026";

function Shell({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b">
        <div className="mx-auto flex h-16 max-w-4xl items-center justify-between px-4">
          <Link to="/" className="flex items-center">
            <GetStampdLogo variant="blue" size="md" />
          </Link>
          <nav className="flex items-center gap-4 text-sm font-medium text-muted-foreground">
            <Link to="/terms" className="hover:text-foreground">Terms</Link>
            <Link to="/privacy" className="hover:text-foreground">Privacy</Link>
            <Link to="/" className="hover:text-foreground">Home</Link>
          </nav>
        </div>
      </header>
      <main className="mx-auto w-full max-w-3xl px-4 py-10">
        <h1 className="text-3xl font-semibold tracking-tight">{title}</h1>
        <p className="mt-2 text-sm text-muted-foreground">Last updated: {LAST_UPDATED}</p>
        <div className="prose prose-slate mt-8 max-w-none text-[15px] leading-relaxed">
          {children}
        </div>
        <div className="mt-12 border-t pt-6 text-sm text-muted-foreground">
          Questions? Contact{" "}
          <a href={`mailto:${CONTACT_EMAIL}`} className="font-medium text-foreground underline">
            {CONTACT_EMAIL}
          </a>
          .
        </div>
      </main>
    </div>
  );
}

function H2({ children }: { children: React.ReactNode }) {
  return <h2 className="mt-8 text-xl font-semibold text-foreground">{children}</h2>;
}
function P({ children }: { children: React.ReactNode }) {
  return <p className="mt-3 text-[15px] leading-relaxed text-foreground/90">{children}</p>;
}

export function PlatformTermsPage() {
  return (
    <Shell title="GetStampd Terms and Conditions">
      <P>
        These Terms and Conditions ("Terms") govern your use of the GetStampd
        platform ("GetStampd", "we", "us"). By creating an account, signing in,
        or otherwise using GetStampd, you accept these Terms.
      </P>

      <H2>1. Acceptance of Terms</H2>
      <P>
        By using GetStampd you confirm that you have read, understood and
        agreed to these Terms and to our{" "}
        <Link to="/privacy" className="underline">Privacy Policy</Link>. If you
        do not agree, do not use the platform.
      </P>

      <H2>2. About GetStampd</H2>
      <P>
        GetStampd is a digital passport platform that lets organisations create
        events, list venues, issue visitor passports, and collect QR-based
        check-ins and rewards. GetStampd provides the technology; the
        organisation running each event is responsible for its own event
        content, offers and prize fulfilment.
      </P>

      <H2>3. Account Registration</H2>
      <P>
        To use the admin features of GetStampd you must create an account with
        accurate details and keep your password secure. You are responsible for
        all activity that occurs under your account. You must be at least 18
        years old (or the age of majority in your jurisdiction) to register an
        organisation account.
      </P>

      <H2>4. Organisation Responsibilities</H2>
      <P>
        If you create or administer an organisation on GetStampd, you are
        responsible for: the accuracy of your event, venue and reward content;
        compliance with applicable laws including consumer, trade-promotion and
        liquor-licensing rules; honouring any offers or prizes you publish; and
        managing the access rights of other admins you invite.
      </P>

      <H2>5. Event, Venue and Passport Content</H2>
      <P>
        You retain ownership of the content you publish to GetStampd. You grant
        us a non-exclusive licence to host, display and process that content
        for the purpose of operating your event. You must not publish content
        that is unlawful, misleading, infringing, or harmful.
      </P>

      <H2>6. QR Codes, Check-ins and Rewards</H2>
      <P>
        GetStampd issues QR codes for venues and rewards. You must not share,
        copy, automate, or otherwise tamper with QR codes or the check-in
        system. Rewards and prize draws are operated by the event organiser;
        eligibility and prize terms are set by that organiser, not by
        GetStampd.
      </P>

      <H2>7. Plans, Billing and Feature Access</H2>
      <P>
        GetStampd offers multiple plan tiers. The features, limits and price of
        your plan are shown in your admin portal. Paid plans renew until
        cancelled. Where a plan is invoiced directly by GetStampd, payment
        terms are set out in the invoice. Failure to pay may result in
        downgrade or suspension of paid features.
      </P>

      <H2>8. Acceptable Use</H2>
      <P>
        You must not: misuse the platform; attempt to gain unauthorised access
        to other accounts or organisations; reverse engineer or scrape the
        service; upload malware; or use GetStampd to send spam or unlawful
        marketing. We may suspend accounts that breach these rules.
      </P>

      <H2>9. Data and Privacy</H2>
      <P>
        Our handling of personal information is described in the{" "}
        <Link to="/privacy" className="underline">Privacy Policy</Link>. As an
        organisation admin you are the controller of visitor data collected via
        your events; GetStampd processes that data on your behalf.
      </P>

      <H2>10. Availability and Changes</H2>
      <P>
        We aim to keep GetStampd available, but we do not guarantee
        uninterrupted service. We may add, change or remove features, and we
        may update these Terms. Material changes will be communicated through
        the admin portal or by email; continued use after a change means you
        accept the updated Terms.
      </P>

      <H2>11. Intellectual Property</H2>
      <P>
        The GetStampd name, logo, software, and platform design are owned by
        GetStampd. Nothing in these Terms transfers ownership of the platform
        to you. You may use the platform only as permitted by these Terms.
      </P>

      <H2>12. Limitation of Liability</H2>
      <P>
        To the maximum extent permitted by law, GetStampd is not liable for any
        indirect, incidental or consequential loss, or for loss of profit,
        revenue, data or goodwill, arising from your use of the platform. Our
        total liability for any claim is limited to the fees you paid to
        GetStampd in the 12 months before the event giving rise to the claim.
        Nothing in these Terms excludes rights that cannot be excluded under
        applicable consumer law.
      </P>

      <H2>13. Termination</H2>
      <P>
        You may close your account at any time by contacting us. We may
        suspend or terminate your access if you breach these Terms or if
        required by law. On termination, your right to use GetStampd ends, but
        clauses that by their nature should survive (including IP, liability
        and data) continue to apply.
      </P>

      <H2>14. Contact</H2>
      <P>
        Questions about these Terms can be sent to{" "}
        <a href={`mailto:${CONTACT_EMAIL}`} className="underline">
          {CONTACT_EMAIL}
        </a>
        .
      </P>
    </Shell>
  );
}

export function PlatformPrivacyPage() {
  return (
    <Shell title="GetStampd Privacy Policy">
      <P>
        This Privacy Policy explains how GetStampd ("we", "us") handles
        personal information when you use the platform as an organisation
        admin, or when you interact with an event that runs on GetStampd as a
        passport holder or visitor.
      </P>

      <H2>1. Information we collect</H2>
      <P>
        We collect: account details (name, email, password hash); organisation
        details you provide; event, venue and passport content you publish;
        passport-holder details collected via event signup (which may include
        name, email, mobile, postcode); check-in and reward activity; and
        technical data such as IP address, device and browser information, and
        log data.
      </P>

      <H2>2. How we use information</H2>
      <P>
        We use information to operate and improve the platform, authenticate
        users, deliver event functionality, administer rewards and prize
        draws, communicate service updates, prevent abuse, and comply with
        legal obligations. Marketing communications are sent only where the
        recipient has opted in or where the law otherwise permits.
      </P>

      <H2>3. Organisation and event data</H2>
      <P>
        Organisation admins control the data within their organisation,
        including event content and visitor registrations. GetStampd processes
        that data on the organisation's behalf to provide the service.
      </P>

      <H2>4. Visitor and passport-holder data</H2>
      <P>
        When a visitor registers a passport for an event, the data is shared
        with the event organiser and with GetStampd as the platform operator.
        It is used to run the event, record check-ins, and administer rewards.
        We do not sell visitor data and we do not share it with unrelated
        third parties for their own marketing.
      </P>

      <H2>5. Cookies and analytics</H2>
      <P>
        GetStampd uses cookies and similar technologies to keep you signed in,
        remember preferences, and understand how the platform is used. Basic
        analytics may be collected to monitor performance and reliability.
      </P>

      <H2>6. Service providers</H2>
      <P>
        We use trusted service providers to host, store and process data on
        our behalf (for example database, email and infrastructure providers).
        These providers are bound by confidentiality and data-protection
        obligations.
      </P>

      <H2>7. Data security</H2>
      <P>
        We use reasonable technical and organisational measures to protect
        personal information against unauthorised access, loss or misuse. No
        online service can be 100% secure, so we cannot guarantee absolute
        security.
      </P>

      <H2>8. Data retention</H2>
      <P>
        We retain account and event data for as long as the account is active
        and for a reasonable period afterwards to support legal, accounting
        and operational requirements. Visitor data is retained according to
        the event organiser's instructions.
      </P>

      <H2>9. Access and correction</H2>
      <P>
        Depending on where you live, you may have rights to access, correct,
        export or request deletion of personal information we hold about you.
        Organisation admins can manage most of their data directly in the
        admin portal. For other requests, contact us using the details below.
      </P>

      <H2>10. Contact</H2>
      <P>
        For privacy questions or requests, contact{" "}
        <a href={`mailto:${CONTACT_EMAIL}`} className="underline">
          {CONTACT_EMAIL}
        </a>
        .
      </P>
    </Shell>
  );
}
