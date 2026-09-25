import net from "node:net";
import dns from "node:dns";

/**
 * Reusable, robust network address and SSRF safety classifier.
 *
 * Implements strict fail-closed network validation using Node.js net.BlockList
 * and dns facilities to block:
 * - Private, loopback, link-local, carrier-grade NAT, multicast, reserved IPv4
 * - Unspecified, loopback, unique-local (ULA), link-local, multicast, documentation IPv6
 * - IPv4-mapped IPv6 representations
 * - Cloud metadata services and special local hostnames
 * - DNS names resolving to any unsafe address (fail-closed, mixed-address protection)
 */

const blockList = new net.BlockList();

// Unsafe IPv4 ranges
blockList.addSubnet("0.0.0.0", 8, "ipv4");       // RFC 1122 Current network
blockList.addSubnet("10.0.0.0", 8, "ipv4");      // RFC 1918 Private
blockList.addSubnet("100.64.0.0", 10, "ipv4");   // RFC 6598 Shared address space (CGNAT)
blockList.addSubnet("127.0.0.0", 8, "ipv4");     // RFC 1122 Loopback
blockList.addSubnet("169.254.0.0", 16, "ipv4");  // RFC 3927 Link-local
blockList.addSubnet("172.16.0.0", 12, "ipv4");   // RFC 1918 Private (172.16.0.0 - 172.31.255.255)
blockList.addSubnet("192.0.0.0", 24, "ipv4");    // RFC 6890 IETF Protocol Assignments
blockList.addSubnet("192.0.2.0", 24, "ipv4");    // RFC 5737 TEST-NET-1
blockList.addSubnet("192.168.0.0", 16, "ipv4");  // RFC 1918 Private
blockList.addSubnet("198.18.0.0", 15, "ipv4");   // RFC 2544 Benchmarking
blockList.addSubnet("198.51.100.0", 24, "ipv4"); // RFC 5737 TEST-NET-2
blockList.addSubnet("203.0.113.0", 24, "ipv4");  // RFC 5737 TEST-NET-3
blockList.addSubnet("224.0.0.0", 4, "ipv4");     // RFC 5771 Multicast
blockList.addSubnet("240.0.0.0", 4, "ipv4");     // RFC 1112 Reserved
blockList.addAddress("255.255.255.255", "ipv4"); // RFC 919 Broadcast

// Unsafe IPv6 ranges
blockList.addAddress("::", "ipv6");              // RFC 4291 Unspecified
blockList.addAddress("::1", "ipv6");             // RFC 4291 Loopback
blockList.addSubnet("fc00::", 7, "ipv6");        // RFC 4193 Unique-Local Address (ULA)
blockList.addSubnet("fe80::", 10, "ipv6");       // RFC 4291 Link-local unicast
blockList.addSubnet("ff00::", 8, "ipv6");        // RFC 4291 Multicast
blockList.addSubnet("2001:db8::", 32, "ipv6");   // RFC 3849 Documentation
blockList.addSubnet("100::", 64, "ipv6");        // RFC 6666 Discard-only
blockList.addSubnet("64:ff9b::", 96, "ipv6");        // RFC 6052 Well-Known NAT64 Prefix
blockList.addSubnet("64:ff9b:1::", 48, "ipv6");      // RFC 8215 Local-Use IPv4/IPv6 Translation Prefix
blockList.addSubnet("0:0:0:0:ffff:0:0:0", 96, "ipv6"); // RFC 2765/RFC 6145 SIIT IPv4-Translated
blockList.addSubnet("2002::", 16, "ipv6");           // RFC 3056 6to4 encapsulation
blockList.addSubnet("2001::", 32, "ipv6");           // RFC 4380 Teredo tunneling
blockList.addSubnet("2001:2::", 48, "ipv6");         // RFC 5180 Benchmarking
blockList.addSubnet("2001:20::", 28, "ipv6");        // RFC 7343 ORCHIDv2

/**
 * Restricted ports list according to WHATWG Fetch standard to prevent protocol smuggling
 * and internal port scanning (SSH, SMTP, Redis, Memcached, databases, etc.).
 */
export const RESTRICTED_PORTS = new Set([
  "1", "7", "9", "11", "13", "15", "17", "19", "20", "21", "22", "23", "25",
  "37", "42", "43", "53", "69", "77", "79", "87", "95", "101", "102", "103",
  "104", "109", "110", "111", "113", "115", "117", "119", "123", "135", "137",
  "138", "139", "143", "161", "179", "389", "445", "465", "512", "513", "514",
  "515", "526", "530", "531", "532", "540", "548", "554", "556", "563", "587",
  "601", "636", "993", "995", "1719", "1720", "1723", "2049", "3306", "3659",
  "4045", "5060", "5061", "5432", "6000", "6379", "6665", "6666", "6667", "6668",
  "6669", "6697", "11211", "27017"
]);

/**
 * Normalizes a raw hostname or IP string:
 * - strips surrounding IPv6 brackets (`[...]`)
 * - converts to lowercase
 * - strips trailing DNS dots
 */
export function normalizeHostname(hostname: string): string {
  let normalized = hostname.trim().toLowerCase();
  if (normalized.startsWith("[") && normalized.endsWith("]")) {
    normalized = normalized.slice(1, -1);
  }
  normalized = normalized.replace(/\.+$/, "");
  return normalized;
}

/**
 * Checks whether an IP address (IPv4 or IPv6, including IPv4-mapped IPv6)
 * belongs to an unsafe, private, loopback, or non-public network range.
 */
export function isUnsafeIpAddress(address: string): boolean {
  const cleanIp = address.replace(/^\[|\]$/g, "").trim();
  const version = net.isIP(cleanIp);
  if (!version) {
    return true; // Not a valid IP -> unsafe if evaluated as an IP address
  }
  const type = version === 6 ? "ipv6" : "ipv4";
  return blockList.check(cleanIp, type);
}

/**
 * Identifies special internal/metadata hostnames regardless of casing or trailing dots.
 */
export function isSpecialUnsafeHost(hostname: string): boolean {
  const h = normalizeHostname(hostname);
  if (h === "localhost" || h.endsWith(".localhost")) return true;
  if (h === "metadata.google.internal" || h.endsWith(".metadata.google.internal")) return true;
  if (h === "instance-data" || h.endsWith(".instance-data")) return true;
  return false;
}

export type DnsLookupFunction =
  | typeof dns.promises.lookup
  | ((hostname: string, options: { all: true; verbatim: boolean }) => Promise<dns.LookupAddress[]>);

/**
 * Validates a webhook URL against SSRF vulnerabilities:
 * 1. Must use HTTPS
 * 2. Cannot target localhost, cloud metadata, or internal hostnames
 * 3. Literal IPs must not be in private/unsafe ranges
 * 4. DNS hostnames are resolved and EVERY returned A/AAAA address must be public.
 *    If any address is private, or if resolution fails, throws an Error.
 *
 * @param urlStr The candidate webhook URL string
 * @param lookupFn Optional injected DNS lookup function (defaults to dns.promises.lookup)
 * @returns Parsed safe URL instance
 */
export async function assertSafeWebhookUrl(
  urlStr: string,
  lookupFn: DnsLookupFunction = dns.promises.lookup
): Promise<URL> {
  const trimmed = urlStr.replace(/\/+$/, "");
  let parsed: URL;

  try {
    parsed = new URL(trimmed);
  } catch {
    throw new Error("Invalid webhook URL format");
  }

  if (parsed.protocol !== "https:") {
    throw new Error("Webhook URL must use HTTPS");
  }

  if (parsed.username || parsed.password) {
    throw new Error("Webhook URL cannot contain credentials");
  }

  if (parsed.port && RESTRICTED_PORTS.has(parsed.port)) {
    throw new Error("Webhook URL uses a restricted port");
  }

  const cleanHost = normalizeHostname(parsed.hostname);

  if (!cleanHost) {
    throw new Error("Invalid webhook URL format");
  }

  // 1. Check special internal and metadata hostnames
  if (isSpecialUnsafeHost(cleanHost)) {
    throw new Error("Webhook URL cannot point to private IP ranges or localhost");
  }

  // 2. Check IP literal targets
  if (net.isIP(cleanHost)) {
    if (isUnsafeIpAddress(cleanHost)) {
      throw new Error("Webhook URL cannot point to private IP ranges or localhost");
    }
    return parsed;
  }

  // 3. DNS resolution validation for domain names
  let resolvedAddresses: dns.LookupAddress[];
  try {
    const lookupResult = await (lookupFn as any)(cleanHost, { all: true, verbatim: true });
    resolvedAddresses = Array.isArray(lookupResult) ? lookupResult : [lookupResult];
  } catch (err) {
    console.error(`[Bitrix24 SSRF] DNS lookup failed for host ${cleanHost}:`, err);
    throw new Error("Webhook URL host could not be resolved");
  }

  if (!resolvedAddresses || resolvedAddresses.length === 0) {
    throw new Error("Webhook URL host could not be resolved");
  }

  for (const entry of resolvedAddresses) {
    if (isUnsafeIpAddress(entry.address)) {
      console.error(
        `[Bitrix24 SSRF] Webhook host ${cleanHost} resolved to private/unsafe IP: ${entry.address}`
      );
      throw new Error("Webhook URL cannot point to private IP ranges or localhost");
    }
  }

  return parsed;
}
