import { describe, expect, test } from "vitest";
import { isAllowedHost, isAllowedUpgrade } from "./origin.ts";

describe("isAllowedHost", () => {
  test.each([
    "192.168.1.23:3000",
    "10.0.0.5",
    "localhost:3000",
    "[::1]:3000",
    "My-Mac.local:3000",
    "Mac.lan:3000",
    "mac.home.arpa:3000",
  ])(
    "accepts %s",
    (host) => {
      expect(isAllowedHost(host)).toBe(true);
    },
  );

  test.each([
    "evil.example",
    "evil.example:3000",
    "192.168.1.23.evil.example",
    "localhost.evil.example",
    "mac.lan.evil.example",
    "",
    undefined,
  ])(
    "rejects %s",
    (host) => {
      expect(isAllowedHost(host)).toBe(false);
    },
  );
});

describe("isAllowedUpgrade", () => {
  const host = "192.168.1.23:3000";

  test("accepts a page served by this server", () => {
    expect(isAllowedUpgrade({ host, origin: "http://192.168.1.23:3000" })).toBe(true);
  });

  test("accepts a client with no Origin, which is not a browser", () => {
    expect(isAllowedUpgrade({ host, origin: undefined })).toBe(true);
  });

  test("rejects a page from another site", () => {
    expect(isAllowedUpgrade({ host, origin: "https://evil.example" })).toBe(false);
  });

  test("rejects a page from another machine of the same network", () => {
    expect(isAllowedUpgrade({ host, origin: "http://192.168.1.99:3000" })).toBe(false);
  });

  test("rejects a page on the same machine but another port", () => {
    expect(isAllowedUpgrade({ host, origin: "http://192.168.1.23:8080" })).toBe(false);
  });

  test.each(["null", "file://", "not a url"])("rejects the opaque or malformed origin %s", (origin) => {
    expect(isAllowedUpgrade({ host, origin })).toBe(false);
  });

  test("rejects DNS rebinding, where the Host is the attacker's domain", () => {
    expect(isAllowedUpgrade({ host: "evil.example:3000", origin: "http://evil.example:3000" })).toBe(false);
  });

  test("compares case-insensitively", () => {
    expect(isAllowedUpgrade({ host: "Mac.local:3000", origin: "http://mac.LOCAL:3000" })).toBe(true);
  });
});
