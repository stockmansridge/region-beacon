import { createFileRoute, Link } from "@tanstack/react-router";
import { Mail, Phone, Smartphone, MapPin, ArrowLeft } from "lucide-react";

export const Route = createFileRoute("/contact")({
  head: () => ({
    meta: [
      { title: "Contact — GetStampd" },
      {
        name: "description",
        content: "Contact the GetStampd team for sales, partnerships and general enquiries.",
      },
      { property: "og:title", content: "Contact GetStampd" },
      {
        property: "og:description",
        content: "Talk to the GetStampd team about trails, events and tourism campaigns.",
      },
      { property: "og:url", content: "https://getstampd.com.au/contact" },
    ],
    links: [{ rel: "canonical", href: "https://getstampd.com.au/contact" }],
  }),
  component: ContactPage,
});


const CONTACT = {
  email: "jonathan@stockmansridge.com.au",
  phone: "02 6365 6212",
  mobile: "0419 255 275",
  address: "[Add business address]",
};

function ContactPage() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4">
          <Link to="/" className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-lg bg-hero-gradient" />
            <div className="text-sm font-semibold">GetStampd</div>
          </Link>
          <nav className="flex items-center gap-2">
            <Link
              to="/"
              className="hidden h-9 items-center rounded-md px-3 text-sm font-medium text-muted-foreground hover:text-foreground sm:inline-flex"
            >
              Product
            </Link>
            <Link
              to="/demo"
              className="hidden h-9 items-center rounded-md px-3 text-sm font-medium text-muted-foreground hover:text-foreground sm:inline-flex"
            >
              Demo
            </Link>
            <Link
              to="/contact"
              className="hidden h-9 items-center rounded-md px-3 text-sm font-medium text-foreground sm:inline-flex"
            >
              Contact
            </Link>
            <Link
              to="/support"
              className="hidden h-9 items-center rounded-md px-3 text-sm font-medium text-muted-foreground hover:text-foreground sm:inline-flex"
            >
              Support
            </Link>
            <Link
              to="/admin/login"
              className="inline-flex h-9 items-center rounded-md border bg-background px-3 text-sm font-medium hover:bg-muted"
            >
              Admin login
            </Link>
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 py-16">
        <Link
          to="/"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to home
        </Link>

        <h1 className="mt-6 text-3xl font-semibold tracking-tight sm:text-4xl">
          Contact GetStampd
        </h1>
        <p className="mt-3 max-w-xl text-muted-foreground">
          Whether you are planning a new event, exploring a partnership or need
          platform information, the team is here to help.
        </p>

        <div className="mt-10 grid gap-4 sm:grid-cols-2">
          <div className="rounded-2xl border bg-card p-6">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-accent text-accent-foreground">
              <Mail className="h-5 w-5" />
            </div>
            <h3 className="mt-4 text-base font-semibold">Email</h3>
            <a
              href={`mailto:${CONTACT.email}`}
              className="mt-1 block text-sm text-muted-foreground hover:text-foreground hover:underline"
            >
              {CONTACT.email}
            </a>
          </div>

          <div className="rounded-2xl border bg-card p-6">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-accent text-accent-foreground">
              <Phone className="h-5 w-5" />
            </div>
            <h3 className="mt-4 text-base font-semibold">Phone</h3>
            <p className="mt-1 text-sm text-muted-foreground">{CONTACT.phone}</p>
          </div>

          <div className="rounded-2xl border bg-card p-6">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-accent text-accent-foreground">
              <Smartphone className="h-5 w-5" />
            </div>
            <h3 className="mt-4 text-base font-semibold">Mobile</h3>
            <p className="mt-1 text-sm text-muted-foreground">{CONTACT.mobile}</p>
          </div>

          <div className="rounded-2xl border bg-card p-6">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-accent text-accent-foreground">
              <MapPin className="h-5 w-5" />
            </div>
            <h3 className="mt-4 text-base font-semibold">Address</h3>
            <p className="mt-1 text-sm text-muted-foreground">{CONTACT.address}</p>
          </div>
        </div>

        <div className="mt-10 rounded-2xl border bg-muted/30 p-6 text-center">
          <p className="text-sm text-muted-foreground">
            Existing customer? Visit{" "}
            <Link to="/support" className="font-medium text-primary hover:underline">
              Support
            </Link>{" "}
            for faster help with your event.
          </p>
        </div>
      </main>

      <footer className="border-t">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-3 px-4 py-8 text-xs text-muted-foreground sm:flex-row">
          <div>© {new Date().getFullYear()} GetStampd. All rights reserved.</div>
          <div className="flex gap-4">
            <Link to="/" className="hover:text-foreground">
              Product
            </Link>
            <Link to="/demo" className="hover:text-foreground">
              Demo
            </Link>
            <Link to="/contact" className="hover:text-foreground">
              Contact
            </Link>
            <Link to="/support" className="hover:text-foreground">
              Support
            </Link>
            <Link to="/admin/login" className="hover:text-foreground">
              Admin login
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
