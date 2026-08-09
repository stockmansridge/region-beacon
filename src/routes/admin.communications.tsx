import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { MessageSquare, Loader2, RefreshCw, Wallet, Lock, ShieldCheck, FlaskConical } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/placeholder";
import { supabase } from "@/integrations/supabase/client";
import { useAgencyContext } from "@/hooks/use-agency-context";
import { createSmsCreditCheckout } from "@/lib/sms-credits.functions";

export const Route = createFileRoute("/admin/communications")({
  head: () => ({
    meta: [
      { title: "Communications — SMS credits | GetStampd" },
      {
        name: "description",
        content:
          "Buy prepaid SMS credits, track your balance and review every SMS credit transaction for your organisation.",
      },
      { property: "og:title", content: "Communications — SMS credits | GetStampd" },
      {
        property: "og:description",
        content: "Prepaid SMS credits, balance and transaction history for your GetStampd organisation.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Communications,
});

type PackRow = {
  id: string;
  code: string;
  name: string;
  credits: number;
  price_cents: number;
  currency: string | null;
  badge: string | null;
  sort_order: number | null;
};

type LedgerRow = {
  id: string;
  payment_environment: string | null;
  transaction_type: string;
  credits: number;
  balance_after: number;
  amount_paid_cents: number | null;
  currency: string | null;
  description: string | null;
  created_at: string;
};

type Summary = {
  balance_credits: number;
  lifetime_purchased_credits: number;
  lifetime_used_credits: number;
  can_purchase: boolean;
  /** Environment this caller is actually transacting in (server-decided). */
  active_payment_environment: "live" | "test";
  is_platform_admin: boolean;
  live_balance_credits: number;
};

const money = (cents: number, currency = "AUD") =>
  new Intl.NumberFormat("en-AU", { style: "currency", currency, maximumFractionDigits: 0 }).format(
    cents / 100,
  );
const num = (n: number) => new Intl.NumberFormat("en-AU").format(n);

const TX_LABEL: Record<string, string> = {
  purchase: "Credit purchase",
  send: "Campaign send",
  refund: "Refund",
  adjustment: "Manual adjustment",
  failed_send_recredit: "Re-credit (failed sends)",
};

function Communications() {
  const agency = useAgencyContext();
  const agencyId = agency.selected?.id ?? null;

  const [summary, setSummary] = useState<Summary | null>(null);
  const [packs, setPacks] = useState<PackRow[]>([]);
  const [ledger, setLedger] = useState<LedgerRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [buyingPackId, setBuyingPackId] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!agencyId) return;
    setLoading(true);
    setError(null);
    try {
      const [summaryRes, packsRes, ledgerRes] = await Promise.all([
        supabase.rpc("sms_account_summary", { _agency_id: agencyId }),
        supabase
          .from("sms_credit_packs")
          .select("id, code, name, credits, price_cents, currency, badge, sort_order")
          .eq("active", true)
          .order("sort_order", { ascending: true }),
        supabase
          .from("sms_credit_transactions")
          .select(
            "id, payment_environment, transaction_type, credits, balance_after, amount_paid_cents, currency, description, created_at",
          )
          .eq("agency_id", agencyId)
          .order("created_at", { ascending: false })
          .limit(25),
      ]);

      if (summaryRes.error) throw new Error(summaryRes.error.message);
      if (packsRes.error) throw new Error(packsRes.error.message);
      if (ledgerRes.error) throw new Error(ledgerRes.error.message);

      const s = (summaryRes.data ?? {}) as Record<string, unknown>;
      const live = (s.live ?? {}) as Record<string, unknown>;
      setSummary({
        balance_credits: Number(s.balance_credits ?? 0),
        lifetime_purchased_credits: Number(s.lifetime_purchased_credits ?? 0),
        lifetime_used_credits: Number(s.lifetime_used_credits ?? 0),
        can_purchase: Boolean(s.can_purchase),
        active_payment_environment:
          s.active_payment_environment === "test" ? "test" : "live",
        is_platform_admin: Boolean(s.is_platform_admin),
        live_balance_credits: Number(live.balance_credits ?? s.balance_credits ?? 0),
      });
      setPacks((packsRes.data ?? []) as PackRow[]);
      setLedger((ledgerRes.data ?? []) as LedgerRow[]);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [agencyId]);

  useEffect(() => {
    void load();
  }, [load]);

  // Returning from Stripe: credits are applied by the webhook, so refetch.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const outcome = params.get("checkout");
    if (!outcome) return;
    if (outcome === "success") {
      toast.success("Payment received. Your SMS credits activate automatically — refreshing your balance.");
      const timers = [1500, 4000, 8000].map((ms) => window.setTimeout(() => void load(), ms));
      window.history.replaceState({}, "", window.location.pathname);
      return () => timers.forEach((t) => window.clearTimeout(t));
    }
    if (outcome === "cancelled") {
      toast.info("Checkout cancelled — no payment was taken and your balance is unchanged.");
      window.history.replaceState({}, "", window.location.pathname);
    }
  }, [load]);

  // Refresh on tab focus so webhook-applied credits appear without a reload.
  useEffect(() => {
    const onFocus = () => void load();
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [load]);

  const handleBuy = useCallback(
    async (pack: PackRow) => {
      if (!agencyId) return;
      setBuyingPackId(pack.id);
      try {
        const { data: sessionData } = await supabase.auth.getSession();
        const token = sessionData.session?.access_token;
        if (!token) {
          toast.error("Your session expired. Please sign in again.");
          return;
        }
        const result = await createSmsCreditCheckout({
          data: {
            access_token: token,
            agency_id: agencyId,
            pack_id: pack.id,
            origin: window.location.origin,
            return_path: "/admin/communications",
          },
        });
        if (!result.ok) {
          toast.error(result.error);
          return;
        }
        window.location.assign(result.url);
      } catch (err) {
        toast.error(
          `Could not open Stripe Checkout: ${err instanceof Error ? err.message : String(err)}`,
        );
      } finally {
        setBuyingPackId(null);
      }
    },
    [agencyId],
  );

  const isTestMode = summary?.active_payment_environment === "test";
  const visibleLedger = useMemo(
    () =>
      ledger.filter(
        (row) => (row.payment_environment ?? "live") === (isTestMode ? "test" : "live"),
      ),
    [ledger, isTestMode],
  );
  const balance = summary?.balance_credits ?? 0;
  const canPurchase = summary?.can_purchase ?? false;
  const hasCredits = balance > 0;

  const perCredit = useMemo(
    () =>
      new Map(
        packs.map((p) => [p.id, p.credits > 0 ? p.price_cents / p.credits / 100 : 0] as const),
      ),
    [packs],
  );

  return (
    <div className="space-y-8">
      <PageHeader
        title="Communications"
        description="Prepaid SMS for your events. Buy credits, then send targeted messages to participants who have opted in to SMS."
        actions={
          <button
            type="button"
            onClick={() => void load()}
            className="inline-flex items-center gap-2 rounded-[10px] border border-[#D9E2EF] bg-white px-3 py-2 text-sm font-medium text-[#111827] hover:bg-[#F8FAFC]"
          >
            <RefreshCw className="h-4 w-4 text-[#64748B]" /> Refresh
          </button>
        }
      />

      {error && (
        <div className="rounded-[12px] border border-[#FECACA] bg-[#FEF2F2] px-4 py-3 text-sm text-[#991B1B]">
          {error}
        </div>
      )}

      {isTestMode && (
        <div className="rounded-[14px] border-2 border-[#F59E0B] bg-[#FFFBEB] px-5 py-4">
          <div className="flex items-start gap-3">
            <FlaskConical className="mt-0.5 h-5 w-5 text-[#B45309]" />
            <div>
              <div className="text-sm font-bold uppercase tracking-wide text-[#92400E]">
                SMS test mode
              </div>
              <p className="mt-1 text-sm leading-6 text-[#92400E]">
                Purchases and SMS credits on this page are for testing only. No real payment or SMS
                delivery will occur. Stripe Sandbox is used, and TEST credits are held in a separate
                balance that can never be spent on live sends.
              </p>
              <p className="mt-1 text-xs text-[#B45309]">
                Your live SMS credit balance is {num(summary?.live_balance_credits ?? 0)} and is
                unaffected while test mode is on.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Balance */}
      <section className="rounded-[16px] border border-[#E6ECF4] bg-white p-6 shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
        <div className="flex flex-wrap items-start justify-between gap-6">
          <div>
            <div className="flex items-center gap-2 text-sm font-medium text-[#64748B]">
              <Wallet className="h-4 w-4 text-[#2F6FE4]" />
              {isTestMode ? "TEST SMS credit balance" : "SMS credit balance"}
              {isTestMode && (
                <span className="rounded-full bg-[#FEF3C7] px-2 py-0.5 text-[11px] font-bold uppercase text-[#92400E]">
                  Test
                </span>
              )}
            </div>
            <div className="mt-2 text-4xl font-semibold tracking-[-0.02em] text-[#111827]">
              {loading && !summary ? "—" : num(balance)}
            </div>
            <p className="mt-1 text-sm text-[#64748B]">
              1 credit = 1 SMS segment (160 GSM-7 characters, or 70 for Unicode).
            </p>
          </div>
          <dl className="grid grid-cols-2 gap-6 text-sm">
            <div>
              <dt className="text-[#64748B]">Lifetime purchased</dt>
              <dd className="mt-1 text-lg font-semibold text-[#111827]">
                {num(summary?.lifetime_purchased_credits ?? 0)}
              </dd>
            </div>
            <div>
              <dt className="text-[#64748B]">Lifetime used</dt>
              <dd className="mt-1 text-lg font-semibold text-[#111827]">
                {num(summary?.lifetime_used_credits ?? 0)}
              </dd>
            </div>
          </dl>
        </div>
      </section>

      {/* Packs */}
      <section className="space-y-4">
        <div>
          <h2 className="text-lg font-semibold tracking-[-0.01em] text-[#111827]">SMS credit packs</h2>
          <p className="mt-1 text-sm text-[#64748B]">
            Prepaid, one-off purchases in AUD. Credits never expire and are shared across every event in
            your organisation. Payment is handled by Stripe — credits are added automatically as soon as
            the payment clears.
          </p>
        </div>

        {loading && packs.length === 0 ? (
          <div className="flex items-center gap-2 text-sm text-[#64748B]">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading packs…
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {packs.map((pack) => {
              const currency = pack.currency ?? "AUD";
              const unit = perCredit.get(pack.id) ?? 0;
              const busy = buyingPackId === pack.id;
              return (
                <div
                  key={pack.id}
                  className="flex flex-col rounded-[16px] border border-[#E6ECF4] bg-white p-5 shadow-[0_1px_2px_rgba(15,23,42,0.04)]"
                >
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="text-base font-semibold text-[#111827]">
                      {isTestMode ? pack.name.replace("SMS Credits", "Test SMS Credits") : pack.name}
                    </h3>
                    {pack.badge && (
                      <span className="rounded-full bg-[#EFF6FF] px-2.5 py-1 text-xs font-medium text-[#2F6FE4]">
                        {pack.badge}
                      </span>
                    )}
                  </div>
                  <div className="mt-3 text-3xl font-semibold tracking-[-0.02em] text-[#111827]">
                    {money(pack.price_cents, currency)}
                  </div>
                  {isTestMode && (
                    <p className="mt-0.5 text-xs font-bold uppercase tracking-wide text-[#B45309]">
                      Test payment — Stripe Sandbox
                    </p>
                  )}
                  <p className="mt-1 text-sm text-[#64748B]">
                    {num(pack.credits)} {isTestMode ? "test credits" : "credits"} · $
                    {unit.toFixed(3)} per SMS
                  </p>
                  <button
                    type="button"
                    disabled={!canPurchase || busy || !agencyId}
                    onClick={() => void handleBuy(pack)}
                    className="mt-5 inline-flex items-center justify-center gap-2 rounded-[10px] bg-[#2F6FE4] px-4 py-2.5 text-sm font-semibold text-white shadow-[0_6px_16px_rgba(47,111,228,0.28)] transition-colors hover:bg-[#255BC4] disabled:cursor-not-allowed disabled:bg-[#CBD5E1] disabled:shadow-none"
                  >
                    {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                    {busy
                      ? "Opening Stripe…"
                      : isTestMode
                        ? "Buy test credits"
                        : "Buy credits"}
                  </button>
                </div>
              );
            })}
          </div>
        )}

        {!canPurchase && !loading && (
          <p className="text-sm text-[#64748B]">
            Only organisation owners and admins can buy SMS credits. Ask an owner to top up the balance.
          </p>
        )}
      </section>

      {/* Payment wall / campaign composer gate */}
      <section className="rounded-[16px] border border-[#E6ECF4] bg-white p-6 shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
        <div className="flex items-start gap-3">
          <div className="mt-0.5 rounded-[10px] bg-[#F1F5F9] p-2">
            {hasCredits ? (
              <MessageSquare className="h-5 w-5 text-[#2F6FE4]" />
            ) : (
              <Lock className="h-5 w-5 text-[#64748B]" />
            )}
          </div>
          <div className="space-y-2">
            <h2 className="text-lg font-semibold tracking-[-0.01em] text-[#111827]">SMS campaigns</h2>
            {hasCredits ? (
              <p className="text-sm leading-6 text-[#64748B]">
                Your balance is ready. Campaign sending is intentionally switched off until the
                purchase → payment → automatic credit activation flow has been verified end to end with
                a live Stripe payment. Once that test passes, the composer (audience selection, message
                preview and segment/credit estimate) unlocks here.
              </p>
            ) : (
              <p className="text-sm leading-6 text-[#64748B]">
                You need SMS credits before you can create a campaign. Buy a pack above — credits are
                added automatically once Stripe confirms your payment. No manual approval, no waiting on
                us.
              </p>
            )}
            <div className="flex items-center gap-2 rounded-[10px] bg-[#F8FAFC] px-3 py-2 text-xs text-[#64748B]">
              <ShieldCheck className="h-4 w-4 text-[#16A34A]" />
              Only participants who explicitly opted in to SMS are ever included, and STOP replies opt
              them out immediately.
            </div>
          </div>
        </div>
      </section>

      {/* Ledger */}
      <section className="space-y-4">
        <div>
          <h2 className="text-lg font-semibold tracking-[-0.01em] text-[#111827]">Credit history</h2>
          <p className="mt-1 text-sm text-[#64748B]">
            Every credit movement is recorded permanently and cannot be edited or deleted.
          </p>
        </div>
        <div className="overflow-hidden rounded-[16px] border border-[#E6ECF4] bg-white">
          {visibleLedger.length === 0 ? (
            <div className="px-5 py-8 text-center text-sm text-[#64748B]">
              {loading ? "Loading…" : "No SMS credit transactions yet."}
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-[#F8FAFC] text-left text-xs uppercase tracking-wide text-[#64748B]">
                <tr>
                  <th className="px-5 py-3 font-medium">Date</th>
                  <th className="px-5 py-3 font-medium">Type</th>
                  <th className="px-5 py-3 font-medium">Detail</th>
                  <th className="px-5 py-3 text-right font-medium">Credits</th>
                  <th className="px-5 py-3 text-right font-medium">Balance</th>
                  <th className="px-5 py-3 text-right font-medium">Paid</th>
                </tr>
              </thead>
              <tbody>
                {visibleLedger.map((row) => (
                  <tr key={row.id} className="border-t border-[#E6ECF4]">
                    <td className="px-5 py-3 text-[#64748B]">
                      {new Date(row.created_at).toLocaleString("en-AU", {
                        day: "2-digit",
                        month: "short",
                        year: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </td>
                    <td className="px-5 py-3 text-[#111827]">
                      <span className="inline-flex items-center gap-2">
                        {(row.payment_environment ?? "live") === "test" && (
                          <span className="rounded-full bg-[#FEF3C7] px-2 py-0.5 text-[11px] font-bold uppercase text-[#92400E]">
                            Test
                          </span>
                        )}
                        {TX_LABEL[row.transaction_type] ?? row.transaction_type}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-[#64748B]">{row.description ?? "—"}</td>
                    <td
                      className={`px-5 py-3 text-right font-medium ${
                        row.credits >= 0 ? "text-[#15803D]" : "text-[#B91C1C]"
                      }`}
                    >
                      {row.credits >= 0 ? "+" : ""}
                      {num(row.credits)}
                    </td>
                    <td className="px-5 py-3 text-right text-[#111827]">{num(row.balance_after)}</td>
                    <td className="px-5 py-3 text-right text-[#64748B]">
                      {row.amount_paid_cents != null
                        ? money(row.amount_paid_cents, row.currency ?? "AUD")
                        : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </section>
    </div>
  );
}
