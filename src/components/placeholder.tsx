import { ReactNode } from "react";

export function PageHeader({ title, description, actions }: { title: ReactNode; description?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-[-0.02em] text-[#111827]">{title}</h1>
        {description && <p className="text-sm leading-6 text-[#64748B]">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-3">{actions}</div>}
    </div>
  );
}

export function PlaceholderCard({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="rounded-[16px] border border-dashed border-[#CBD5E1] bg-[#F8FAFC] p-8 text-center">
      <h3 className="text-base font-semibold text-[#111827]">{title}</h3>
      <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-[#64748B]">
        {children ?? "This area is a placeholder. Functionality will be wired up once the data model is approved."}
      </p>
    </div>
  );
}
