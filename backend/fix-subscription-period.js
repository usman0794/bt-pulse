require("dotenv").config();

const stripe = require("./services/stripe");
const pool = require("./db");

const subscriptionId = "sub_1UQUyV2MphjaxTc8dV8AoZ0g";

async function main() {
  try {
    const subscription = await stripe.subscriptions.retrieve(subscriptionId);

    const periodEndTimestamp =
      subscription.current_period_end ??
      subscription.items?.data?.[0]?.current_period_end;

    if (!periodEndTimestamp) {
      throw new Error("Stripe did not return a billing-period end timestamp.");
    }

    const periodEnd = new Date(periodEndTimestamp * 1000);

    const result = await pool.query(
      `UPDATE subscriptions
       SET current_period_end = $1,
           updated_at = NOW()
       WHERE stripe_subscription_id = $2
       RETURNING stripe_subscription_id, status, current_period_end`,
      [periodEnd, subscriptionId],
    );

    if (result.rowCount === 0) {
      throw new Error("No matching subscription row was found in PostgreSQL.");
    }

    console.log("Subscription period repaired:");
    console.log(result.rows[0]);
  } catch (error) {
    console.error("Repair failed:", error.message);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

main();
