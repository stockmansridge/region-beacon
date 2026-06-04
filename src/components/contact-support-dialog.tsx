import { useEffect, useState } from "react";
import { LifeBuoy, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const CATEGORIES = [
  { value: "account_billing", label: "Account & billing" },
  { value: "event_setup", label: "Event setup" },
  { value: "passport_or_checkin", label: "Passport / check-in" },
  { value: "user_access", label: "User access" },
  { value: "bug", label: "Bug report" },
  { value: "feature_request", label: "Feature request" },
  { value: "other", label: "Other" },
] as const;

const PRIORITIES = [
  { value: "low", label: "Low" },
  { value: "normal", label: "Normal" },
  { value: "high", label: "High" },
  { value: "urgent", label: "Urgent" },
] as const;

const FormSchema = z.object({
  subject: z.string().trim().min(3, "Subject is too short").max(200),
  description: z.string().trim().min(10, "Please add a bit more detail").max(4000),
  category: z.enum([
    "account_billing",
    "event_setup",
    "passport_or_checkin",
    "user_access",
    "bug",
    "feature_request",
    "other",
  ]),
  priority: z.enum(["low", "normal", "high", "urgent"]),
});

type Props = {
  trigger?: React.ReactNode;
  organisationId?: string | null;
  /** Controlled mode. If omitted, the component renders its own trigger. */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
};

export function ContactSupportDialog({
  trigger,
  organisationId,
  open,
  onOpenChange,
}: Props) {
  const [internalOpen, setInternalOpen] = useState(false);
  const isControlled = open !== undefined;
  const isOpen = isControlled ? open : internalOpen;
  const setOpen = (next: boolean) => {
    if (isControlled) onOpenChange?.(next);
    else setInternalOpen(next);
  };

  const [subject, setSubject] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState<(typeof CATEGORIES)[number]["value"]>("other");
  const [priority, setPriority] = useState<(typeof PRIORITIES)[number]["value"]>("normal");
  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!isOpen) {
      setSubject("");
      setDescription("");
      setCategory("other");
      setPriority("normal");
      setErrors({});
      setSubmitting(false);
    }
  }, [isOpen]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrors({});
    const parsed = FormSchema.safeParse({ subject, description, category, priority });
    if (!parsed.success) {
      const next: Record<string, string> = {};
      for (const issue of parsed.error.issues) {
        const key = issue.path[0]?.toString() ?? "_";
        if (!next[key]) next[key] = issue.message;
      }
      setErrors(next);
      return;
    }

    setSubmitting(true);
    const pageUrl =
      typeof window !== "undefined" ? window.location.href.slice(0, 1000) : null;
    const userAgent =
      typeof navigator !== "undefined" ? navigator.userAgent.slice(0, 500) : null;

    const { error } = await supabase.rpc("create_support_ticket", {
      p_subject: parsed.data.subject,
      p_description: parsed.data.description,
      p_category: parsed.data.category,
      p_priority: parsed.data.priority,
      p_organisation_id: organisationId ?? null,
      p_page_url: pageUrl,
      p_user_agent: userAgent,
    });

    setSubmitting(false);

    if (error) {
      toast.error(`Could not send your ticket: ${error.message}`);
      return;
    }

    toast.success("Support ticket submitted. We'll be in touch shortly.");
    setOpen(false);
  };

  return (
    <Dialog open={isOpen} onOpenChange={setOpen}>
      {trigger ? <DialogTrigger asChild>{trigger}</DialogTrigger> : null}
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <LifeBuoy className="h-4 w-4 text-[#2F6FE4]" />
            Contact GetStampd support
          </DialogTitle>
          <DialogDescription>
            Tell us what's going on. We'll capture the page you're on automatically.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-[#0F172A]">Subject</label>
            <Input
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="Short summary"
              maxLength={200}
            />
            {errors.subject && (
              <p className="text-xs text-destructive">{errors.subject}</p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-[#0F172A]">Category</label>
              <Select value={category} onValueChange={(v) => setCategory(v as typeof category)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CATEGORIES.map((c) => (
                    <SelectItem key={c.value} value={c.value}>
                      {c.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-[#0F172A]">Priority</label>
              <Select value={priority} onValueChange={(v) => setPriority(v as typeof priority)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PRIORITIES.map((p) => (
                    <SelectItem key={p.value} value={p.value}>
                      {p.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-medium text-[#0F172A]">Description</label>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What happened? What were you trying to do?"
              rows={6}
              maxLength={4000}
            />
            {errors.description && (
              <p className="text-xs text-destructive">{errors.description}</p>
            )}
          </div>

          <div className="flex items-center justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="inline-flex h-9 items-center justify-center rounded-lg border bg-background px-4 text-sm font-medium hover:bg-muted"
              disabled={submitting}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="inline-flex h-9 items-center justify-center gap-2 rounded-lg bg-[#2F6FE4] px-4 text-sm font-semibold text-white hover:bg-[#1F56C5] disabled:opacity-60"
            >
              {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
              Submit ticket
            </button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
