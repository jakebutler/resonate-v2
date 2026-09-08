import { describe, expect, it } from "vitest";
import {
  BlockedUrlError,
  isBlockedHostname,
  isBlockedIp,
  isRedirectStatus,
  normalizeHostname,
  resolveRedirectLocation,
  validateRemoteUrl,
} from "@/lib/urlGuard";

describe("isBlockedIp (v4)", () => {
  it("blocks loopback, private, link-local, CGNAT, and reserved ranges", () => {
    expect(isBlockedIp("127.0.0.1")).toBe(true);
    expect(isBlockedIp("127.255.255.255")).toBe(true);
    expect(isBlockedIp("10.1.2.3")).toBe(true);
    expect(isBlockedIp("0.0.0.0")).toBe(true);
    expect(isBlockedIp("169.254.169.254")).toBe(true);
    expect(isBlockedIp("100.64.0.1")).toBe(true);
    expect(isBlockedIp("100.127.255.254")).toBe(true);
    expect(isBlockedIp("192.168.1.1")).toBe(true);
    expect(isBlockedIp("172.16.0.1")).toBe(true);
    expect(isBlockedIp("172.31.255.255")).toBe(true);
    expect(isBlockedIp("224.0.0.1")).toBe(true);
    expect(isBlockedIp("255.255.255.255")).toBe(true);
  });

  it("allows public addresses and the edges of blocked ranges", () => {
    expect(isBlockedIp("8.8.8.8")).toBe(false);
    expect(isBlockedIp("172.32.0.1")).toBe(false);
    expect(isBlockedIp("100.128.0.1")).toBe(false);
    expect(isBlockedIp("11.0.0.1")).toBe(false);
  });

  it("fails closed on unparseable input", () => {
    expect(isBlockedIp("not-an-ip")).toBe(true);
    expect(isBlockedIp("1.2.3")).toBe(true);
    expect(isBlockedIp("1.2.3.4.5")).toBe(true);
    expect(isBlockedIp("999.999.999.999")).toBe(true);
  });
});

describe("isBlockedIp (v6)", () => {
  it("blocks loopback, unique-local, link-local, and mapped forms", () => {
    expect(isBlockedIp("::1")).toBe(true);
    expect(isBlockedIp("::")).toBe(true);
    expect(isBlockedIp("fd00::1")).toBe(true);
    expect(isBlockedIp("fc00::1")).toBe(true);
    expect(isBlockedIp("fe80::1")).toBe(true);
    expect(isBlockedIp("::ffff:127.0.0.1")).toBe(true);
    expect(isBlockedIp("::ffff:169.254.169.254")).toBe(true);
    expect(isBlockedIp("64:ff9b::a9fe:a9fe")).toBe(true);
    expect(isBlockedIp("2002:a9fe:a9fe::")).toBe(true);
    expect(isBlockedIp("ff02::1")).toBe(true);
    expect(isBlockedIp("2001:db8::1")).toBe(true);
  });

  it("allows public global-unicast v6 and fails closed on garbage", () => {
    expect(isBlockedIp("2607:f8b0:4004:800::200e")).toBe(false);
    expect(isBlockedIp("::ffff:8.8.8.8")).toBe(true); // mapped family blocked outright
    expect(isBlockedIp("::::")).toBe(true);
  });
});

describe("normalizeHostname + isBlockedHostname", () => {
  it("strips IPv6 brackets so literal checks see the real address", () => {
    expect(normalizeHostname("[::1]")).toBe("::1");
    expect(isBlockedHostname("[::1]")).toBe(true);
    expect(isBlockedHostname("[FD00::1]")).toBe(true);
    expect(isBlockedHostname("[::ffff:169.254.169.254]")).toBe(true);
  });

  it("blocks localhost variants and IP literals, allows public names", () => {
    expect(isBlockedHostname("localhost")).toBe(true);
    expect(isBlockedHostname("api.localhost")).toBe(true);
    expect(isBlockedHostname("printer.local")).toBe(true);
    expect(isBlockedHostname("10.0.0.1")).toBe(true);
    expect(isBlockedHostname("example.com")).toBe(false);
    expect(isBlockedHostname("example.com.")).toBe(false); // root dot
  });
});

describe("validateRemoteUrl", () => {
  const publicLookup = async () => [{ address: "93.184.216.34", family: 4 }];
  const metadataLookup = async () => [{ address: "169.254.169.254", family: 4 }];
  const v6Lookup = async () => [{ address: "fd00::1", family: 6 }];

  it("accepts an https URL whose resolution is public", async () => {
    const check = await validateRemoteUrl(
      "https://example.com/paper.pdf",
      publicLookup
    );
    expect(check.hostname).toBe("example.com");
    expect(check.addresses).toHaveLength(1);
  });

  it("rejects non-https URLs", async () => {
    await expect(
      validateRemoteUrl("http://example.com", publicLookup)
    ).rejects.toThrow(/https/i);
  });

  it("rejects hosts that resolve into blocked ranges (SSRF metadata probe)", async () => {
    await expect(
      validateRemoteUrl("https://internal.example.com/", metadataLookup)
    ).rejects.toThrow(BlockedUrlError);
  });

  it("rejects hosts that resolve to private v6", async () => {
    await expect(
      validateRemoteUrl("https://v6.example.com/", v6Lookup)
    ).rejects.toThrow(BlockedUrlError);
  });

  it("rejects bracketed IPv6 loopback literals before any lookup", async () => {
    await expect(
      validateRemoteUrl("https://[::1]/", publicLookup)
    ).rejects.toThrow(/not reachable/);
    await expect(
      validateRemoteUrl("https://[::ffff:127.0.0.1]/", publicLookup)
    ).rejects.toThrow(/not reachable/);
  });

  it("rejects when the host resolves to nothing", async () => {
    await expect(
      validateRemoteUrl("https://nx.example.com/", async () => [])
    ).rejects.toThrow(/resolved/i);
  });
});

describe("redirect helpers", () => {
  it("recognizes redirect statuses", () => {
    for (const status of [301, 302, 303, 307, 308]) {
      expect(isRedirectStatus(status)).toBe(true);
    }
    for (const status of [200, 304, 400, 404, 500]) {
      expect(isRedirectStatus(status)).toBe(false);
    }
  });

  it("resolves relative locations and rejects non-https targets", () => {
    expect(
      resolveRedirectLocation("/next.pdf", "https://example.com/a/")
    ).toBe("https://example.com/next.pdf");
    expect(
      resolveRedirectLocation("https://other.example.com/b", "https://example.com/")
    ).toBe("https://other.example.com/b");
    expect(
      resolveRedirectLocation("http://other.example.com/", "https://example.com/")
    ).toBeNull();
    expect(
      resolveRedirectLocation("ftp://other.example.com/", "https://example.com/")
    ).toBeNull();
  });
});
