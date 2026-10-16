const express = require("express");
const pool = require("../db");
const stripe = require("../services/stripe");

const router = express.Router();

// Stripe requires the raw request body for signature verification.
router.post(
  "/",
  express.raw({ type: "application/json" }),
  async (req, res) => {
    const signature = req.headers["stripe-signature"];

    if (!process.env.STRIPE_WEBHOOK_SECRET) {
      console.error("STRIPE_WEBHOOK_SECRET is missing.");
      return res.status(500).send("Webhook is not configured.");
    }

    let event;

    try {
      event = stripe.webhooks.constructEvent(
        req.body,
        signature,
        process.env.STRIPE_WEBHOOK_SECRET,
      );
    } catch (error) {
      console.error(
        "Stripe webhook signature verification failed:",
        error.message,
      );
      return res.status(400).send("Invalid webhook signature.");
    }

    try {
      switch (event.type) {
        case "checkout.session.completed": {
          const session = event.data.object;

          // Only process subscription checkouts.
          if (session.mode === "subscription" && session.subscription) {
            const subscriptionId =
              typeof session.subscription === "string"
                ? session.subscription
                : session.subscription.id;

            const subscription =
              await stripe.subscriptions.retrieve(subscriptionId);

            await syncSubscription(subscription, session.metadata?.userId);
          }
          break;
        }

        case "customer.subscription.created":
        case "customer.subscription.updated":
        case "customer.subscription.deleted": {
          await syncSubscription(event.data.object);
          break;
        }

        default:
          console.log("Unhandled Stripe event:", event.type);
      }

      return res.json({ received: true });
    } catch (error) {
      console.error("Stripe webhook processing failed:", error.message);

      // A non-2xx response allows Stripe to retry the event.
      return res.status(500).send("Webhook processing failed.");
    }
  },
);

async function syncSubscription(subscription, checkoutUserId = null) {
  const customerId =
    typeof subscription.customer === "string"
      ? subscription.customer
      : subscription.customer.id;

  const subscriptionId = subscription.id;
  const priceId = subscription.items?.data?.[0]?.price?.id || null;

  // Prefer subscription metadata, which we set when creating Checkout.
  let userId = subscription.metadata?.userId || checkoutUserId;

  // Fallback for subscriptions already associated with a local user.
  if (!userId) {
    const existing = await pool.query(
      `SELECT user_id
       FROM subscriptions
       WHERE stripe_subscription_id = $1
          OR stripe_customer_id = $2
       ORDER BY created_at DESC
       LIMIT 1`,
      [subscriptionId, customerId],
    );

    userId = existing.rows[0]?.user_id;
  }

  if (!userId) {
    console.warn(
      `Skipping subscription ${subscriptionId}: no matching local user.`,
    );
    return;
  }

  const status = subscription.status;
  const periodEndTimestamp =
    subscription.current_period_end ??
    subscription.items?.data?.[0]?.current_period_end ??
    null;

  const periodEnd = periodEndTimestamp
    ? new Date(periodEndTimestamp * 1000)
    : null;

  console.log("Subscription period-end diagnostic:", {
    subscriptionId,
    topLevelPeriodEnd: subscription.current_period_end ?? null,
    itemPeriodEnd: subscription.items?.data?.[0]?.current_period_end ?? null,
    periodEnd,
  });

  const cancelAtPeriodEnd = Boolean(subscription.cancel_at_period_end);

  await pool.query(
    `INSERT INTO subscriptions (
       user_id,
       stripe_customer_id,
       stripe_subscription_id,
       stripe_price_id,
       status,
       current_period_end,
       cancel_at_period_end,
       updated_at
     )
     VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
     ON CONFLICT (stripe_subscription_id)
DO UPDATE SET
  stripe_customer_id = EXCLUDED.stripe_customer_id,
  stripe_price_id = EXCLUDED.stripe_price_id,
  status = EXCLUDED.status,
  current_period_end = COALESCE(
    EXCLUDED.current_period_end,
    subscriptions.current_period_end
  ),
  cancel_at_period_end = EXCLUDED.cancel_at_period_end,
  updated_at = NOW()`,
    [
      userId,
      customerId,
      subscriptionId,
      priceId,
      status,
      periodEnd,
      cancelAtPeriodEnd,
    ],
  );

  // Grant Pro only for subscriptions currently active or trialing.
  await pool.query(
    `UPDATE users
   SET plan = CASE
     WHEN EXISTS (
       SELECT 1
       FROM subscriptions
       WHERE user_id = $1
         AND status IN ('active', 'trialing')
     )
     THEN 'pro'
     ELSE 'free'
   END
   WHERE id = $1`,
    [userId],
  );

  console.log(
    `Subscription ${subscriptionId} synchronized successfully: ${status}`,
  );
}

module.exports = router;
