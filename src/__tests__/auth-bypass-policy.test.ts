import { describe, it, expect } from "vitest";
import {
  evaluateAuthBypass,
  normalizeHost,
  parseAllowlist,
  type AuthBypassContext,
} from "@/lib/auth-bypass-policy";

describe("Request-Scoped Development Auth Bypass Policy", () => {
  const approvedHost = "rs-bi-git-main-constantinejozefowicz-8563s-projects.vercel.app";
  const approvedIp = "86.220.30.74";

  const baseVercelContext: AuthBypassContext = {
    authMode: "bypass",
    isVercel: true,
    nodeEnv: "production",
    vercelEnv: "production",
    host: approvedHost,
    clientIp: approvedIp,
    allowedHosts: [approvedHost],
    allowedIps: [approvedIp],
  };

  describe("Host Normalization", () => {
    it("normalizes uppercase hostnames to lowercase", () => {
      expect(normalizeHost("RS-BI-DEV.VERCEL.APP")).toBe("rs-bi-dev.vercel.app");
    });

    it("strips port numbers from hostnames", () => {
      expect(normalizeHost("rs-bi-dev.vercel.app:443")).toBe("rs-bi-dev.vercel.app");
      expect(normalizeHost("localhost:3000")).toBe("localhost");
    });

    it("handles bracketed IPv6 hostnames with ports", () => {
      expect(normalizeHost("[::1]:3000")).toBe("::1");
      expect(normalizeHost("[2001:db8::1]")).toBe("2001:db8::1");
    });

    it("handles unbracketed IPv6 literal hostnames without truncating at colons", () => {
      expect(normalizeHost("::1")).toBe("::1");
      expect(normalizeHost("2001:db8::1")).toBe("2001:db8::1");
    });

    it("trims whitespace from hostnames", () => {
      expect(normalizeHost("  rs-bi-dev.vercel.app  ")).toBe("rs-bi-dev.vercel.app");
    });

    it("returns null for null, undefined, or empty hosts", () => {
      expect(normalizeHost(null)).toBeNull();
      expect(normalizeHost(undefined)).toBeNull();
      expect(normalizeHost("")).toBeNull();
      expect(normalizeHost("   ")).toBeNull();
    });
  });

  describe("Allowlist Parsing", () => {
    it("parses comma-separated values and trims whitespace", () => {
      expect(parseAllowlist(" host1.app , host2.app ,host3.app ")).toEqual([
        "host1.app",
        "host2.app",
        "host3.app",
      ]);
    });

    it("filters out empty tokens", () => {
      expect(parseAllowlist("host1.app,,  ,host2.app")).toEqual(["host1.app", "host2.app"]);
    });

    it("returns empty array for empty or missing input", () => {
      expect(parseAllowlist(null)).toEqual([]);
      expect(parseAllowlist(undefined)).toEqual([]);
      expect(parseAllowlist("")).toEqual([]);
    });
  });

  describe("Evaluator Core Rules (Required Tests A through M)", () => {
    it("Test A: approved host + approved IP on Vercel -> TRUE", () => {
      expect(evaluateAuthBypass(baseVercelContext)).toBe(true);
    });

    it("Test B: approved host + wrong IP -> FALSE", () => {
      const context: AuthBypassContext = {
        ...baseVercelContext,
        clientIp: "198.51.100.1",
      };
      expect(evaluateAuthBypass(context)).toBe(false);
    });

    it("Test C: wrong host + approved IP -> FALSE", () => {
      const context: AuthBypassContext = {
        ...baseVercelContext,
        host: "another-branch.vercel.app",
      };
      expect(evaluateAuthBypass(context)).toBe(false);
    });

    it("Test D — CRITICAL: production custom domain (e.g. bi.russilica.com) -> FALSE", () => {
      const context: AuthBypassContext = {
        ...baseVercelContext,
        host: "bi.russilica.com",
      };
      expect(evaluateAuthBypass(context)).toBe(false);

      const altProdContext: AuthBypassContext = {
        ...baseVercelContext,
        host: "bi-terminal.rus-silica.com",
      };
      expect(evaluateAuthBypass(altProdContext)).toBe(false);
    });

    it("Test E — REGRESSION FIX: exact development hostname in Vercel production -> TRUE", () => {
      const context: AuthBypassContext = {
        ...baseVercelContext,
        vercelEnv: "production",
      };
      expect(evaluateAuthBypass(context)).toBe(true);
    });

    it("Test F: AUTH_MODE missing / undefined -> FALSE", () => {
      const context: AuthBypassContext = {
        ...baseVercelContext,
        authMode: undefined,
      };
      expect(evaluateAuthBypass(context)).toBe(false);
    });

    it("Test G: AUTH_MODE=wordpress -> FALSE", () => {
      const context: AuthBypassContext = {
        ...baseVercelContext,
        authMode: "wordpress",
      };
      expect(evaluateAuthBypass(context)).toBe(false);
    });

    it("Test H: VERCEL not set (isVercel=false) in production -> FALSE", () => {
      const context: AuthBypassContext = {
        ...baseVercelContext,
        isVercel: false,
        nodeEnv: "production",
      };
      expect(evaluateAuthBypass(context)).toBe(false);
    });

    it("Test I: malformed IP -> FALSE", () => {
      expect(evaluateAuthBypass({ ...baseVercelContext, clientIp: "not-an-ip" })).toBe(false);
      expect(evaluateAuthBypass({ ...baseVercelContext, clientIp: "999.999.999.999" })).toBe(false);
      expect(evaluateAuthBypass({ ...baseVercelContext, clientIp: "1.2.3" })).toBe(false);
    });

    it("Test J: clientIp='unknown' -> FALSE", () => {
      const context: AuthBypassContext = {
        ...baseVercelContext,
        clientIp: "unknown",
      };
      expect(evaluateAuthBypass(context)).toBe(false);
    });

    it("Test K: deceptive hostname (e.g. suffix or prefix attack) -> FALSE", () => {
      const deceptiveSuffix: AuthBypassContext = {
        ...baseVercelContext,
        host: `${approvedHost}.evil.com`,
      };
      expect(evaluateAuthBypass(deceptiveSuffix)).toBe(false);

      const deceptivePrefix: AuthBypassContext = {
        ...baseVercelContext,
        host: `evil-${approvedHost}`,
      };
      expect(evaluateAuthBypass(deceptivePrefix)).toBe(false);
    });

    it("Test L: host with :443 is normalized and allowed -> TRUE", () => {
      const context: AuthBypassContext = {
        ...baseVercelContext,
        host: `${approvedHost}:443`,
      };
      expect(evaluateAuthBypass(context)).toBe(true);
    });

    it("Test M: uppercase hostname is normalized and allowed -> TRUE", () => {
      const context: AuthBypassContext = {
        ...baseVercelContext,
        host: approvedHost.toUpperCase(),
      };
      expect(evaluateAuthBypass(context)).toBe(true);
    });
  });

  describe("Additional Edge Cases & Integrations", () => {
    it("handles multiple comma-separated hosts and IPs correctly", () => {
      const multiContext: AuthBypassContext = {
        authMode: "bypass",
        isVercel: true,
        nodeEnv: "production",
        vercelEnv: "production",
        host: "dev2.vercel.app",
        clientIp: "86.220.30.74",
        allowedHosts: ["dev1.vercel.app", "dev2.vercel.app"],
        allowedIps: ["10.0.0.1", "86.220.30.74"],
      };
      expect(evaluateAuthBypass(multiContext)).toBe(true);
    });

    it("normalizes IPv4-mapped IPv6 client IPs (::ffff:86.220.30.74 -> 86.220.30.74)", () => {
      const context: AuthBypassContext = {
        ...baseVercelContext,
        clientIp: `::ffff:${approvedIp}`,
      };
      expect(evaluateAuthBypass(context)).toBe(true);
    });

    it("preserves local development behavior (non-Vercel, NODE_ENV=development, AUTH_MODE=bypass)", () => {
      const localDevContext: AuthBypassContext = {
        authMode: "bypass",
        isVercel: false,
        nodeEnv: "development",
        vercelEnv: undefined,
        host: "localhost:3000",
        clientIp: "127.0.0.1",
        allowedHosts: [],
        allowedIps: [],
      };
      expect(evaluateAuthBypass(localDevContext)).toBe(true);
    });

    it("rejects local development if AUTH_MODE is not bypass", () => {
      const localDevContext: AuthBypassContext = {
        authMode: "wordpress",
        isVercel: false,
        nodeEnv: "development",
        vercelEnv: undefined,
        host: "localhost:3000",
        clientIp: "127.0.0.1",
        allowedHosts: [],
        allowedIps: [],
      };
      expect(evaluateAuthBypass(localDevContext)).toBe(false);
    });
  });
});
