import {
  ArrowLeft,
  CheckCircle2,
  CloudSun,
  Crown,
  ExternalLink,
  LoaderCircle,
  RefreshCw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

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
  return (
    <section className="chat-panel billing-panel">
      <header className="topbar">
        <div className="topbar-heading">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setActiveView("chat")}
            aria-label="Back to weather chat"
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
        >
          <RefreshCw
            size={15}
            className={billingLoading ? "animate-spin" : ""}
          />
          Refresh
        </Button>
      </header>

      <div className="billing-content">
        <div className="billing-heading-block">
          <span className="billing-eyebrow">YOUR SUBSCRIPTION</span>
          <h2>Choose the weather experience that fits you.</h2>
          <p>Manage your plan and payment details securely through Stripe.</p>
        </div>

        {billingError && (
          <div className="billing-alert billing-alert-error" role="alert">
            {billingError}
          </div>
        )}
        {billingNotice && (
          <div className="billing-alert billing-alert-success" role="status">
            {billingNotice}
          </div>
        )}

        {billingLoading && !subscription ? (
          <div
            className="billing-grid"
            aria-label="Loading subscription"
            aria-busy="true"
          >
            {["free", "pro"].map((plan) => (
              <article className="plan-card" key={plan}>
                <div className="plan-card-top">
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
                <Skeleton className="mt-7 h-11 w-full rounded-xl" />
              </article>
            ))}
          </div>
        ) : (
          <div className="billing-grid">
            {/* Free plan intentionally remains unchanged. */}
            <article
              className={`plan-card ${!isPro ? "plan-card-current" : ""}`}
            >
              <div className="plan-card-top">
                <div className="plan-icon">
                  <CloudSun size={21} />
                </div>
                {!isPro && (
                  <span className="plan-current-badge">CURRENT PLAN</span>
                )}
              </div>
              <h3>Free</h3>
              <p className="plan-price">
                Rs 0 <span>/ month</span>
              </p>
              <p className="plan-description">
                Get started with your personal AI weather assistant.
              </p>
              <ul className="plan-features">
                <li>
                  <CheckCircle2 size={16} /> Weather questions and forecasts
                </li>
                <li>
                  <CheckCircle2 size={16} /> Saved conversation history
                </li>
                <li>
                  <CheckCircle2 size={16} /> Upgrade whenever you need more
                </li>
              </ul>
              {!isPro && (
                <Button variant="outline" className="plan-button" disabled>
                  Current plan
                </Button>
              )}
            </article>

            {/* Pro plan features updated to match the dashboard plan. */}
            <article
              className={`plan-card plan-card-pro ${isPro ? "plan-card-current" : ""}`}
            >
              <div className="plan-card-top">
                <div className="plan-icon plan-icon-pro">
                  <Crown size={21} />
                </div>
                {isPro ? (
                  <span className="plan-current-badge">YOUR PLAN</span>
                ) : (
                  <span className="plan-popular-badge">PRO</span>
                )}
              </div>
              <h3>BTP Weather Pro</h3>
              <p className="plan-price">
                Rs 499 <span>/ month</span>
              </p>
              <p className="plan-description">
                Your personal weather dashboard with smarter daily insights.
              </p>
              <ul className="plan-features">
                <li>
                  <CheckCircle2 size={16} /> AI weather assistant
                </li>
                <li>
                  <CheckCircle2 size={16} /> Weather cards for your saved cities
                </li>
                <li>
                  <CheckCircle2 size={16} /> 5-day temperature forecast chart
                </li>
                <li>
                  <CheckCircle2 size={16} /> Air quality and PM2.5 information
                </li>
                <li>
                  <CheckCircle2 size={16} /> Daily AI weather insight
                </li>
                <li>
                  <CheckCircle2 size={16} /> Secure subscription management
                  through Stripe
                </li>
              </ul>
              {!isPro ? (
                <Button
                  className="plan-button"
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
                <Button className="plan-button" variant="outline" disabled>
                  {subscription?.cancel_at_period_end
                    ? "Pro access until period end"
                    : "Pro is active"}
                </Button>
              )}
              <p className="plan-secure-note">
                Secure checkout powered by Stripe
              </p>
            </article>
          </div>
        )}

        {billingLoading && subscription && isPro ? (
          <section
            className="subscription-details"
            aria-label="Refreshing billing details"
            aria-busy="true"
          >
            <div className="subscription-details-heading">
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
              <Skeleton className="h-10 w-48 rounded-xl" />
              <Skeleton className="h-10 w-44 rounded-xl" />
            </div>
          </section>
        ) : isPro && subscription ? (
          <section className="subscription-details">
            <div className="subscription-details-heading">
              <div>
                <span className="billing-eyebrow">BILLING DETAILS</span>
                <h3>Your subscription</h3>
              </div>

              <span
                className={`subscription-status ${
                  subscription.cancel_at_period_end
                    ? "status-other"
                    : ["active", "trialing"].includes(
                          subscription.subscription_status,
                        )
                      ? "status-active"
                      : "status-other"
                }`}
              >
                {subscription.cancel_at_period_end
                  ? "Cancellation scheduled"
                  : subscription.subscription_status === "active"
                    ? "Active"
                    : subscription.subscription_status === "trialing"
                      ? "Trial"
                      : subscription.subscription_status === "canceled"
                        ? "Canceled"
                        : subscription.subscription_status ||
                          "Status unavailable"}
              </span>
            </div>
            <div className="subscription-detail-row">
              <span>Plan</span>
              <strong>BTP Weather Pro · Rs 499/month</strong>
            </div>
            <div className="subscription-detail-row">
              <span>
                {subscription.cancel_at_period_end
                  ? "Access ends on"
                  : "Next billing date"}
              </span>
              <strong>{formattedPeriodEnd || "Not available"}</strong>
            </div>
            {subscription.cancel_at_period_end && (
              <div className="billing-alert billing-alert-success">
                Cancellation is scheduled. Your Pro access should remain active
                until the billing period ends.
              </div>
            )}
            <div className="billing-actions">
              <Button
                onClick={openBillingPortal}
                disabled={Boolean(billingAction)}
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

        <p className="billing-footnote">
          Card details are handled by Stripe. BTP Weather does not store your
          full payment card number.
        </p>
      </div>
    </section>
  );
}
