import { CloudSun, LoaderCircle } from "lucide-react";
import { GoogleLogin } from "@react-oauth/google";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export default function AuthPage({
  authMode,
  setAuthMode,
  authForm,
  setAuthForm,
  authLoading,
  authError,
  setAuthError,
  handleAuthSubmit,
  handleGoogleSuccess,
}) {
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

          <Button type="submit" className="auth-submit" disabled={authLoading}>
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
              setAuthError("Google sign-in was unsuccessful. Please try again.")
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
