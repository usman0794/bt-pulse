import {
  CloudSun,
  MessageSquare,
  MessagesSquare,
  Plus,
  LogOut,
  History,
  CreditCard,
  Crown,
  Mail,
  X,
  LockKeyhole,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Separator } from "@/components/ui/separator";

export default function AppSidebar({
  user,
  isPro,
  activeView,
  setActiveView,
  historyOpen,
  setHistoryOpen,
  conversations,
  mobileSidebarOpen,
  setMobileSidebarOpen,
  setBillingNotice,
  setBillingError,
  setContactError,
  setContactSuccess,
  handleNewChat,
  handleLoadHistory,
  handleOpenConversation,
  loadSubscription,
  handleLogout,
}) {
  function openProDashboard() {
    setHistoryOpen(false);
    setMobileSidebarOpen(false);
    setBillingNotice("");
    setBillingError("");

    if (isPro) {
      setActiveView("dashboard");
      return;
    }

    // Free users can see the feature in navigation, but must upgrade to open it.
    setActiveView("billing");
    loadSubscription();
  }

  return (
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

        <button
          className={`sidebar-link ${
            activeView === "dashboard" ? "sidebar-link-active" : ""
          }`}
          onClick={openProDashboard}
          type="button"
          aria-label={
            isPro ? "Open Pro Dashboard" : "Upgrade to access Pro Dashboard"
          }
          title={
            isPro
              ? "Open Pro Dashboard"
              : "Upgrade to Pro to access this feature"
          }
        >
          <Crown size={17} />
          <span>Pro Dashboard</span>
          {!isPro && <LockKeyhole size={14} className="ml-auto opacity-70" />}
        </button>

        <button
          className={`sidebar-link ${historyOpen ? "sidebar-link-active" : ""}`}
          onClick={handleLoadHistory}
          type="button"
        >
          <History size={17} />
          <span>Conversation history</span>
        </button>

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
}
