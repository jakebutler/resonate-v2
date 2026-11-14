import { describe, expect, it } from "vitest";
import {
  convexDeploymentName,
  isProductionConvexDeployment,
  PROD_CONVEX_DEPLOYMENT_NAME,
} from "../convexDeployment";

describe("convexDeploymentName", () => {
  it("parses the deployment name from a standard Convex cloud URL", () => {
    expect(convexDeploymentName("https://healthy-platypus-553.convex.cloud")).toBe(
      "healthy-platypus-553"
    );
  });

  it("parses the name regardless of the host suffix (rename-the-host)", () => {
    // If Convex renames its host suffixes, the deployment name is unchanged.
    expect(convexDeploymentName("https://healthy-platypus-553.convex.site")).toBe(
      "healthy-platypus-553"
    );
    expect(convexDeploymentName("https://healthy-platypus-553.deployments.example.com")).toBe(
      "healthy-platypus-553"
    );
  });

  it("is not a substring match: the prod name must be the whole first label", () => {
    expect(convexDeploymentName("https://evil-healthy-platypus-553.convex.cloud")).toBe(
      "evil-healthy-platypus-553"
    );
    expect(convexDeploymentName("https://proxy.internal/healthy-platypus-553")).toBe("proxy");
  });

  it("returns null for empty, missing, malformed, or hostless URLs", () => {
    expect(convexDeploymentName(undefined)).toBeNull();
    expect(convexDeploymentName(null)).toBeNull();
    expect(convexDeploymentName("")).toBeNull();
    expect(convexDeploymentName("not a url")).toBeNull();
    expect(convexDeploymentName("http://127.0.0.1:3210")).toBe("127");
  });
});

describe("isProductionConvexDeployment", () => {
  it("matches the production deployment", () => {
    expect(isProductionConvexDeployment("https://healthy-platypus-553.convex.cloud")).toBe(true);
    expect(isProductionConvexDeployment("https://healthy-platypus-553.convex.site")).toBe(true);
  });

  it("does not match local, preview, or unrelated deployments", () => {
    expect(isProductionConvexDeployment("http://127.0.0.1:3210")).toBe(false);
    expect(isProductionConvexDeployment("https://tame-pika-42.convex.cloud")).toBe(false);
    expect(isProductionConvexDeployment("")).toBe(false);
    expect(isProductionConvexDeployment(undefined)).toBe(false);
  });

  it("keys on the deployment name constant, not the hostname string", () => {
    expect(PROD_CONVEX_DEPLOYMENT_NAME).toBe("healthy-platypus-553");
  });
});
