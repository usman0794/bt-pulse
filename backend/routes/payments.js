const express = require("express");
const pool = require("../db");
const stripe = require("../services/stripe");
const authenticateToken = require("../middleware/auth");

const router = express.Router();

const FRONTEND_URL = process.env.FRONTEND_URL || "http://localhost:5173";

// POST /api/payments/checkout
// Create a Stripe Checkout Session for the authenticated user.
router.post("/checkout", authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;

    if (!process.env.STRIPE_PRO_PRICE_ID) {
      return res.status(503).json({
        success: false,
        message:
          "Stripe Pro pricing is not configured yet. Add STRIPE_PRO_PRICE_ID after creating your plan.",
      });
    }

    // Load the authenticated user's details from PostgreSQL.
    const userResult = await pool.query(
      `SELECT id, name, email
       FROM users
       WHERE id = $1`,
      [userId],
    );

    if (userResult.rowCount === 0) {
      return res.status(404).json({
        success: false,
        message: "User not found.",
      });
    }

    const user = userResult.rows[0];

    // Reuse an existing Stripe customer when available.
    const customerResult = await pool.query(
      `SELECT stripe_customer_id
       FROM subscriptions
       WHERE user_id = $1
         AND stripe_customer_id IS NOT NULL
       ORDER BY created_at DESC
       LIMIT 1`,
      [userId],
    );

    let customerId = customerResult.rows[0]?.stripe_customer_id;

    if (customerId) {
      // Verify the stored customer still exists in Stripe.
      try {
        const customer = await stripe.customers.retrieve(customerId);

        if (customer.deleted) {
          customerId = null;
        }
      } catch (error) {
        if (error.code === "resource_missing") {
          customerId = null;
        } else {
          throw error;
        }
      }
    }

    if (!customerId) {
      const customer = await stripe.customers.create({
        name: user.name,
        email: user.email,
        metadata: {
          userId: String(user.id),
          app: "BTP Weather",
        },
      });

      customerId = customer.id;
    }

    // Create a hosted subscription checkout.
    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer: customerId,
      line_items: [
        {
          price: process.env.STRIPE_PRO_PRICE_ID,
          quantity: 1,
        },
      ],
      success_url: `${FRONTEND_URL}/?payment=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${FRONTEND_URL}/?payment=cancelled`,
      client_reference_id: String(user.id),
      metadata: {
        userId: String(user.id),
      },
      subscription_data: {
        metadata: {
          userId: String(user.id),
        },
      },
    });

    return res.json({
      success: true,
      checkoutUrl: session.url,
    });
  } catch (error) {
    console.error("Stripe checkout creation failed:", error.message);

    return res.status(500).json({
      success: false,
      message: "Unable to start checkout. Please try again.",
    });
  }
});

/* GET /api/payments/subscription
   Get the authenticated user's plan and latest subscription. */
router.get("/subscription", authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;

    const result = await pool.query(
      `SELECT
         u.plan,
         s.status AS subscription_status,
         s.current_period_end,
         s.cancel_at_period_end
       FROM users u
       LEFT JOIN LATERAL (
         SELECT status, current_period_end, cancel_at_period_end
         FROM subscriptions
         WHERE user_id = u.id
         ORDER BY created_at DESC
         LIMIT 1
       ) s ON TRUE
       WHERE u.id = $1`,
      [userId],
    );

    if (result.rowCount === 0) {
      return res.status(404).json({
        success: false,
        message: "User not found.",
      });
    }

    return res.json({
      success: true,
      subscription: result.rows[0],
    });
  } catch (error) {
    console.error("Subscription status lookup failed:", error.message);
    return res.status(500).json({
      success: false,
      message: "Unable to retrieve subscription status.",
    });
  }
});

/* POST /api/payments/cancel
   Schedule cancellation at the end of the current billing period. */
router.post("/cancel", authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;

    const result = await pool.query(
      `SELECT stripe_subscription_id
       FROM subscriptions
       WHERE user_id = $1
         AND status IN ('active', 'trialing')
         AND stripe_subscription_id IS NOT NULL
         AND cancel_at_period_end = FALSE
       ORDER BY created_at DESC
       LIMIT 1`,
      [userId],
    );

    if (result.rowCount === 0) {
      return res.status(404).json({
        success: false,
        message: "No cancellable subscription was found.",
      });
    }

    const subscriptionId = result.rows[0].stripe_subscription_id;

    const subscription = await stripe.subscriptions.update(subscriptionId, {
      cancel_at_period_end: true,
    });

    // The webhook remains responsible for synchronizing PostgreSQL.
    return res.json({
      success: true,
      message: "Cancellation scheduled for the end of the billing period.",
      cancelAtPeriodEnd: subscription.cancel_at_period_end,
      status: subscription.status,
    });
  } catch (error) {
    console.error("Subscription cancellation failed:", error.message);
    return res.status(500).json({
      success: false,
      message: "Unable to cancel subscription. Please try again.",
    });
  }
});

/* POST /api/payments/portal
   Create a Stripe Billing Portal session. */
router.post("/portal", authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;

    const result = await pool.query(
      `SELECT stripe_customer_id
       FROM subscriptions
       WHERE user_id = $1
         AND stripe_customer_id IS NOT NULL
       ORDER BY created_at DESC
       LIMIT 1`,
      [userId],
    );

    if (result.rowCount === 0) {
      return res.status(404).json({
        success: false,
        message: "No Stripe customer was found for this user.",
      });
    }

    const session = await stripe.billingPortal.sessions.create({
      customer: result.rows[0].stripe_customer_id,
      return_url: `${FRONTEND_URL}/`,
    });

    return res.json({
      success: true,
      portalUrl: session.url,
    });
  } catch (error) {
    console.error("Billing portal creation failed:", error.message);
    return res.status(500).json({
      success: false,
      message:
        "Unable to open billing management. Check your Stripe Billing Portal configuration.",
    });
  }
});

module.exports = router;
