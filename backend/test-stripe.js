require("dotenv").config();

const stripe = require("./services/stripe");

async function testStripe() {
  try {
    const account = await stripe.accounts.retrieve();

    console.log("Stripe connection successful!");
    console.log("Account ID:", account.id);
  } catch (error) {
    console.error("Stripe connection failed:", error.message);
  }
}

testStripe();
