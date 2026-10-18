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

import { CloudSun, LoaderCircle, Menu } from "lucide-react";
import { Button } from "@/components/ui/button";
import AppSidebar from "./components/layout/AppSidebar";
import AuthPage from "./features/auth/AuthPage";
import ChatPage from "./features/chat/ChatPage";
import "./App.css";
import ProDashboard from "./components/ProDashboard";
import ContactPage from "./features/contact/ContactPage";
import BillingPage from "./features/billing/BillingPage";

const WELCOME_MESSAGE = {
  role: "assistant",
  content:
    "Hello! I'm your BTP Weather Assistant. Ask me about current weather, forecasts, temperature, or rain chances for any city.",
};

// VITE_API_URL may be either the backend origin or the full /api base URL.
const configuredApiUrl =
  import.meta.env.VITE_API_URL ||
  import.meta.env.VITE_API_BASE_URL ||
  (import.meta.env.PROD
    ? "https://bt-pulse-api.onrender.com"
    : "http://localhost:5000");
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
  const [authChecking, setAuthChecking] = useState(() =>
    Boolean(localStorage.getItem("btp_token")),
  );
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
  const [restoringConversation, setRestoringConversation] = useState(true);
  const [chatLoading, setChatLoading] = useState(false);
  const [chatError, setChatError] = useState("");
  const [conversations, setConversations] = useState([]);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  // Restore the last page from the URL first, then localStorage.
  // This keeps Billing/Dashboard/Contact selected after a browser refresh.
  const validViews = ["chat", "dashboard", "billing", "contact"];
  const [activeView, setActiveViewState] = useState(() => {
    const params = new URLSearchParams(window.location.search);
    const urlView = params.get("view");
    if (validViews.includes(urlView)) return urlView;

    const savedView = localStorage.getItem("btp_active_view");
    return validViews.includes(savedView) ? savedView : "chat";
  });
  useEffect(() => {
    const titles = {
      chat: "Weather Chat",
      dashboard: "Pro Dashboard",
      billing: "Plan & Billing",
      contact: "Contact Us",
    };

    document.title = titles[activeView] || "BTP Weather";
  }, [activeView]);

  useEffect(() => {
    const titles = {
      chat: "Weather Chat",
      dashboard: "Pro Dashboard",
      billing: "Plan & Billing",
      contact: "Contact Us",
    };

    document.title = titles[activeView] || "BTP Weather";
  }, [activeView]);

  function setActiveView(view) {
    if (!validViews.includes(view)) return;

    setActiveViewState(view);
    localStorage.setItem("btp_active_view", view);

    // Keep the selected page visible in the address bar, e.g. ?view=billing.
    const url = new URL(window.location.href);
    url.searchParams.set("view", view);
    window.history.replaceState({}, "", url);
  }
  const [subscription, setSubscription] = useState(null);
  const [billingLoading, setBillingLoading] = useState(false);
  const [billingAction, setBillingAction] = useState("");
  const [billingError, setBillingError] = useState("");
  const [billingNotice, setBillingNotice] = useState("");
  const [cancelDialogOpen, setCancelDialogOpen] = useState(false);
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
    localStorage.setItem("btp_active_view", activeView);
  }, [activeView]);

  useEffect(() => {
    if (!token) {
      setUser(null);
      setAuthChecking(false);
      return;
    }

    let cancelled = false;

    async function loadProfile() {
      setAuthChecking(true);

      try {
        const result = await getProfile(token);
        if (!cancelled) {
          setUser(result.user);
        }
      } catch {
        if (!cancelled) {
          localStorage.removeItem("btp_token");
          setToken("");
          setUser(null);
        }
      } finally {
        if (!cancelled) {
          setAuthChecking(false);
        }
      }
    }

    loadProfile();

    return () => {
      cancelled = true;
    };
  }, [token]);

  // Restore the last active conversation after the user's session is verified.
  // Keep the welcome screen hidden until this check has completed.
  useEffect(() => {
    if (authChecking) return;

    if (!token || !user) {
      setRestoringConversation(false);
      return;
    }

    let cancelled = false;

    async function restoreConversation() {
      setRestoringConversation(true);
      const savedConversationId = localStorage.getItem(
        "btp_active_conversation_id",
      );

      if (!savedConversationId) {
        setRestoringConversation(false);
        return;
      }

      try {
        const result = await getConversation(token, savedConversationId);
        if (cancelled) return;

        const restoredMessages = [...(result.messages || [])];
        const getMessageTime = (item) => {
          const value =
            item.created_at ??
            item.createdAt ??
            item.timestamp ??
            item.sent_at ??
            item.sentAt;
          if (value == null) return null;
          const time = new Date(value).getTime();
          return Number.isFinite(time) ? time : null;
        };
        const times = restoredMessages.map(getMessageTime);
        if (
          restoredMessages.length > 1 &&
          times.every((time) => time !== null)
        ) {
          restoredMessages.sort(
            (a, b) => getMessageTime(a) - getMessageTime(b),
          );
        }

        setConversationId(result.conversation.id);
        setMessages(
          restoredMessages.map((item) => ({
            role: item.role,
            content: item.content,
          })),
        );
      } catch (error) {
        if (!cancelled) {
          // Remove stale IDs so they are not retried on every refresh.
          localStorage.removeItem("btp_active_conversation_id");
          setConversationId(null);
          setMessages([WELCOME_MESSAGE]);
          console.warn(
            "Could not restore the last conversation:",
            error.message,
          );
        }
      } finally {
        if (!cancelled) setRestoringConversation(false);
      }
    }

    restoreConversation();
    return () => {
      cancelled = true;
    };
  }, [token, user, authChecking]);

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
      if (result.conversationId) {
        localStorage.setItem(
          "btp_active_conversation_id",
          result.conversationId,
        );
      }
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
      localStorage.setItem(
        "btp_active_conversation_id",
        result.conversation.id,
      );
      const historyMessages = [...(result.messages || [])];

      // Older API responses may return conversation messages newest-first.
      // Sort by their stored creation timestamp when available; otherwise
      // retain the backend's original order rather than guessing.
      const getMessageTime = (item) => {
        const value =
          item.created_at ??
          item.createdAt ??
          item.timestamp ??
          item.sent_at ??
          item.sentAt;
        if (value == null) return null;
        const time = new Date(value).getTime();
        return Number.isFinite(time) ? time : null;
      };

      const messageTimes = historyMessages.map(getMessageTime);
      const hasAllTimestamps =
        historyMessages.length > 1 &&
        messageTimes.every((time) => time !== null);

      if (hasAllTimestamps) {
        historyMessages.sort((a, b) => getMessageTime(a) - getMessageTime(b));
      }

      setMessages(
        historyMessages.map((item) => ({
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
    localStorage.removeItem("btp_active_conversation_id");
    setConversationId(null);
    setMessages([WELCOME_MESSAGE]);
    setMessage("");
    setChatError("");
    setHistoryOpen(false);
    setMobileSidebarOpen(false);
  }

  function handleLogout() {
    localStorage.removeItem("btp_token");
    localStorage.removeItem("btp_active_view");
    localStorage.removeItem("btp_active_conversation_id");
    setActiveView("chat");
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
    setCancelDialogOpen(false);
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
    if (paymentStatus === "success" || paymentStatus === "cancelled") {
      params.set("view", "billing");
    }
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
    <AppSidebar
      user={user}
      isPro={isPro}
      activeView={activeView}
      setActiveView={setActiveView}
      historyOpen={historyOpen}
      setHistoryOpen={setHistoryOpen}
      conversations={conversations}
      mobileSidebarOpen={mobileSidebarOpen}
      setMobileSidebarOpen={setMobileSidebarOpen}
      setBillingNotice={setBillingNotice}
      setBillingError={setBillingError}
      setContactError={setContactError}
      setContactSuccess={setContactSuccess}
      handleNewChat={handleNewChat}
      handleLoadHistory={handleLoadHistory}
      handleOpenConversation={handleOpenConversation}
      loadSubscription={loadSubscription}
      handleLogout={handleLogout}
    />
  );

  if (authChecking || (user && restoringConversation)) {
    return (
      <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[#f5f9fb] p-6">
        <div className="pointer-events-none absolute -left-24 -top-24 h-72 w-72 rounded-full bg-teal-100/60 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-28 -right-20 h-80 w-80 rounded-full bg-cyan-100/60 blur-3xl" />

        <div
          className="relative flex w-full max-w-sm flex-col items-center rounded-3xl border border-white/80 bg-white/90 px-8 py-10 text-center shadow-xl shadow-slate-200/60 backdrop-blur"
          role="status"
          aria-live="polite"
        >
          <div className="mb-5 flex h-16 w-16 items-center justify-center rounded-2xl bg-[#064e54] text-white shadow-lg shadow-teal-900/15">
            <CloudSun size={32} strokeWidth={1.8} />
          </div>
          <h1 className="text-xl font-semibold tracking-tight text-slate-900">
            BTP Weather
          </h1>
          <p className="mt-2 text-sm text-slate-500">
            Your personal weather workspace
          </p>
          <div className="mt-7 h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
            <div className="h-full w-2/5 animate-pulse rounded-full bg-[#0e6670]" />
          </div>
          <div className="mt-4 flex items-center gap-2 text-xs font-medium text-slate-500">
            <LoaderCircle size={14} className="animate-spin text-[#0e6670]" />
            <span>Getting things ready</span>
          </div>
        </div>
      </main>
    );
  }

  if (!user) {
    return (
      <AuthPage
        authMode={authMode}
        setAuthMode={setAuthMode}
        authForm={authForm}
        setAuthForm={setAuthForm}
        authLoading={authLoading}
        authError={authError}
        setAuthError={setAuthError}
        handleAuthSubmit={handleAuthSubmit}
        handleGoogleSuccess={handleGoogleSuccess}
      />
    );
  }

  return (
    <main className="weather-app">
      {cancelDialogOpen && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/50 p-4 backdrop-blur-sm"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget && !billingAction) {
              setCancelDialogOpen(false);
            }
          }}
        >
          <section
            className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl sm:p-7"
            role="dialog"
            aria-modal="true"
            aria-labelledby="cancel-subscription-title"
            aria-describedby="cancel-subscription-description"
          >
            <div className="mb-5 flex h-12 w-12 items-center justify-center rounded-xl bg-amber-50 text-amber-700">
              <Info size={24} aria-hidden="true" />
            </div>
            <h2
              id="cancel-subscription-title"
              className="text-xl font-semibold tracking-tight text-slate-900"
            >
              Cancel your Pro subscription?
            </h2>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              Your BTP Weather Pro access will remain active until the end of
              your current billing period. You won’t be charged for another
              period after cancellation takes effect.
            </p>
            <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
              <Button
                type="button"
                variant="outline"
                className={outlineBtn}
                onClick={() => setCancelDialogOpen(false)}
                disabled={Boolean(billingAction)}
              >
                Keep Pro
              </Button>
              <Button
                type="button"
                className="rounded-full bg-[#9B2C2C] px-5 text-white hover:bg-[#7F1D1D] focus-visible:ring-2 focus-visible:ring-red-700 focus-visible:ring-offset-2"
                onClick={scheduleCancellation}
                disabled={Boolean(billingAction)}
              >
                {billingAction === "cancel" ? (
                  <LoaderCircle size={16} className="animate-spin" />
                ) : null}
                Confirm cancellation
              </Button>
            </div>
          </section>
        </div>
      )}

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

      {activeView === "dashboard" ? (
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
                <h1>Pro Dashboard</h1>
                <p>Your saved locations and weather insights</p>
              </div>
            </div>
          </header>
          <div className="chat-scroll-area">
            <ProDashboard token={token} />
          </div>
        </section>
      ) : activeView === "billing" ? (
        <BillingPage
          isPro={isPro}
          setActiveView={setActiveView}
          loadSubscription={loadSubscription}
          billingLoading={billingLoading}
          billingError={billingError}
          billingNotice={billingNotice}
          subscription={subscription}
          formattedPeriodEnd={formattedPeriodEnd}
          openCheckout={openCheckout}
          billingAction={billingAction}
          openBillingPortal={openBillingPortal}
          scheduleCancellation={scheduleCancellation}
        />
      ) : activeView === "contact" ? (
        <ContactPage
          setActiveView={setActiveView}
          contactForm={contactForm}
          setContactForm={setContactForm}
          contactLoading={contactLoading}
          contactError={contactError}
          contactSuccess={contactSuccess}
          handleContactSubmit={handleContactSubmit}
        />
      ) : (
        <ChatPage
          messages={messages}
          conversationId={conversationId}
          chatLoading={chatLoading}
          chatError={chatError}
          message={message}
          setMessage={setMessage}
          setMobileSidebarOpen={setMobileSidebarOpen}
          handleSend={handleSend}
        />
      )}
    </main>
  );
}

export default App;
