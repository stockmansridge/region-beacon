import { Link } from "@tanstack/react-router";
import { ReactNode } from "react";

export function VisitorShell({ children, eventName = "Regional Passport" }: { children: ReactNode; eventName?: string }) {
  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-40 border-b bg-background/80 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-md items-center justify-between px-4">
          <Link to="/" className="flex items-center gap-2">
            <div className="h-7 w-7 rounded-lg bg-hero-gradient" />
            <span className="text-sm font-semibold">{eventName}</span>
          </Link>
          <Link to="/passport" className="text-xs font-medium text-muted-foreground hover:text-foreground">
            My passport
          </Link>
        </div>
      </header>
      <main className="mx-auto max-w-md px-4 pb-24 pt-6">{children}</main>
    </div>
  );
}
