import { render, screen, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { AuthProvider, useAuthBypass } from "@/components/auth/auth-provider";
import { useSession } from "next-auth/react";
import { useLoginRedirect } from "@/hooks/use-login-redirect";
import { DEV_SESSION, DEV_USER } from "@/lib/auth-mode";
import LoginPage from "@/app/login/page";

const mocks = vi.hoisted(() => ({
  replace: vi.fn(),
  refresh: vi.fn(),
  params: "",
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: mocks.replace, refresh: mocks.refresh }),
  useSearchParams: () => new URLSearchParams(mocks.params),
}));

vi.mock("next/image", () => ({
  default: ({ alt, fill, priority, ...props }: any) => <img alt={alt} {...props} />,
}));

describe("Client Auth Bypass & Session Behavior", () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.params = "";
    global.fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({}), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    );
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  function SessionConsumer() {
    const { data: session, status } = useSession();
    const bypass = useAuthBypass();
    return (
      <div>
        <span data-testid="status">{status}</span>
        <span data-testid="bypass">{String(bypass)}</span>
        <span data-testid="user-email">{session?.user?.email || "none"}</span>
        <span data-testid="user-role">{session?.user?.role || "none"}</span>
      </div>
    );
  }

  function GuardConsumer({ status, error }: { status: "loading" | "authenticated" | "unauthenticated"; error?: string }) {
    useLoginRedirect(status, error);
    return <div>Protected content</div>;
  }

  it("AuthProvider bypass=true exposes authenticated dev session and no WordPress redirect", () => {
    render(
      <AuthProvider bypass={true}>
        <SessionConsumer />
      </AuthProvider>
    );

    expect(screen.getByTestId("status")).toHaveTextContent("authenticated");
    expect(screen.getByTestId("bypass")).toHaveTextContent("true");
    expect(screen.getByTestId("user-email")).toHaveTextContent(DEV_USER.email);
    expect(screen.getByTestId("user-role")).toHaveTextContent(DEV_USER.role);
  });

  it("AuthProvider bypass=false exposes bypass=false and unauthenticated session by default", async () => {
    render(
      <AuthProvider bypass={false}>
        <SessionConsumer />
      </AuthProvider>
    );

    expect(screen.getByTestId("bypass")).toHaveTextContent("false");
    await waitFor(() => {
      expect(screen.getByTestId("user-email")).toHaveTextContent("none");
    });
  });

  it("useLoginRedirect does NOT redirect when bypass is enabled, even if status is unauthenticated", () => {
    render(
      <AuthProvider bypass={true}>
        <GuardConsumer status="unauthenticated" />
      </AuthProvider>
    );

    expect(mocks.replace).not.toHaveBeenCalled();
  });

  it("useLoginRedirect redirects to login when bypass is disabled and status is unauthenticated", async () => {
    render(
      <AuthProvider bypass={false}>
        <GuardConsumer status="unauthenticated" />
      </AuthProvider>
    );

    await waitFor(() => {
      expect(mocks.replace).toHaveBeenCalledTimes(1);
    });
    expect(mocks.replace).toHaveBeenCalledWith(expect.stringContaining("/login?callbackUrl="));
  });

  it("LoginPage automatically redirects to '/' when bypass is enabled", async () => {
    render(
      <AuthProvider bypass={true}>
        <LoginPage />
      </AuthProvider>
    );

    await waitFor(() => {
      expect(mocks.replace).toHaveBeenCalledWith("/");
    });
  });

  it("LoginPage redirects to safe return path when callbackUrl is provided and bypass is enabled", async () => {
    mocks.params = new URLSearchParams({ callbackUrl: "/companies?responsible=Ivan" }).toString();

    render(
      <AuthProvider bypass={true}>
        <LoginPage />
      </AuthProvider>
    );

    await waitFor(() => {
      expect(mocks.replace).toHaveBeenCalledWith("/companies?responsible=Ivan");
    });
  });

  it("LoginPage renders login form when bypass is disabled and user is unauthenticated", async () => {
    render(
      <AuthProvider bypass={false}>
        <LoginPage />
      </AuthProvider>
    );

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Войти" })).toBeInTheDocument();
    });
    expect(mocks.replace).not.toHaveBeenCalled();
  });
});
