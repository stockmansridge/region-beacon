import { createFileRoute, Link } from "@tanstack/react-router";
import {
  ArrowLeft,
  Mail,
  Phone,
  LogIn,
  KeyRound,
  Settings,
  QrCode,
  CreditCard,
  Users,
} from "lucide-react";

export const Route = createFileRoute("/support")({
  head: () => ({
    meta: [
      { title: "Support — Easy Passport" },
      {
        name: "description",
        content: "Get help with your Easy Passport event. Support for login, event setup, QR codes and billing.",
      },
    ],
  }),
  component: SupportPage,
});

const SUPPORT = {
  email: "jonathan@stockmansridge.com.au",
  phone: "02 6365 6212",
  mobile: "0419 255 275",
};

const topics = [
  {
    icon: LogIn,
    title: "Logging in",
    desc: "Access your event dashboard with your work email and password. Use the Admin login link on this page.",
  },
  {
    icon: KeyRound,
    title: "Resetting your password",
    desc: "On the Admin login page, click ‘Forgot password?’ and follow the reset link sent to your email.",
  },
  {
    icon: Settings,
    title: "Event setup",
    desc: "Create an event, add venues, set branding and preview your customer landing page before going live.",
  },
  {
    icon: QrCode,
    title: "QR code issues",
    desc: "Each venue has a unique QR code. If a scan fails, check the code is printed clearly and lighting is good.",
  },
  {
    icon: CreditCard,
    title: "Billing & account questions",
    desc: "For invoicing, plan changes or account queries, contact us directly via email or phone.",
  },
  {
    icon: Users,
    title: "Visitor & passport questions",
    desc: "Help visitors check in, track progress and understand rewards. No app download is required.",
  },
];

function SupportPage() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4">
          <Link to="/" className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-lg bg-hero-gradient" />
            <div className="text-sm font-semibold">Easy Passport</div>
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
              className="hidden h-9 items-center rounded-md px-3 text-sm font-medium text-muted-foreground hover:text-foreground sm:inline-flex"
            >
              Contact
            </Link>
            <Link
              to="/support"
              className="hidden h-9 items-center rounded-md px-3 text-sm font-medium text-foreground sm:inline-flex"
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

      <main className="mx-auto max-w-4xl px-4 py-16">
        <Link
          to="/"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to home
        </Link>

        <h1 className="mt-6 text-3xl font-semibold tracking-tight sm:text-4xl">
          Contact Support
        </h1>
        <p className="mt-3 max-w-xl text-muted-foreground">
          If you manage an event on Easy Passport and need help, start here.
          For sales or general enquiries, visit{" "}
          <Link to="/contact" className="font-medium text-primary hover:underline">
            Contact Us
          </Link>
          .
        </p>

        <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <div className="rounded-2xl border bg-card p-6">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-accent text-accent-foreground">
              <Mail className="h-5 w-5" />
            </div>
            <h3 className="mt-4 text-base font-semibold">Support email</h3>
            <a
              href={`mailto:${SUPPORT.email}`}
              className="mt-1 block text-sm text-muted-foreground hover:text-foreground hover:underline"
            >
              {SUPPORT.email}
            </a>
          </div>

          <div className="rounded-2xl border bg-card p-6">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-accent text-accent-foreground">
              <Phone className="h-5 w-5" />
            </div>
            <h3 className="mt-4 text-base font-semibold">Phone support</h3>
            <p className="mt-1 text-sm text-muted-foreground">{SUPPORT.phone}</p>
          </div>

          <div className="rounded-2xl border bg-card p-6">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-accent text-accent-foreground">
              <Smartphone className="h-5 w-5" />
            </div>
            <h3 className="mt-4 text-base font-semibold">Mobile</h3>
            <p className="mt-1 text-sm text-muted-foreground">{SUPPORT.mobile}</p>
          </div>
        </div>

        <section className="mt-16">
          <h2 className="text-2xl font-semibold tracking-tight">Common support topics</h2>
          <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {topics.map(({ icon: Icon, title, desc }) => (
              <div key={title} className="rounded-2xl border bg-card p-6">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-accent text-accent-foreground">
                  <Icon className="h-5 w-5" />
                </div>
                <h3 className="mt-4 text-base font-semibold">{title}</h3>
                <p className="mt-1 text-sm text-muted-foreground">{desc}</p>
              </div>
            ))}
          </div>
        </section>

        <div className="mt-10 flex flex-wrap items-center gap-3">
          <Link
            to="/admin/login"
            className="inline-flex h-11 items-center rounded-full bg-primary px-6 text-sm font-semibold text-primary-foreground hover:opacity-90"
          >
            Admin login
          </Link>
          <Link
            to="/contact"
            className="inline-flex h-11 items-center rounded-full border bg-card px-6 text-sm font-semibold hover:bg-muted"
          >
            Contact us
          </Link>
        </div>
      </main>

      <footer className="border-t">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-3 px-4 py-8 text-xs text-muted-foreground sm:flex-row">
          <div>© {new Date().getFullYear()} Easy Passport. All rights reserved.</div>
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
