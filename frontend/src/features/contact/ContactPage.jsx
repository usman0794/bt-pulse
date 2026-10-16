import { ArrowLeft, LoaderCircle, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

export default function ContactPage({
  setActiveView,
  contactForm,
  setContactForm,
  contactLoading,
  contactError,
  contactSuccess,
  handleContactSubmit,
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
            <h1>Contact Us</h1>
            <p>We're here to help with BTP Weather.</p>
          </div>
        </div>
      </header>

      <div className="billing-content">
        <div className="billing-heading-block">
          <span className="billing-eyebrow">GET IN TOUCH</span>
          <h2>How can we help you?</h2>
          <p>
            Send us your question or feedback. Our team will receive your
            message by email.
          </p>
        </div>

        <form className="contact-form" onSubmit={handleContactSubmit}>
          <label>
            Your name
            <Input
              value={contactForm.name}
              onChange={(event) =>
                setContactForm({ ...contactForm, name: event.target.value })
              }
              placeholder="Enter your name"
              maxLength={100}
              required
            />
          </label>

          <label>
            Email address
            <Input
              type="email"
              value={contactForm.email}
              onChange={(event) =>
                setContactForm({
                  ...contactForm,
                  email: event.target.value,
                })
              }
              placeholder="you@example.com"
              maxLength={254}
              required
            />
          </label>

          <label>
            Subject
            <Input
              value={contactForm.subject}
              onChange={(event) =>
                setContactForm({
                  ...contactForm,
                  subject: event.target.value,
                })
              }
              placeholder="What do you need help with?"
              maxLength={150}
              required
            />
          </label>

          <label>
            Message
            <Textarea
              value={contactForm.message}
              onChange={(event) =>
                setContactForm({
                  ...contactForm,
                  message: event.target.value,
                })
              }
              placeholder="Write your message here..."
              maxLength={5000}
              rows={6}
              required
            />
          </label>

          {contactError && (
            <div className="billing-alert billing-alert-error" role="alert">
              {contactError}
            </div>
          )}

          {contactSuccess && (
            <div className="billing-alert billing-alert-success" role="status">
              {contactSuccess}
            </div>
          )}

          <Button type="submit" disabled={contactLoading}>
            {contactLoading ? (
              <LoaderCircle size={16} className="animate-spin" />
            ) : (
              <Send size={16} />
            )}
            {contactLoading ? "Sending..." : "Send message"}
          </Button>
        </form>
      </div>
    </section>
  );
}
