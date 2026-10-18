import { useEffect, useState } from "react";
import {
  ArrowLeft,
  CheckCircle2,
  CloudSun,
  Crown,
  ExternalLink,
  Info,
  LoaderCircle,
  Lock,
  RefreshCw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

/* ------------------------------------------------------------------ */
/* Design tokens (Tailwind arbitrary values, same palette as dashboard) */
/* teal-700 #0B4F57 · teal-600 #0E6670 · teal-100 #D9F0EE · teal-50 #EEF8F7 */
/* ink-900 #0F1B2D · ink-600 #4B5A6B · ink-400 #8A97A6 · line #E3E8EE      */
/* ------------------------------------------------------------------ */
const primaryBtn =
  "w-full rounded-full bg-[#0B4F57] px-6 text-white shadow-none hover:bg-[#0E6670] focus-visible:ring-2 focus-visible:ring-[#0B4F57] focus-visible:ring-offset-2 disabled:opacity-60";
const outlineBtn =
  "rounded-full border border-[#0B4F57] bg-transparent text-[#0B4F57] shadow-none hover:bg-[#EEF8F7] hover:text-[#0B4F57] focus-visible:ring-2 focus-visible:ring-[#0B4F57] focus-visible:ring-offset-2";
const card =
  "rounded-2xl border border-[#E3E8EE] bg-white shadow-[0_1px_3px_rgba(15,27,45,0.06)]";

function FeatureItem({ children }) {
  return (
    <li className="flex items-start gap-3 text-sm leading-6 text-[#4B5A6B]">
      <CheckCircle2
        size={18}
        className="mt-0.5 shrink-0 text-[#0B4F57]"
        aria-hidden="true"
      />
      <span>{children}</span>
    </li>
  );
}

export default function BillingPage({
  isPro,
  setActiveView,
  loadSubscription,
  billingLoading,
  billingError,
  billingNotice,
  subscription,
  formattedPeriodEnd,
  openCheckout,
  billingAction,
  openBillingPortal,
  scheduleCancellation,
}) {
  const [showSubscribedToast, setShowSubscribedToast] = useState(false);

  useEffect(() => {
    if (isPro && billingNotice) {
      setShowSubscribedToast(true);
      const timeoutId = window.setTimeout(() => {
        setShowSubscribedToast(false);
      }, 5000);

      return () => window.clearTimeout(timeoutId);
    }

    setShowSubscribedToast(false);
    return undefined;
  }, [isPro, billingNotice]);

  /* Presentation-only helpers (no change to business logic). */
  const isActiveStatus =
    !subscription?.cancel_at_period_end &&
    ["active", "trialing"].includes(subscription?.subscription_status);

  const statusLabel = subscription?.cancel_at_period_end
    ? "Cancellation scheduled"
    : subscription?.subscription_status === "active"
      ? "Active"
      : subscription?.subscription_status === "trialing"
        ? "Trial"
        : subscription?.subscription_status === "canceled"
          ? "Canceled"
          : subscription?.subscription_status || "Status unavailable";

  return (
    <section className="chat-panel billing-panel">
      <header className="topbar">
        <div className="topbar-heading">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setActiveView("chat")}
            aria-label="Back to weather chat"
            className="rounded-full text-[#4B5A6B] hover:bg-[#EEF8F7] hover:text-[#0B4F57]"
          >
            <ArrowLeft size={19} />
          </Button>
          <div>
            <h1>Plan & billing</h1>
            <p>Manage your BTP Weather subscription</p>
          </div>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={loadSubscription}
          disabled={billingLoading}
          className={outlineBtn}
        >
          <RefreshCw
            size={15}
            className={billingLoading ? "animate-spin" : ""}
          />
          Refresh
        </Button>
      </header>

      {showSubscribedToast && (
        <div
          className="fixed right-4 top-4 z-50 flex w-[calc(100%-2rem)] max-w-sm items-start gap-3 rounded-2xl border border-[#CDEBDD] bg-white p-4 shadow-[0_12px_32px_rgba(15,27,45,0.14)]"
          role="status"
          aria-live="polite"
        >
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#E6F6EF] text-[#1F9D6B]">
            <CheckCircle2 size={22} />
          </div>
          <div className="min-w-0 flex-1">
            <p className="font-semibold text-[#0F1B2D]">
              Subscription activated
            </p>
            <p className="mt-1 text-sm leading-5 text-[#4B5A6B]">
              You're subscribed to BTP Weather Pro. Your premium features are
              ready.
            </p>
          </div>
          <button
            type="button"
            className="rounded-md px-2 py-1 text-sm text-[#8A97A6] transition hover:bg-[#F7FAFC] hover:text-[#0F1B2D] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#0B4F57]"
            onClick={() => setShowSubscribedToast(false)}
            aria-label="Dismiss subscription notification"
          >
            ×
          </button>
        </div>
      )}

      <div className="billing-content mx-auto w-full max-w-5xl px-4 py-8 sm:px-8 sm:py-10">
        {/* Page intro */}
        <div className="mb-8 max-w-2xl">
          <span className="text-sm font-semibold text-[#0B5C8E]">
            Your subscription
          </span>
          <h2 className="mt-2 text-3xl font-bold tracking-tight text-[#0F1B2D] sm:text-4xl">
            Choose the weather experience that fits you.
          </h2>
          <p className="mt-3 text-base leading-7 text-[#4B5A6B]">
            View your plan, premium benefits, and billing details.
          </p>
        </div>

        {billingError && (
          <div
            className="mb-6 flex items-start gap-3 rounded-xl border border-[#F3C9C9] bg-[#FDECEC] px-4 py-3 text-sm text-[#8F2A2A]"
            role="alert"
          >
            <Info size={18} className="mt-0.5 shrink-0" aria-hidden="true" />
            <span>{billingError}</span>
          </div>
        )}

        {billingLoading && !subscription ? (
          <div
            className="grid gap-6 md:grid-cols-2"
            aria-label="Loading subscription"
            aria-busy="true"
          >
            {["free", "pro"].map((plan) => (
              <article className={`${card} p-7`} key={plan}>
                <div className="flex items-center justify-between">
                  <Skeleton className="h-11 w-11 rounded-xl" />
                  <Skeleton className="h-5 w-24 rounded-full" />
                </div>
                <Skeleton className="mt-5 h-7 w-32" />
                <Skeleton className="mt-3 h-9 w-40" />
                <Skeleton className="mt-4 h-4 w-full" />
                <Skeleton className="mt-2 h-4 w-4/5" />
                <div className="mt-6 space-y-3">
                  <Skeleton className="h-4 w-full" />
                  <Skeleton className="h-4 w-11/12" />
                  <Skeleton className="h-4 w-4/5" />
                </div>
                <Skeleton className="mt-7 h-11 w-full rounded-full" />
              </article>
            ))}
          </div>
        ) : (
          <div className="grid items-stretch gap-6 md:grid-cols-2">
            {/* Free plan */}
            <article
              className={`${card} flex flex-col p-7 ${
                !isPro ? "border-[#0B4F57] ring-1 ring-[#0B4F57]" : ""
              }`}
            >
              <div className="flex items-center justify-between">
                <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#EEF8F7] text-[#0B4F57]">
                  <CloudSun size={21} />
                </div>
                {!isPro && (
                  <span className="rounded-full bg-[#D9F0EE] px-3 py-1 text-xs font-semibold text-[#0B4F57]">
                    Current plan
                  </span>
                )}
              </div>
              <h3 className="mt-5 text-xl font-semibold text-[#0F1B2D]">
                Free
              </h3>
              <p className="mt-2 flex items-baseline gap-1 text-4xl font-bold tracking-tight text-[#0F1B2D]">
                Rs 0
                <span className="text-sm font-medium text-[#8A97A6]">
                  / month
                </span>
              </p>
              <p className="mt-3 text-sm leading-6 text-[#4B5A6B]">
                Get started with your personal AI weather assistant.
              </p>
              <hr className="my-6 border-[#E3E8EE]" />
              <ul className="flex-1 space-y-3">
                <FeatureItem>Weather questions and forecasts</FeatureItem>
                <FeatureItem>Saved conversation history</FeatureItem>
                <FeatureItem>Upgrade whenever you need more</FeatureItem>
              </ul>
              {!isPro && (
                <Button
                  variant="outline"
                  className={`mt-8 w-full ${outlineBtn} disabled:opacity-60`}
                  disabled
                >
                  Current plan
                </Button>
              )}
            </article>

            {/* Pro plan */}
            <article
              className={`${card} relative flex flex-col border-2 border-[#0B4F57] p-7 shadow-[0_8px_24px_rgba(11,79,87,0.10)]`}
            >
              <div className="flex items-center justify-between">
                <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#0B4F57] text-white">
                  <Crown size={21} />
                </div>
                {isPro ? (
                  <span className="rounded-full bg-[#D9F0EE] px-3 py-1 text-xs font-semibold text-[#0B4F57]">
                    Your plan
                  </span>
                ) : (
                  <span className="rounded-full bg-[#A8FF00] px-3 py-1 text-xs font-bold text-[#063B40]">
                    PRO
                  </span>
                )}
              </div>
              <h3 className="mt-5 text-xl font-semibold text-[#0F1B2D]">
                BTP Weather Pro
              </h3>
              <p className="mt-2 flex items-baseline gap-1 text-4xl font-bold tracking-tight text-[#0F1B2D]">
                Rs 499
                <span className="text-sm font-medium text-[#8A97A6]">
                  / month
                </span>
              </p>
              <p className="mt-3 text-sm leading-6 text-[#4B5A6B]">
                Your personal weather dashboard with smarter daily insights.
              </p>
              <hr className="my-6 border-[#E3E8EE]" />
              <ul className="flex-1 space-y-3">
                <FeatureItem>AI weather assistant</FeatureItem>
                <FeatureItem>Weather cards for your saved cities</FeatureItem>
                <FeatureItem>5-day temperature forecast chart</FeatureItem>
                <FeatureItem>Air quality and PM2.5 information</FeatureItem>
                <FeatureItem>Daily AI weather insight</FeatureItem>
              </ul>
              {!isPro ? (
                <Button
                  className={`mt-8 h-11 ${primaryBtn}`}
                  onClick={openCheckout}
                  disabled={Boolean(billingAction)}
                >
                  {billingAction === "checkout" ? (
                    <LoaderCircle size={16} className="animate-spin" />
                  ) : (
                    <Crown size={16} />
                  )}
                  Upgrade to Pro
                </Button>
              ) : (
                <Button
                  className={`mt-8 h-11 w-full ${outlineBtn} disabled:opacity-60`}
                  variant="outline"
                  disabled
                >
                  {subscription?.cancel_at_period_end
                    ? "Pro access until period end"
                    : "Pro is active"}
                </Button>
              )}
              <p className="mt-3 flex items-center justify-center gap-1.5 text-xs text-[#8A97A6]">
                <Lock size={12} aria-hidden="true" />
                Secure checkout powered by Stripe
              </p>
            </article>
          </div>
        )}

        {/* Billing details */}
        {billingLoading && subscription && isPro ? (
          <section
            className={`${card} mt-8 p-7`}
            aria-label="Refreshing billing details"
            aria-busy="true"
          >
            <div className="flex items-start justify-between gap-4">
              <div className="space-y-2">
                <Skeleton className="h-3 w-28" />
                <Skeleton className="h-6 w-44" />
              </div>
              <Skeleton className="h-6 w-28 rounded-full" />
            </div>
            <div className="mt-5 space-y-4">
              <div className="flex items-center justify-between gap-4">
                <Skeleton className="h-4 w-16" />
                <Skeleton className="h-4 w-40" />
              </div>
              <div className="flex items-center justify-between gap-4">
                <Skeleton className="h-4 w-28" />
                <Skeleton className="h-4 w-32" />
              </div>
            </div>
            <div className="mt-6 flex flex-wrap gap-3">
              <Skeleton className="h-10 w-48 rounded-full" />
              <Skeleton className="h-10 w-44 rounded-full" />
            </div>
          </section>
        ) : isPro && subscription ? (
          <section className={`${card} mt-8 p-7`}>
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <span className="text-sm font-semibold text-[#0B5C8E]">
                  Billing details
                </span>
                <h3 className="mt-1 text-xl font-semibold text-[#0F1B2D]">
                  Your subscription
                </h3>
              </div>

              <span
                className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-semibold ${
                  isActiveStatus
                    ? "bg-[#E6F6EF] text-[#177A54]"
                    : "bg-[#FDF3DC] text-[#8A5A00]"
                }`}
              >
                <span
                  className={`h-1.5 w-1.5 rounded-full ${
                    isActiveStatus ? "bg-[#1F9D6B]" : "bg-[#E8A317]"
                  }`}
                  aria-hidden="true"
                />
                {statusLabel}
              </span>
            </div>

            <dl className="mt-6 divide-y divide-[#E3E8EE] border-y border-[#E3E8EE]">
              <div className="flex flex-wrap items-center justify-between gap-2 py-4">
                <dt className="text-sm text-[#4B5A6B]">Plan</dt>
                <dd className="text-sm font-semibold text-[#0F1B2D]">
                  BTP Weather Pro · Rs 499/month
                </dd>
              </div>
              <div className="flex flex-wrap items-center justify-between gap-2 py-4">
                <dt className="text-sm text-[#4B5A6B]">
                  {subscription.cancel_at_period_end
                    ? "Access ends on"
                    : "Next billing date"}
                </dt>
                <dd className="text-sm font-semibold text-[#0F1B2D]">
                  {formattedPeriodEnd || "Not available"}
                </dd>
              </div>
            </dl>

            {subscription.cancel_at_period_end && (
              <div
                className="mt-5 flex items-start gap-3 rounded-xl border border-[#F3E2B3] bg-[#FDF3DC] px-4 py-3 text-sm text-[#6B4700]"
                role="status"
              >
                <Info
                  size={18}
                  className="mt-0.5 shrink-0"
                  aria-hidden="true"
                />
                <span>
                  Cancellation is scheduled. Your Pro access should remain
                  active until the billing period ends.
                </span>
              </div>
            )}

            <div className="mt-6 flex flex-wrap gap-3">
              <Button
                onClick={openBillingPortal}
                disabled={Boolean(billingAction)}
                className={`${primaryBtn} w-auto`}
              >
                {billingAction === "portal" ? (
                  <LoaderCircle size={16} className="animate-spin" />
                ) : (
                  <ExternalLink size={16} />
                )}
                Manage payment method
              </Button>
              {!subscription.cancel_at_period_end &&
                ["active", "trialing"].includes(
                  subscription.subscription_status,
                ) && (
                  <Button
                    variant="outline"
                    onClick={scheduleCancellation}
                    disabled={Boolean(billingAction)}
                    className={`${outlineBtn} disabled:opacity-60`}
                  >
                    {billingAction === "cancel" ? (
                      <LoaderCircle size={16} className="animate-spin" />
                    ) : null}
                    Cancel at period end
                  </Button>
                )}
            </div>
          </section>
        ) : null}

        <p className="mt-8 flex items-start justify-center gap-2 text-center text-xs leading-5 text-[#8A97A6]">
          <Lock size={12} className="mt-1 shrink-0" aria-hidden="true" />
          <span>
            Card details are handled by Stripe. BTP Weather does not store your
            full payment card number.
          </span>
        </p>
      </div>
    </section>
  );
}
