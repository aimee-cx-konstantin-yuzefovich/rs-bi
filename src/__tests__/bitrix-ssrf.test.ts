import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  assertSafeWebhookUrl,
  isUnsafeIpAddress,
  isSpecialUnsafeHost,
  normalizeHostname,
} from "@/lib/network-safety";
import { bitrixGet, bitrixPost } from "@/lib/bitrix";

describe("SSRF Protection & Network Safety Suite", () => {
  describe("IP Address & Hostname Classification", () => {
    it("1. classifies private/loopback/special IPv4 literals as unsafe", () => {
      const unsafeIpv4 = [
        "0.0.0.0",
        "0.1.2.3",
        "10.0.0.1",
        "10.255.255.255",
        "100.64.0.1",
        "100.127.255.255",
        "127.0.0.1",
        "127.1.2.3",
        "169.254.169.254",
        "169.254.1.1",
        "172.16.0.1",
        "172.31.255.255",
        "192.0.0.1",
        "192.0.2.1",
        "192.168.0.1",
        "192.168.1.1",
        "198.18.0.1",
        "198.51.100.1",
        "203.0.113.1",
        "224.0.0.1",
        "240.0.0.1",
        "255.255.255.255",
      ];

      for (const ip of unsafeIpv4) {
        expect(isUnsafeIpAddress(ip), `Expected ${ip} to be unsafe`).toBe(true);
      }
    });

    it("2. classifies public IPv4 literals as safe", () => {
      const publicIpv4 = ["8.8.8.8", "1.1.1.1", "172.32.0.1", "93.184.216.34"];
      for (const ip of publicIpv4) {
        expect(isUnsafeIpAddress(ip), `Expected ${ip} to be safe`).toBe(false);
      }
    });

    it("3. classifies unsafe IPv6 literals as unsafe", () => {
      const unsafeIpv6 = [
        "::",
        "::1",
        "fc00::1",
        "fd00::1",
        "fd12:3456:789a::1",
        "fe80::1",
        "fe80::200:5aee:feaa:20a2",
        "ff00::1",
        "ff02::1",
        "2001:db8::1",
        "100::1",
      ];

      for (const ip of unsafeIpv6) {
        expect(isUnsafeIpAddress(ip), `Expected ${ip} to be unsafe`).toBe(true);
      }
    });

    it("4. classifies public IPv6 literals as safe", () => {
      const publicIpv6 = [
        "2001:4860:4860::8888",
        "2606:4700:4700::1111",
        "2a00:1450:4001:828::200e",
      ];
      for (const ip of publicIpv6) {
        expect(isUnsafeIpAddress(ip), `Expected ${ip} to be safe`).toBe(false);
      }
    });

    it("5. classifies IPv4-mapped IPv6 addresses accurately", () => {
      // Private/loopback mapped IPv6 must be unsafe
      expect(isUnsafeIpAddress("::ffff:127.0.0.1")).toBe(true);
      expect(isUnsafeIpAddress("::ffff:10.0.0.1")).toBe(true);
      expect(isUnsafeIpAddress("::ffff:169.254.169.254")).toBe(true);
      expect(isUnsafeIpAddress("::ffff:192.168.1.1")).toBe(true);
      expect(isUnsafeIpAddress("::ffff:172.16.1.1")).toBe(true);

      // Public mapped IPv6 should pass
      expect(isUnsafeIpAddress("::ffff:8.8.8.8")).toBe(false);
      expect(isUnsafeIpAddress("::ffff:1.1.1.1")).toBe(false);
    });

    it("6. identifies special metadata and internal hostnames case-insensitively and with trailing dots", () => {
      const specialHosts = [
        "localhost",
        "LOCALHOST",
        "localhost.",
        "api.localhost",
        "metadata.google.internal",
        "METADATA.GOOGLE.INTERNAL",
        "metadata.google.internal.",
        "instance-data",
        "instance-data.",
        "sub.instance-data",
      ];

      for (const host of specialHosts) {
        expect(isSpecialUnsafeHost(host), `Expected ${host} to be detected as special unsafe host`).toBe(true);
      }

      // Normal domain names must NOT be false-positive
      expect(isSpecialUnsafeHost("example.com")).toBe(false);
      expect(isSpecialUnsafeHost("russilica.bitrix24.ru")).toBe(false);
      expect(isSpecialUnsafeHost("fc-example.com")).toBe(false);
    });
  });

  describe("Webhook URL Validation (assertSafeWebhookUrl)", () => {
    it("7. rejects non-HTTPS protocols", async () => {
      await expect(assertSafeWebhookUrl("http://russilica.bitrix24.ru/rest/1/abc"))
        .rejects.toThrow("Webhook URL must use HTTPS");
      await expect(assertSafeWebhookUrl("ftp://russilica.bitrix24.ru/rest/1/abc"))
        .rejects.toThrow("Webhook URL must use HTTPS");
    });

    it("8. rejects literal IPv4 loopback and private targets", async () => {
      await expect(assertSafeWebhookUrl("https://127.0.0.1/rest/1/abc"))
        .rejects.toThrow("Webhook URL cannot point to private IP ranges or localhost");
      await expect(assertSafeWebhookUrl("https://127.10.20.30/rest/1/abc"))
        .rejects.toThrow("Webhook URL cannot point to private IP ranges or localhost");
      await expect(assertSafeWebhookUrl("https://10.0.0.1/rest/1/abc"))
        .rejects.toThrow("Webhook URL cannot point to private IP ranges or localhost");
      await expect(assertSafeWebhookUrl("https://172.16.0.1/rest/1/abc"))
        .rejects.toThrow("Webhook URL cannot point to private IP ranges or localhost");
      await expect(assertSafeWebhookUrl("https://172.31.255.255/rest/1/abc"))
        .rejects.toThrow("Webhook URL cannot point to private IP ranges or localhost");
      await expect(assertSafeWebhookUrl("https://192.168.1.1/rest/1/abc"))
        .rejects.toThrow("Webhook URL cannot point to private IP ranges or localhost");
      await expect(assertSafeWebhookUrl("https://192.168.1.100/rest/1/abc"))
        .rejects.toThrow("Webhook URL cannot point to private IP ranges or localhost");
      await expect(assertSafeWebhookUrl("https://169.254.169.254/rest/1/abc"))
        .rejects.toThrow("Webhook URL cannot point to private IP ranges or localhost");
    });

    it("9. rejects literal IPv6 loopback, ULA, and link-local targets in bracketed URL format", async () => {
      await expect(assertSafeWebhookUrl("https://[::1]/rest/1/abc"))
        .rejects.toThrow("Webhook URL cannot point to private IP ranges or localhost");
      await expect(assertSafeWebhookUrl("https://[::]/rest/1/abc"))
        .rejects.toThrow("Webhook URL cannot point to private IP ranges or localhost");
      await expect(assertSafeWebhookUrl("https://[fc00::1]/rest/1/abc"))
        .rejects.toThrow("Webhook URL cannot point to private IP ranges or localhost");
      await expect(assertSafeWebhookUrl("https://[fd12:3456::1]/rest/1/abc"))
        .rejects.toThrow("Webhook URL cannot point to private IP ranges or localhost");
      await expect(assertSafeWebhookUrl("https://[fe80::1]/rest/1/abc"))
        .rejects.toThrow("Webhook URL cannot point to private IP ranges or localhost");
      await expect(assertSafeWebhookUrl("https://[::ffff:127.0.0.1]/rest/1/abc"))
        .rejects.toThrow("Webhook URL cannot point to private IP ranges or localhost");
      await expect(assertSafeWebhookUrl("https://[::ffff:10.0.0.1]/rest/1/abc"))
        .rejects.toThrow("Webhook URL cannot point to private IP ranges or localhost");
      await expect(assertSafeWebhookUrl("https://[::ffff:169.254.169.254]/rest/1/abc"))
        .rejects.toThrow("Webhook URL cannot point to private IP ranges or localhost");
    });

    it("10. rejects special metadata hostnames", async () => {
      await expect(assertSafeWebhookUrl("https://localhost/rest/1/abc"))
        .rejects.toThrow("Webhook URL cannot point to private IP ranges or localhost");
      await expect(assertSafeWebhookUrl("https://metadata.google.internal/rest/1/abc"))
        .rejects.toThrow("Webhook URL cannot point to private IP ranges or localhost");
      await expect(assertSafeWebhookUrl("https://metadata.google.internal./computeMetadata/v1"))
        .rejects.toThrow("Webhook URL cannot point to private IP ranges or localhost");
    });

    it("11. accepts valid public IP literals", async () => {
      const mockLookup = vi.fn();
      const safeV4 = await assertSafeWebhookUrl("https://8.8.8.8/rest/1/abc", mockLookup);
      expect(safeV4.hostname).toBe("8.8.8.8");
      expect(mockLookup).not.toHaveBeenCalled(); // Literal IPs do not trigger DNS lookup

      const safeV6 = await assertSafeWebhookUrl("https://[2001:4860:4860::8888]/rest/1/abc", mockLookup);
      expect(safeV6.hostname).toBe("[2001:4860:4860::8888]");
      expect(mockLookup).not.toHaveBeenCalled();
    });

    it("12. resolves DNS and passes when all resolved addresses are public", async () => {
      const mockLookup = vi.fn().mockResolvedValue([
        { address: "93.184.216.34", family: 4 },
        { address: "2606:2800:220:1:248:1893:25c8:1946", family: 6 },
      ]);

      const result = await assertSafeWebhookUrl("https://russilica.bitrix24.ru/rest/1/abc", mockLookup);
      expect(result.hostname).toBe("russilica.bitrix24.ru");
      expect(mockLookup).toHaveBeenCalledWith("russilica.bitrix24.ru", { all: true, verbatim: true });
    });

    it("13. rejects DNS hostname resolving to private IPv4 address", async () => {
      const mockLookup = vi.fn().mockResolvedValue([
        { address: "10.0.0.5", family: 4 },
      ]);

      await expect(assertSafeWebhookUrl("https://evil.example.com/rest/1/abc", mockLookup))
        .rejects.toThrow("Webhook URL cannot point to private IP ranges or localhost");
    });

    it("14. rejects DNS hostname resolving to private IPv6 address", async () => {
      const mockLookup = vi.fn().mockResolvedValue([
        { address: "fc00::dead:beef", family: 6 },
      ]);

      await expect(assertSafeWebhookUrl("https://evil-ipv6.example.com/rest/1/abc", mockLookup))
        .rejects.toThrow("Webhook URL cannot point to private IP ranges or localhost");
    });

    it("15. rejects mixed DNS results where one address is public and one is private (hard invariant)", async () => {
      const mockLookup = vi.fn().mockResolvedValue([
        { address: "93.184.216.34", family: 4 }, // public
        { address: "127.0.0.1", family: 4 },     // private loopback
      ]);

      await expect(assertSafeWebhookUrl("https://mixed.example.com/rest/1/abc", mockLookup))
        .rejects.toThrow("Webhook URL cannot point to private IP ranges or localhost");
    });

    it("16. fails closed on DNS lookup error / NXDOMAIN", async () => {
      const mockLookup = vi.fn().mockRejectedValue(new Error("ENOTFOUND"));

      await expect(assertSafeWebhookUrl("https://nonexistent.domain.test/rest/1/abc", mockLookup))
        .rejects.toThrow("Webhook URL host could not be resolved");
    });

    it("17. does NOT false-positive domain names starting with fc, fd, or fe80 when resolved IP is public", async () => {
      const mockLookup = vi.fn().mockResolvedValue([
        { address: "93.184.216.34", family: 4 },
      ]);

      // None of these legitimate domain names should be rejected based on name characters
      const testDomains = [
        "https://fc-public.example.com/rest/1/abc",
        "https://fd-service.example.com/rest/1/abc",
        "https://fe80-gateway.example.com/rest/1/abc",
      ];

      for (const url of testDomains) {
        const result = await assertSafeWebhookUrl(url, mockLookup);
        expect(result).toBeInstanceOf(URL);
      }
    });
  });

  describe("Bitrix Client Integration Protection", () => {
    const originalEnv = process.env.BITRIX_WEBHOOK_URL;

    afterEach(() => {
      process.env.BITRIX_WEBHOOK_URL = originalEnv;
    });

    it("18. bitrixGet fails closed and sanitizes error when webhook points to SSRF target", async () => {
      process.env.BITRIX_WEBHOOK_URL = "https://127.0.0.1/rest/1/key";

      await expect(bitrixGet("crm.deal.list")).rejects.toThrow(
        "Failed to crm.deal.list. Please try again later."
      );
    });

    it("19. bitrixGet rejects unconfigured webhook cleanly", async () => {
      delete process.env.BITRIX_WEBHOOK_URL;

      await expect(bitrixGet("crm.deal.list")).rejects.toThrow(
        "CRM integration is not configured. Contact your administrator."
      );
    });

    it("20. bitrixGet rejects disallowed methods before resolving network address", async () => {
      process.env.BITRIX_WEBHOOK_URL = "https://127.0.0.1/rest/1/key";

      await expect(bitrixGet("disallowed.method")).rejects.toThrow(
        "Invalid request parameters."
      );
    });

    it("21. bitrixPost fails closed and sanitizes error when webhook points to bracketed IPv6 loopback target", async () => {
      process.env.BITRIX_WEBHOOK_URL = "https://[::1]/rest/1/key";

      await expect(bitrixPost("crm.deal.list", { id: 1 })).rejects.toThrow(
        "Failed to crm.deal.list. Please try again later."
      );
    });

    it("22. bitrixGet fails closed when webhook points to ULA IPv6 target", async () => {
      process.env.BITRIX_WEBHOOK_URL = "https://[fc00::1]/rest/1/key";

      await expect(bitrixGet("crm.deal.list")).rejects.toThrow(
        "Failed to crm.deal.list. Please try again later."
      );
    });
  });
});
