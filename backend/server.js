const express = require("express");
const cors = require("cors");
require("dotenv").config();

const authenticateToken = require("./middleware/auth");
const pool = require("./db");
const authRoutes = require("./routes/auth");
const weatherRoutes = require("./routes/weather");
const chatRoutes = require("./routes/chat");
const paymentRoutes = require("./routes/payments");
const stripeWebhookRoutes = require("./routes/stripeWebhook");
const contactRoutes = require("./routes/contact");

const app = express();

// Middleware
app.use(cors());

// Stripe webhook must receive the raw body before JSON parsing.
app.use("/api/payments/webhook", stripeWebhookRoutes);

app.use(express.json());

app.use("/api/auth", authRoutes);
app.use("/api/weather", weatherRoutes);
app.use("/api/chat", chatRoutes);
app.use("/api/payments", paymentRoutes);
app.use("/api/contact", contactRoutes);

// Test route
app.get("/", (req, res) => {
  res.status(200).json({
    success: true,
    message: "Backend server is running successfully!",
  });
});

// Health check route
app.get("/api/health", (req, res) => {
  res.status(200).json({
    success: true,
    status: "healthy",
  });
});

// Server configuration
const PORT = process.env.PORT || 5000;

app.get("/api/db-test", async (req, res) => {
  try {
    const result = await pool.query("SELECT NOW() AS time");

    res.json({
      success: true,
      message: "PostgreSQL connected successfully!",
      databaseTime: result.rows[0].time,
    });
  } catch (error) {
    console.error("Database connection failed:", error.message);

    res.status(500).json({
      success: false,
      message: "Database connection failed",
    });
  }
});

app.get("/api/auth/me", authenticateToken, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT id, name, email, plan, created_at
       FROM users
       WHERE id = $1`,
      [req.user.id],
    );

    if (result.rowCount === 0) {
      return res.status(404).json({
        success: false,
        message: "User not found.",
      });
    }

    res.json({
      success: true,
      user: result.rows[0],
    });
  } catch (error) {
    console.error("Profile lookup failed:", error.message);

    res.status(500).json({
      success: false,
      message: "Unable to fetch profile.",
    });
  }
});

app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});
