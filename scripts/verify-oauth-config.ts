import assert from "node:assert/strict";
import {
  getConfiguredOAuthProviders,
  getOAuthProviderStatus,
  getOAuthProviders,
} from "@/lib/auth/oauth";

const originalEnv = { ...process.env };

try {
  delete process.env.AUTH_GITHUB_ID;
  delete process.env.AUTH_GITHUB_SECRET;
  delete process.env.AUTH_GOOGLE_ID;
  delete process.env.AUTH_GOOGLE_SECRET;

  assert.deepEqual(getConfiguredOAuthProviders(), []);
  assert.equal(getOAuthProviders().length, 0);

  process.env.AUTH_GITHUB_ID = "github-client-id";
  process.env.AUTH_GITHUB_SECRET = "github-client-secret";
  assert.deepEqual(getConfiguredOAuthProviders(), ["github"]);
  assert.equal(getOAuthProviders().length, 1);

  delete process.env.AUTH_GOOGLE_SECRET;
  process.env.AUTH_GOOGLE_ID = "google-client-id";
  const googleStatus = getOAuthProviderStatus().find((provider) => provider.id === "google");
  assert.equal(googleStatus?.partial, true);
  assert.deepEqual(getConfiguredOAuthProviders(), ["github"]);

  console.log("OAuth configuration checks passed.");
} finally {
  for (const key of ["AUTH_GITHUB_ID", "AUTH_GITHUB_SECRET", "AUTH_GOOGLE_ID", "AUTH_GOOGLE_SECRET"]) {
    if (originalEnv[key] === undefined) delete process.env[key];
    else process.env[key] = originalEnv[key];
  }
}
