const express = require("express");
const { Resend } = require("resend");

const router = express.Router();

function escapeHtml(value) {
  return value.replace(/[&<>"']/g, (character) => {
    const entities = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    };

    return entities[character];
  });
}

router.post("/", async (req, res) => {
  try {
    const { name, email, subject, message } = req.body || {};

    if (
      typeof name !== "string" ||
      typeof email !== "string" ||
      typeof subject !== "string" ||
      typeof message !== "string"
    ) {
      return res.status(400).json({
        success: false,
        message: "Please complete all contact form fields.",
      });
    }

    const cleanName = name.trim();
    const cleanEmail = email.trim();
    const cleanSubject = subject.trim();
    const cleanMessage = message.trim();

    if (
      !cleanName ||
      cleanName.length > 100 ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail) ||
      cleanEmail.length > 254 ||
      !cleanSubject ||
      cleanSubject.length > 150 ||
      !cleanMessage ||
      cleanMessage.length > 5000
    ) {
      return res.status(400).json({
        success: false,
        message: "Please check your details and try again.",
      });
    }

    if (
      !process.env.RESEND_API_KEY ||
      !process.env.CONTACT_RECEIVER_EMAIL ||
      !process.env.RESEND_FROM_EMAIL
    ) {
      console.error("Contact email environment variables are missing.");

      return res.status(503).json({
        success: false,
        message: "Contact email is not configured yet.",
      });
    }

    const resend = new Resend(process.env.RESEND_API_KEY);

    const safeName = escapeHtml(cleanName);
    const safeEmail = escapeHtml(cleanEmail);
    const safeSubject = escapeHtml(cleanSubject);
    const safeMessage = escapeHtml(cleanMessage);

    const { data, error } = await resend.emails.send({
      from: process.env.RESEND_FROM_EMAIL,
      to: [process.env.CONTACT_RECEIVER_EMAIL],
      replyTo: cleanEmail,
      subject: `BTP Weather Contact: ${cleanSubject}`,
      text: [
        "New Contact Us submission",
        "",
        `Name: ${cleanName}`,
        `Email: ${cleanEmail}`,
        `Subject: ${cleanSubject}`,
        "",
        "Message:",
        cleanMessage,
      ].join("\n"),
      html: `
        <h2>New BTP Weather enquiry</h2>
        <p><strong>Name:</strong> ${safeName}</p>
        <p><strong>Email:</strong> ${safeEmail}</p>
        <p><strong>Subject:</strong> ${safeSubject}</p>
        <p><strong>Message:</strong></p>
        <p>${safeMessage.replace(/\n/g, "<br>")}</p>
      `,
    });

    if (error) {
      console.error("Resend email failed:", error.message);

      return res.status(502).json({
        success: false,
        message: "Unable to send your message right now. Please try again.",
      });
    }

    return res.status(200).json({
      success: true,
      message: "Your message has been sent successfully.",
      id: data?.id,
    });
  } catch (error) {
    console.error("Contact form failed:", error.message);

    return res.status(500).json({
      success: false,
      message: "Something went wrong while sending your message.",
    });
  }
});

module.exports = router;
