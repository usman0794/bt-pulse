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
    localStorage.removeItem("btp_active_view");
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

  if (authChecking) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-50 p-6">
        <div
          className="flex flex-col items-center gap-4 text-center"
          role="status"
          aria-live="polite"
        >
          <CloudSun size={40} className="text-primary" />
          <LoaderCircle size={24} className="animate-spin text-primary" />
          <p className="text-sm text-slate-600">Restoring your session...</p>
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
