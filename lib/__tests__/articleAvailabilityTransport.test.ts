import { EventEmitter } from "node:events";
import type { RequestOptions } from "node:https";
import { afterEach, describe, expect, it, vi } from "vitest";
import { verifyArticleAvailability } from "../articleAvailability";

const transport = vi.hoisted(() => ({ request: vi.fn() }));
vi.mock("node:https", () => ({ request: transport.request, default: { request: transport.request } }));

afterEach(() => { vi.unstubAllEnvs(); vi.clearAllMocks(); });

describe("DNS-pinned default article transport", () => {
  it.each([
    { address: "1.1.1.1", family: 4, all: true },
    { address: "1.1.1.1", family: 4, all: false },
    { address: "2606:4700:4700::1111", family: 6, all: true },
    { address: "2606:4700:4700::1111", family: 6, all: false },
  ])("uses only the validated address with either Node lookup contract (%j)", async address => {
    vi.stubEnv("BLOG_SITE_ORIGIN", "https://www.corvolabs.com");
    const validated = { address: address.address, family: address.family };
    const lookup = vi.fn(async () => [validated, { address: "8.8.8.8", family: 4 }]);
    const connected: unknown[] = [];
    transport.request.mockImplementation((options: RequestOptions, response: (res: EventEmitter & {
      statusCode: number; headers: Record<string, string>;
    }) => void) => {
      const req = Object.assign(new EventEmitter(), {
        destroy(error: Error) { req.emit("error", error); return req; },
        end() {
          options.lookup!(String(options.hostname), { all: address.all }, (error, value, family) => {
            if (error) { req.emit("error", error); return; }
            if (address.all !== Array.isArray(value)) {
              req.emit("error", new Error("ERR_INVALID_IP_ADDRESS")); return;
            }
            const values = Array.isArray(value) ? value : [{ address: value, family }];
            connected.push({ values, hostname: options.hostname, servername: options.servername, path: options.path });
            const res = Object.assign(new EventEmitter(), {
              statusCode: 200, headers: { "content-type": "text/html" },
            });
            response(res);
            queueMicrotask(() => {
              res.emit("data", Buffer.from("<article><h1>Reviewed article</h1><p>Exact reviewed copy.</p></article>"));
              res.emit("end");
            });
          });
        },
      });
      return req;
    });
    const result = await verifyArticleAvailability({
      canonicalUrl: "https://www.corvolabs.com/blog/2030-10-07-fixture",
      mdxPath: "content/blog/2030-10-07-fixture.mdx",
      title: "Reviewed article", content: "Exact reviewed copy.",
    }, { lookup });
    expect(result.availability).toBe("verified");
    expect(lookup).toHaveBeenCalledExactlyOnceWith("www.corvolabs.com");
    expect(transport.request).toHaveBeenCalledTimes(1);
    expect(connected).toEqual([{
      values: [validated], hostname: "www.corvolabs.com",
      servername: "www.corvolabs.com", path: "/blog/2030-10-07-fixture",
    }]);
  });
});
