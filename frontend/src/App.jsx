import { useEffect, useState } from "react";
import {
  signup,
  login,
  loginWithGoogle,
  getProfile,
  sendChatMessage,
  getConversations,
  getConversation,
} from "./services/api";

import { GoogleLogin } from "@react-oauth/google";

import ReactMarkdown from "react-markdown";
import {
  CloudSun,
  MessageSquare,
  MessagesSquare,
  Plus,
  LogOut,
  Send,
  Sparkles,
  Cloud,
  Sun,
  Menu,
  X,
  History,
  LoaderCircle,
  CreditCard,
  Crown,
  ExternalLink,
  CheckCircle2,
  ArrowLeft,
  RefreshCw,
  Mail,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import "./App.css";

const WELCOME_MESSAGE = {
  role: "assistant",
  content:
    "Hello! I'm your BTP Weather Assistant. Ask me about current weather, forecasts, temperature, or rain chances for any city.",
};

const SUGGESTIONS = [
  { label: "Weather in Lahore", icon: Sun },
  { label: "Forecast for tomorrow", icon: CloudSun },
  { label: "Will it rain today?", icon: Cloud },
];

// VITE_API_URL may be either the backend origin or the full /api base URL.
const configuredApiUrl =
  import.meta.env.VITE_API_URL || "http://localhost:5000";
const API_ROOT = configuredApiUrl.replace(/\/$/, "").endsWith("/api")
  ? configuredApiUrl.replace(/\/$/, "")
  : `${configuredApiUrl.replace(/\/$/, "")}/api`;

async function paymentApi(path, token, method = "GET") {
  const response = await fetch(`${API_ROOT}/payments/${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(method !== "GET" ? { "Content-Type": "application/json" } : {}),
    },
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(
      data.message || "Payment request failed. Please try again.",
    );
  }
  return data;
}

function App() {
  const [token, setToken] = useState(
    () => localStorage.getItem("btp_token") || "",
  );
  const [user, setUser] = useState(null);
  const [authMode, setAuthMode] = useState("login");
  const [authForm, setAuthForm] = useState({
    name: "",
    email: "",
    password: "",
  });
  const [authLoading, setAuthLoading] = useState(false);
  const [authError, setAuthError] = useState("");

  const [message, setMessage] = useState("");
  const [messages, setMessages] = useState([WELCOME_MESSAGE]);
  const [conversationId, setConversationId] = useState(null);
  const [chatLoading, setChatLoading] = useState(false);
  const [chatError, setChatError] = useState("");
  const [conversations, setConversations] = useState([]);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [activeView, setActiveView] = useState("chat");
  const [subscription, setSubscription] = useState(null);
  const [billingLoading, setBillingLoading] = useState(false);
  const [billingAction, setBillingAction] = useState("");
  const [billingError, setBillingError] = useState("");
  const [billingNotice, setBillingNotice] = useState("");
  const [contactForm, setContactForm] = useState({
    name: "",
    email: "",
    subject: "",
    message: "",
  });
  const [contactLoading, setContactLoading] = useState(false);
  const [contactError, setContactError] = useState("");
  const [contactSuccess, setContactSuccess] = useState("");

  useEffect(() => {
    if (!token) {
      setUser(null);
      return;
    }

    let cancelled = false;

    async function loadProfile() {
      try {
        const result = await getProfile(token);
        if (!cancelled) setUser(result.user);
      } catch {
        if (!cancelled) {
          localStorage.removeItem("btp_token");
          setToken("");
          setUser(null);
        }
      }
    }

    loadProfile();

    return () => {
      cancelled = true;
    };
  }, [token]);

  async function handleAuthSubmit(event) {
    event.preventDefault();
    setAuthError("");
    setAuthLoading(true);

    try {
      const result =
        authMode === "signup"
          ? await signup(authForm)
          : await login({
              email: authForm.email,
              password: authForm.password,
            });

      localStorage.setItem("btp_token", result.token);
      setUser(result.user);
      setToken(result.token);
      setAuthForm({ name: "", email: "", password: "" });
      setMessages([WELCOME_MESSAGE]);
      setConversationId(null);
    } catch (error) {
      setAuthError(error.message);
    } finally {
      setAuthLoading(false);
    }
  }

  async function handleGoogleSuccess(googleResponse) {
    if (!googleResponse.credential) {
      setAuthError("Google did not return a sign-in credential.");
      return;
    }

    setAuthError("");
    setAuthLoading(true);

    try {
      const result = await loginWithGoogle(googleResponse.credential);

      localStorage.setItem("btp_token", result.token);
      setUser(result.user);
      setToken(result.token);
      setAuthForm({ name: "", email: "", password: "" });
      setMessages([WELCOME_MESSAGE]);
      setConversationId(null);
    } catch (error) {
      setAuthError(error.message || "Google sign-in failed.");
    } finally {
      setAuthLoading(false);
    }
  }

  async function handleSend(event) {
    event.preventDefault();

    const text = message.trim();
    if (!text || !token || chatLoading) return;

    setMessage("");
    setChatError("");
    setMessages((previous) => [...previous, { role: "user", content: text }]);
    setChatLoading(true);

    try {
      const result = await sendChatMessage({
        token,
        message: text,
        conversationId,
      });

      setConversationId(result.conversationId);
      setMessages((previous) => [
        ...previous,
        { role: "assistant", content: result.answer },
      ]);
    } catch (error) {
      setChatError(error.message);
      setMessages((previous) => [
        ...previous,
        {
          role: "assistant",
          content:
            "I could not process that message. Please check the error below and try again.",
        },
      ]);
    } finally {
      setChatLoading(false);
    }
  }

  async function handleLoadHistory() {
    setActiveView("chat");
    setChatError("");
    setHistoryOpen((previous) => !previous);
    setMobileSidebarOpen(false);

    try {
      const result = await getConversations(token);
      setConversations(result.conversations || []);
    } catch (error) {
      setChatError(error.message);
    }
  }

  async function handleOpenConversation(id) {
    setChatError("");

    try {
      const result = await getConversation(token, id);
      setConversationId(result.conversation.id);
      setMessages(
        (result.messages || []).map((item) => ({
          role: item.role,
          content: item.content,
        })),
      );
      setHistoryOpen(false);
      setMobileSidebarOpen(false);
    } catch (error) {
      setChatError(error.message);
    }
  }

  function handleNewChat() {
    setActiveView("chat");
    setConversationId(null);
    setMessages([WELCOME_MESSAGE]);
    setMessage("");
    setChatError("");
    setHistoryOpen(false);
    setMobileSidebarOpen(false);
  }

  function handleLogout() {
    localStorage.removeItem("btp_token");
    setToken("");
    setUser(null);
    setConversationId(null);
    setMessages([WELCOME_MESSAGE]);
    setConversations([]);
    setMessage("");
    setChatError("");
    setMobileSidebarOpen(false);
  }

  async function handleContactSubmit(event) {
    event.preventDefault();
    setContactError("");
    setContactSuccess("");
    setContactLoading(true);

    try {
      const response = await fetch(`${API_ROOT}/contact`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(contactForm),
      });
      const result = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(
          result.message || "Unable to send your message. Please try again.",
        );
      }

      setContactSuccess(
        result.message || "Your message has been sent successfully.",
      );
      setContactForm({ name: "", email: "", subject: "", message: "" });
    } catch (error) {
      setContactError(
        error.message || "Unable to send your message. Please try again.",
      );
    } finally {
      setContactLoading(false);
    }
  }

  async function loadSubscription() {
    if (!token) return;
    setBillingLoading(true);
    setBillingError("");
    try {
      const result = await paymentApi("subscription", token);
      setSubscription(result.subscription);
    } catch (error) {
      setBillingError(error.message);
    } finally {
      setBillingLoading(false);
    }
  }

  async function openCheckout() {
    setBillingAction("checkout");
    setBillingError("");
    try {
      const result = await paymentApi("checkout", token, "POST");
      if (!result.checkoutUrl)
        throw new Error("Stripe did not return a checkout URL.");
      window.location.assign(result.checkoutUrl);
    } catch (error) {
      setBillingError(error.message);
      setBillingAction("");
    }
  }

  async function openBillingPortal() {
    setBillingAction("portal");
    setBillingError("");
    try {
      const result = await paymentApi("portal", token, "POST");
      if (!result.portalUrl)
        throw new Error("Stripe did not return a billing portal URL.");
      window.location.assign(result.portalUrl);
    } catch (error) {
      setBillingError(error.message);
      setBillingAction("");
    }
  }

  async function scheduleCancellation() {
    const confirmed = window.confirm(
      "Schedule cancellation at the end of your current billing period? Your Pro access should remain active until then.",
    );
    if (!confirmed) return;

    setBillingAction("cancel");
    setBillingError("");
    setBillingNotice("");
    try {
      const result = await paymentApi("cancel", token, "POST");
      setBillingNotice(result.message || "Cancellation scheduled.");
      await loadSubscription();
    } catch (error) {
      setBillingError(error.message);
    } finally {
      setBillingAction("");
    }
  }

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const paymentStatus = params.get("payment");
    if (!token || !paymentStatus) return;

    if (paymentStatus === "success") {
      setActiveView("billing");
      setBillingNotice(
        "Payment completed or checkout returned successfully. Refreshing your subscription status now.",
      );
      loadSubscription();
    } else if (paymentStatus === "cancelled") {
      setActiveView("billing");
      setBillingNotice(
        "Checkout was cancelled. No new subscription was created by this checkout attempt.",
      );
    }

    params.delete("payment");
    params.delete("session_id");
    const cleanUrl = `${window.location.pathname}${params.toString() ? `?${params}` : ""}${window.location.hash}`;
    window.history.replaceState({}, "", cleanUrl);
  }, [token]);

  const formattedPeriodEnd = subscription?.current_period_end
    ? new Date(subscription.current_period_end).toLocaleDateString(undefined, {
        year: "numeric",
        month: "long",
        day: "numeric",
      })
    : null;
  const isPro =
    String(subscription?.plan || user?.plan || "free").toLowerCase() === "pro";

  const sidebar = (
    <aside className="app-sidebar">
      <div className="brand">
        <div className="brand-mark">
          <CloudSun size={23} strokeWidth={2.2} />
        </div>

        <div className="min-w-0">
          <h2>BTP Weather</h2>
          <p>AI Weather Assistant</p>
        </div>

        {mobileSidebarOpen && (
          <Button
            variant="ghost"
            size="icon"
            className="ml-auto lg:hidden"
            onClick={() => setMobileSidebarOpen(false)}
            aria-label="Close navigation"
          >
            <X size={19} />
          </Button>
        )}
      </div>

      <Button className="new-chat-button" onClick={handleNewChat}>
        <Plus size={18} />
        New conversation
      </Button>

      <div className="sidebar-section">
        <p className="sidebar-label">WORKSPACE</p>

        {/* Weather Chat */}
        <button
          className={`sidebar-link ${
            activeView === "chat" && !historyOpen ? "sidebar-link-active" : ""
          }`}
          onClick={() => {
            setActiveView("chat");
            setHistoryOpen(false);
            setMobileSidebarOpen(false);
            setBillingNotice("");
            setBillingError("");
          }}
          type="button"
        >
          <MessageSquare size={17} />
          <span>Weather Chat</span>
        </button>

        {/* Conversation History */}
        <button
          className={`sidebar-link ${historyOpen ? "sidebar-link-active" : ""}`}
          onClick={handleLoadHistory}
          type="button"
        >
          <History size={17} />
          <span>Conversation history</span>
        </button>

        {/* Saved conversations appear directly under Conversation History */}
        {historyOpen && (
          <div className="history-list">
            {conversations.length === 0 ? (
              <p className="history-empty">No conversations yet.</p>
            ) : (
              conversations.map((conversation) => (
                <button
                  key={conversation.id}
                  className="history-entry"
                  onClick={() => handleOpenConversation(conversation.id)}
                  type="button"
                >
                  <MessagesSquare size={15} />
                  <span>{conversation.title || "Weather conversation"}</span>
                </button>
              ))
            )}
          </div>
        )}

        {/* Contact Us */}
        <button
          className={`sidebar-link ${
            activeView === "contact" ? "sidebar-link-active" : ""
          }`}
          onClick={() => {
            setActiveView("contact");
            setHistoryOpen(false);
            setMobileSidebarOpen(false);
            setContactError("");
            setContactSuccess("");
          }}
          type="button"
        >
          <Mail size={17} />
          <span>Contact Us</span>
        </button>

        {/* Plan & Billing */}
        <button
          className={`sidebar-link ${
            activeView === "billing" ? "sidebar-link-active" : ""
          }`}
          onClick={() => {
            setActiveView("billing");
            setHistoryOpen(false);
            setMobileSidebarOpen(false);
            setBillingNotice("");
            setBillingError("");
            loadSubscription();
          }}
          type="button"
        >
          <CreditCard size={17} />
          <span>Plan & billing</span>
        </button>
      </div>

      <div className="sidebar-bottom">
        <Separator className="mb-4" />

        <div className="profile-row">
          <Avatar className="profile-avatar">
            <AvatarFallback>
              {(user?.name || user?.email || "U").charAt(0).toUpperCase()}
            </AvatarFallback>
          </Avatar>

          <div className="profile-info">
            <strong>{user?.name || user?.email}</strong>
            <span>{user?.plan || "free"} plan</span>
          </div>

          <Button
            variant="ghost"
            size="icon"
            onClick={handleLogout}
            aria-label="Log out"
            title="Log out"
          >
            <LogOut size={17} />
          </Button>
        </div>
      </div>
    </aside>
  );

  if (!user) {
    return (
      <main className="auth-page">
        <section className="auth-card">
          <div className="auth-brand-mark">
            <CloudSun size={30} />
          </div>

          <div className="text-center">
            <h1>BTP Weather</h1>
            <p className="auth-subtitle">
              Your personal AI-powered weather assistant
            </p>
          </div>

          <div className="auth-tabs">
            <button
              type="button"
              className={authMode === "login" ? "selected" : ""}
              onClick={() => {
                setAuthMode("login");
                setAuthError("");
              }}
            >
              Sign in
            </button>
            <button
              type="button"
              className={authMode === "signup" ? "selected" : ""}
              onClick={() => {
                setAuthMode("signup");
                setAuthError("");
              }}
            >
              Create account
            </button>
          </div>

          <form className="auth-form" onSubmit={handleAuthSubmit}>
            {authMode === "signup" && (
              <label>
                Full name
                <Input
                  required
                  maxLength={100}
                  autoComplete="name"
                  value={authForm.name}
                  onChange={(event) =>
                    setAuthForm({ ...authForm, name: event.target.value })
                  }
                  placeholder="Your name"
                />
              </label>
            )}

            <label>
              Email address
              <Input
                type="email"
                required
                autoComplete="email"
                value={authForm.email}
                onChange={(event) =>
                  setAuthForm({ ...authForm, email: event.target.value })
                }
                placeholder="you@example.com"
              />
            </label>

            <label>
              Password
              <Input
                type="password"
                required
                minLength={8}
                autoComplete={
                  authMode === "signup" ? "new-password" : "current-password"
                }
                value={authForm.password}
                onChange={(event) =>
                  setAuthForm({ ...authForm, password: event.target.value })
                }
                placeholder="At least 8 characters"
              />
            </label>

            {authError && <p className="auth-error">{authError}</p>}

            <Button
              type="submit"
              className="auth-submit"
              disabled={authLoading}
            >
              {authLoading ? (
                <>
                  <LoaderCircle className="animate-spin" size={17} />
                  Please wait...
                </>
              ) : authMode === "signup" ? (
                "Create account"
              ) : (
                "Sign in"
              )}
            </Button>
          </form>

          <div className="google-login-section">
            <div className="google-login-divider">
              <span>OR</span>
            </div>

            <GoogleLogin
              onSuccess={handleGoogleSuccess}
              onError={() =>
                setAuthError(
                  "Google sign-in was unsuccessful. Please try again.",
                )
              }
              useOneTap={false}
              text="continue_with"
              shape="rectangular"
              width="320"
            />
          </div>

          <p className="auth-footnote">
            Secure access to your personal weather assistant
          </p>
        </section>
      </main>
    );
  }

  return (
    <main className="weather-app">
      {mobileSidebarOpen && (
        <button
          className="sidebar-backdrop"
          aria-label="Close navigation"
          onClick={() => setMobileSidebarOpen(false)}
        />
      )}

      <div
        className={`sidebar-shell ${mobileSidebarOpen ? "sidebar-shell-open" : ""}`}
      >
        {sidebar}
      </div>

      {activeView === "billing" ? (
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
              <p>
                Manage your plan and payment details securely through Stripe.
              </p>
            </div>

            {billingError && (
              <div className="billing-alert billing-alert-error" role="alert">
                {billingError}
              </div>
            )}
            {billingNotice && (
              <div
                className="billing-alert billing-alert-success"
                role="status"
              >
                {billingNotice}
              </div>
            )}

            {billingLoading && !subscription ? (
              <div className="billing-loading">
                <LoaderCircle className="animate-spin" size={22} /> Loading your
                subscription...
              </div>
            ) : (
              <div className="billing-grid">
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
                    A premium subscription for your daily weather workflow.
                  </p>
                  <ul className="plan-features">
                    <li>
                      <CheckCircle2 size={16} /> AI weather assistant
                    </li>
                    <li>
                      <CheckCircle2 size={16} /> Current conditions and
                      forecasts
                    </li>
                    <li>
                      <CheckCircle2 size={16} /> Subscription management through
                      Stripe
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

            {isPro && subscription && (
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
                    Cancellation is scheduled. Your Pro access should remain
                    active until the billing period ends.
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
            )}
            <p className="billing-footnote">
              Card details are handled by Stripe. BTP Weather does not store
              your full payment card number.
            </p>
          </div>
        </section>
      ) : activeView === "contact" ? (
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
                <div
                  className="billing-alert billing-alert-success"
                  role="status"
                >
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
      ) : (
        <section className="chat-panel">
          <header className="topbar">
            <div className="topbar-heading">
              <Button
                variant="ghost"
                size="icon"
                className="mobile-menu-button"
                onClick={() => setMobileSidebarOpen(true)}
                aria-label="Open navigation"
              >
                <Menu size={20} />
              </Button>
              <div>
                <h1>Weather Chat</h1>
                <p>Ask questions. Understand the weather.</p>
              </div>
            </div>

            <div className="assistant-status">
              <span className="status-dot" />
              <span>AI Assistant</span>
            </div>
          </header>

          <div className="chat-scroll-area">
            <div className="chat-content">
              {messages.length === 1 &&
                messages[0].role === "assistant" &&
                messages[0].content === WELCOME_MESSAGE.content && (
                  <div className="welcome-heading">
                    <div className="welcome-icon">
                      <CloudSun size={30} />
                    </div>
                    <div className="welcome-eyebrow">
                      <Sparkles size={14} />
                      YOUR WEATHER, SIMPLIFIED
                    </div>
                    <h2>Your personal weather assistant</h2>
                    <p>
                      Get current conditions, forecasts, and rain insights
                      through a simple conversation.
                    </p>
                  </div>
                )}

              <div className="messages">
                {messages.map((item, index) => (
                  <div
                    className={`message-row ${item.role}`}
                    key={`${conversationId || "new"}-${index}`}
                  >
                    {item.role === "assistant" && (
                      <Avatar className="message-avatar">
                        <AvatarFallback>
                          <CloudSun size={19} />
                        </AvatarFallback>
                      </Avatar>
                    )}

                    <div className="message-bubble">
                      <div className="message-author">
                        {item.role === "assistant" ? "BTP Assistant" : "You"}
                        <span>
                          {item.role === "assistant"
                            ? "AI response"
                            : "Message"}
                        </span>
                      </div>
                      <div className="markdown-content">
                        <ReactMarkdown
                          components={{
                            table: ({ children }) => (
                              <div className="markdown-table-wrapper">
                                <table>{children}</table>
                              </div>
                            ),
                          }}
                        >
                          {item.content}
                        </ReactMarkdown>
                      </div>
                    </div>
                  </div>
                ))}

                {chatLoading && (
                  <div className="message-row assistant">
                    <Avatar className="message-avatar">
                      <AvatarFallback>
                        <CloudSun size={19} />
                      </AvatarFallback>
                    </Avatar>
                    <div className="message-bubble loading-bubble">
                      <div className="message-author">BTP Assistant</div>
                      <div className="flex items-center gap-3 py-2">
                        <LoaderCircle
                          size={17}
                          className="animate-spin text-primary"
                        />
                        <span className="text-sm text-muted-foreground">
                          Checking the weather...
                        </span>
                      </div>
                      <Skeleton className="h-2 w-40" />
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="composer-area">
            {chatError && (
              <div className="chat-error" role="alert">
                {chatError}
              </div>
            )}

            {messages.length === 1 &&
              messages[0].role === "assistant" &&
              messages[0].content === WELCOME_MESSAGE.content && (
                <div className="suggestions">
                  {SUGGESTIONS.map(({ label, icon: Icon }) => (
                    <button
                      type="button"
                      className="suggestion"
                      key={label}
                      onClick={() => setMessage(label)}
                    >
                      <Icon size={15} />
                      {label}
                    </button>
                  ))}
                </div>
              )}

            <form className="composer" onSubmit={handleSend}>
              <Textarea
                value={message}
                onChange={(event) => setMessage(event.target.value)}
                placeholder="Ask about the weather in any city..."
                aria-label="Your weather question"
                maxLength={2000}
                disabled={chatLoading}
                rows={1}
                className="composer-input"
                onKeyDown={(event) => {
                  if (
                    event.key === "Enter" &&
                    !event.shiftKey &&
                    !event.nativeEvent.isComposing
                  ) {
                    event.preventDefault();
                    event.currentTarget.form?.requestSubmit();
                  }
                }}
              />
              <Button
                type="submit"
                className="send-button"
                disabled={!message.trim() || chatLoading}
                aria-label="Send message"
              >
                {chatLoading ? (
                  <LoaderCircle size={18} className="animate-spin" />
                ) : (
                  <Send size={18} />
                )}
                <span>Send</span>
              </Button>
            </form>

            <p className="composer-note">
              BTP Weather Assistant · AI-generated responses may need
              verification
            </p>
          </div>
        </section>
      )}
    </main>
  );
}

export default App;
