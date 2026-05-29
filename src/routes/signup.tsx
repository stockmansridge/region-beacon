import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, Construction } from "lucide-react";

export const Route = createFileRoute("/signup")({
  head: () => ({
    meta: [
      { title: "Sign up — GetStampd" },
      {
        name: "description",
        content: "Self-service signup for GetStampd is coming soon.",
      },
    ],
  }),
  component: SignupPage,
});

function SignupPage() {
  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
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
              className="hidden h-9 items-center rounded-md px-3 text-sm font-medium text-muted-foreground hover:text-foreground sm:inline-flex"
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

      <main className="flex flex-1 items-center justify-center px-4 py-16">
        <div className="max-w-md text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-accent text-accent-foreground">
            <Construction className="h-6 w-6" />
          </div>
          <h1 className="mt-6 text-2xl font-semibold tracking-tight">
            Self-service signup is coming soon
          </h1>
          <p className="mt-3 text-muted-foreground">
            We are building a streamlined signup experience so you can create your event
            passport in minutes. In the meantime, existing customers can sign in through the
            admin portal.
          </p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <Link
              to="/admin/login"
              className="inline-flex h-11 items-center rounded-full bg-primary px-6 text-sm font-semibold text-primary-foreground hover:opacity-90"
            >
              Sign in
            </Link>
            <Link
              to="/contact"
              className="inline-flex h-11 items-center rounded-full border bg-card px-6 text-sm font-semibold hover:bg-muted"
            >
              Contact us
            </Link>
          </div>
          <Link
            to="/"
            className="mt-6 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to home
          </Link>
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
