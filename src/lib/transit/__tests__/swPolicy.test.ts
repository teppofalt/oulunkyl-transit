import { describe, expect, it } from "vitest";

// The service worker imports this exact module at runtime.
import { SHELL_URL, isLiveData, isStaticAsset, shouldCacheAsShell } from "../../../../public/sw-policy.js";

const url = (path: string) => new URL(`https://example.test${path}`);

describe("service worker caching policy", () => {
  it("allows the / navigation to update the shell cache", () => {
    expect(shouldCacheAsShell(url(SHELL_URL), true)).toBe(true);
  });

  it("never stores /dev-hfp as the / shell", () => {
    expect(shouldCacheAsShell(url("/dev-hfp"), true)).toBe(false);
  });

  it("never caches server functions or API traffic", () => {
    expect(isLiveData(url("/_serverFn/fetchBoard"))).toBe(true);
    expect(isLiveData(url("/api/anything"))).toBe(true);
    expect(isLiveData(url("/?_serverFnId=abc"))).toBe(true);
    expect(isStaticAsset(url("/_serverFn/fetchBoard"))).toBe(false);
  });

  it("caches app assets", () => {
    expect(isStaticAsset(url("/assets/app.js"))).toBe(true);
    expect(isStaticAsset(url("/icons/icon-192.png"))).toBe(true);
  });
});
