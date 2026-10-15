const express = require("express");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const pool = require("../db");
const { OAuth2Client } = require("google-auth-library");

const router = express.Router();

function createToken(user) {
  return jwt.sign({ sub: user.id, email: user.email }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || "1d",
  });
}

// POST /api/auth/signup
router.post("/signup", async (req, res) => {
  try {
    const { name, email, password } = req.body;

    if (
      typeof name !== "string" ||
      typeof email !== "string" ||
      typeof password !== "string"
    ) {
      return res.status(400).json({
        success: false,
        message: "Name, email, and password are required.",
      });
    }

    const cleanName = name.trim();
    const cleanEmail = email.trim().toLowerCase();

    if (!cleanName || cleanName.length > 100) {
      return res.status(400).json({
        success: false,
        message: "Name must be between 1 and 100 characters.",
      });
    }

    if (
      cleanEmail.length > 255 ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)
    ) {
      return res.status(400).json({
        success: false,
        message: "Please provide a valid email address.",
      });
    }

    // bcrypt supports a maximum password length of 72 UTF-8 bytes.
    if (
      Buffer.byteLength(password, "utf8") < 8 ||
      Buffer.byteLength(password, "utf8") > 72
    ) {
      return res.status(400).json({
        success: false,
        message: "Password must be 8–72 bytes long.",
      });
    }

    const existing = await pool.query("SELECT id FROM users WHERE email = $1", [
      cleanEmail,
    ]);

    if (existing.rowCount > 0) {
      return res.status(409).json({
        success: false,
        message: "An account with this email already exists.",
      });
    }

    const passwordHash = await bcrypt.hash(password, 12);

    const result = await pool.query(
      `INSERT INTO users (name, email, password_hash)
       VALUES ($1, $2, $3)
       RETURNING id, name, email, plan, created_at`,
      [cleanName, cleanEmail, passwordHash],
    );

    const user = result.rows[0];

    return res.status(201).json({
      success: true,
      message: "Account created successfully.",
      token: createToken(user),
      user,
    });
  } catch (error) {
    if (error.code === "23505") {
      return res.status(409).json({
        success: false,
        message: "An account with this email already exists.",
      });
    }

    console.error("Signup error:", error.message);

    return res.status(500).json({
      success: false,
      message: "Unable to create account.",
    });
  }
});

// POST /api/auth/login
router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    if (
      typeof email !== "string" ||
      typeof password !== "string" ||
      !email.trim() ||
      !password
    ) {
      return res.status(400).json({
        success: false,
        message: "Email and password are required.",
      });
    }

    const cleanEmail = email.trim().toLowerCase();

    const result = await pool.query(
      `SELECT id, name, email, password_hash, plan, created_at
       FROM users
       WHERE email = $1`,
      [cleanEmail],
    );

    const user = result.rows[0];

    if (!user || !(await bcrypt.compare(password, user.password_hash))) {
      return res.status(401).json({
        success: false,
        message: "Invalid email or password.",
      });
    }

    const { password_hash, ...safeUser } = user;

    return res.json({
      success: true,
      message: "Login successful.",
      token: createToken(user),
      user: safeUser,
    });
  } catch (error) {
    console.error("Login error:", error.message);

    return res.status(500).json({
      success: false,
      message: "Unable to log in.",
    });
  }
});

const googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

// POST /api/auth/google
router.post("/google", async (req, res) => {
  try {
    const { credential } = req.body;

    if (typeof credential !== "string" || !credential) {
      return res.status(400).json({
        success: false,
        message: "Google credential is required.",
      });
    }

    if (!process.env.GOOGLE_CLIENT_ID) {
      console.error("GOOGLE_CLIENT_ID is missing.");
      return res.status(500).json({
        success: false,
        message: "Google login is not configured.",
      });
    }

    const ticket = await googleClient.verifyIdToken({
      idToken: credential,
      audience: process.env.GOOGLE_CLIENT_ID,
    });

    const payload = ticket.getPayload();

    if (
      !payload ||
      !payload.sub ||
      !payload.email ||
      payload.email_verified !== true
    ) {
      return res.status(401).json({
        success: false,
        message: "Google account verification failed.",
      });
    }

    const email = payload.email.trim().toLowerCase();
    const name = (payload.name || email.split("@")[0]).trim().slice(0, 100);

    let result = await pool.query(
      `SELECT id, name, email, plan, created_at
       FROM users
       WHERE email = $1`,
      [email],
    );

    let user = result.rows[0];

    if (!user) {
      result = await pool.query(
        `INSERT INTO users (name, email, password_hash)
         VALUES ($1, $2, NULL)
         ON CONFLICT (email) DO NOTHING
         RETURNING id, name, email, plan, created_at`,
        [name, email],
      );

      user = result.rows[0];

      // Another request may have created the account concurrently.
      if (!user) {
        result = await pool.query(
          `SELECT id, name, email, plan, created_at
           FROM users
           WHERE email = $1`,
          [email],
        );
        user = result.rows[0];
      }
    }

    if (!user) {
      throw new Error("Unable to find or create the Google user.");
    }

    return res.json({
      success: true,
      message: "Google login successful.",
      token: createToken(user),
      user,
    });
  } catch (error) {
    console.error("Google login error:", error.message);

    return res.status(401).json({
      success: false,
      message: "Unable to sign in with Google.",
    });
  }
});

module.exports = router;
