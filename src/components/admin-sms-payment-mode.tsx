import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, FlaskConical, Loader2, RefreshCw, ShieldCheck, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

type TestOverview = {
  sms_payment_mode: "live" | "test";
  test_balance_credits: number;
  test_lifetime_purchased_credits: number;
  test_purchase_count: number;
  test_transaction_count: number;
  test_campaign_count: number;
  test_stripe_event_count: number;
  live_balance_credits: number;
};

const num = (n: number) => Number(n ?? 0).toLocaleString("en-AU");

/**
 * Platform-admin-only control for the SMS add-on payment environment.
 * This never affects GetStampd subscription billing — only SMS credit
 * purchases. Authorisation is enforced server-side by the RPCs; this UI is
 * a convenience surface, not the security boundary.
 */
export function SmsPaymentModeSection() {
  const [data, setData] = useState<TestOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const { data: res, error: err } = await supabase.rpc("system_admin_sms_test_overview");
    if (err) {
      setError(
        err.message.includes("does not exist")
          ? "SMS test mode is not installed on this database yet (migration 09)."
          : err.message,
      );
      setData(null);
    } else {
      const r = (res ?? {}) as Record<string, unknown>;
      setData({
        sms_payment_mode: r["sms_payment_mode"] === "test" ? "test" : "live",
        test_balance_credits: Number(r["test_balance_credits"] ?? 0),
        test_lifetime_purchased_credits: Number(r["test_lifetime_purchased_credits"] ?? 0),
        test_purchase_count: Number(r["test_purchase_count"] ?? 0),
        test_transaction_count: Number(r["test_transaction_count"] ?? 0),
        test_campaign_count: Number(r["test_campaign_count"] ?? 0),
        test_stripe_event_count: Number(r["test_stripe_event_count"] ?? 0),
        live_balance_credits: Number(r["live_balance_credits"] ?? 0),
      });
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const setMode = async (mode: "live" | "test") => {
    if (data?.sms_payment_mode === mode) return;
    setSaving(true);
    const { error: err } = await supabase.rpc("system_admin_sms_set_payment_mode", { _mode: mode });
    setSaving(false);
    if (err) {
      toast.error(`Could not change SMS payment mode: ${err.message}`);
      return;
    }
    toast.success(
      mode === "test"
        ? "SMS payments switched to Test / Sandbox. Customers still get live checkout."
        : "SMS payments switched back to Live.",
    );
    await load();
  };

  const resetTestData = async () => {
    setResetting(true);
    const { data: res, error: err } = await supabase.rpc("system_admin_sms_reset_test_data");
    setResetting(false);
    setConfirmReset(false);
    if (err) {
      toast.error(`Reset failed: ${err.message}`);
      return;
    }
    const r = (res ?? {}) as Record<string, unknown>;
    toast.success(
      `Test SMS data cleared — ${num(Number(r["removed_transactions"] ?? 0))} ledger entries removed. Live data untouched.`,
    );
    await load();
  };

  const isTest = data?.sms_payment_mode === "test";

  return (
    <div className="space-y-5">
      <div className="rounded-[14px] bg-white p-5 ring-1 ring-[#E6ECF4]">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-[#111827]">SMS payment mode</h2>
            <p className="mt-1 max-w-2xl text-sm leading-6 text-[#64748B]">
              Controls which Stripe environment is used for prepaid SMS credit purchases only.
              GetStampd subscription billing is never affected. Test checkout is available to
              platform admins only — customers always get live checkout.
            </p>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => void load()}
            disabled={loading}
            className="gap-2 rounded-[10px]"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} /> Refresh
          </Button>
        </div>

        {error && (
          <p className="mt-4 rounded-[10px] bg-[#FEF2F2] px-4 py-3 text-sm text-[#B91C1C]">
            {error}
          </p>
        )}

        {loading && !data ? (
          <p className="mt-4 flex items-center gap-2 text-sm text-[#64748B]">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading…
          </p>
        ) : data ? (
          <>
            <div className="mt-4 inline-flex rounded-[12px] bg-[#F1F5F9] p-1">
              <button
                type="button"
                onClick={() => void setMode("live")}
                disabled={saving}
                className={`flex items-center gap-2 rounded-[9px] px-4 py-2 text-sm font-semibold transition ${
                  !isTest ? "bg-white text-[#1F56C5] shadow-sm" : "text-[#64748B]"
                }`}
              >
                <ShieldCheck className="h-4 w-4" /> Live
              </button>
              <button
                type="button"
                onClick={() => void setMode("test")}
                disabled={saving}
                className={`flex items-center gap-2 rounded-[9px] px-4 py-2 text-sm font-semibold transition ${
                  isTest ? "bg-white text-[#B45309] shadow-sm" : "text-[#64748B]"
                }`}
              >
                <FlaskConical className="h-4 w-4" /> Test / Sandbox
              </button>
            </div>

            {isTest && (
              <div className="mt-4 rounded-[12px] border-2 border-[#F59E0B] bg-[#FFFBEB] px-4 py-3">
                <div className="flex items-start gap-3">
                  <AlertTriangle className="mt-0.5 h-5 w-5 text-[#B45309]" />
                  <div className="text-sm leading-6 text-[#92400E]">
                    <span className="font-bold uppercase tracking-wide">
                      SMS test mode is active
                    </span>
                    <p className="mt-1">
                      Platform admins buying SMS credits will be sent to Stripe Sandbox. Credits are
                      recorded in a separate TEST balance and can never be spent on live sends.
                      Requires the <code>STRIPE_TEST_SECRET_KEY</code> and{" "}
                      <code>STRIPE_TEST_WEBHOOK_SECRET</code> secrets, plus a Sandbox webhook
                      endpoint subscribed to <code>checkout.session.completed</code> and{" "}
                      <code>payment_intent.succeeded</code>.
                    </p>
                  </div>
                </div>
              </div>
            )}

            <dl className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {[
                { label: "Test balance", value: `${num(data.test_balance_credits)} credits` },
                {
                  label: "Test credits purchased",
                  value: num(data.test_lifetime_purchased_credits),
                },
                { label: "Test purchases", value: num(data.test_purchase_count) },
                { label: "Test Stripe events", value: num(data.test_stripe_event_count) },
                { label: "Test ledger entries", value: num(data.test_transaction_count) },
                { label: "Test campaigns", value: num(data.test_campaign_count) },
                {
                  label: "Live balance (all orgs)",
                  value: `${num(data.live_balance_credits)} credits`,
                },
              ].map((item) => (
                <div key={item.label} className="rounded-[12px] bg-[#F8FAFC] px-4 py-3">
                  <dt className="text-xs font-medium uppercase tracking-wide text-[#64748B]">
                    {item.label}
                  </dt>
                  <dd className="mt-1 text-lg font-bold text-[#111827]">{item.value}</dd>
                </div>
              ))}
            </dl>
          </>
        ) : null}
      </div>

      {data && (
        <div className="rounded-[14px] bg-white p-5 ring-1 ring-[#E6ECF4]">
          <h3 className="text-base font-semibold text-[#111827]">Reset test SMS data</h3>
          <p className="mt-1 max-w-2xl text-sm leading-6 text-[#64748B]">
            Clears test credit balances, test ledger entries, test campaigns and test Stripe event
            records. Live balances, live ledger history and live campaigns are not touched.
          </p>
          <Button
            type="button"
            variant="outline"
            onClick={() => setConfirmReset(true)}
            disabled={resetting}
            className="mt-4 gap-2 rounded-[10px] border-[#FCA5A5] text-[#B91C1C] hover:bg-[#FEF2F2]"
          >
            {resetting ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Trash2 className="h-4 w-4" />
            )}
            Reset test SMS data
          </Button>
        </div>
      )}

      <AlertDialog open={confirmReset} onOpenChange={setConfirmReset}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Reset all test SMS data?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently deletes test SMS credit balances, test ledger entries, test campaigns
              and test Stripe event records for every organisation. Live SMS credits and live
              history are not affected.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                void resetTestData();
              }}
            >
              Reset test data
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
