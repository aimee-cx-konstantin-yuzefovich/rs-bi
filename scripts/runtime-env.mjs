const REQUIRED_RUNTIME_SECRETS = ["NEXTAUTH_SECRET", "PROXY_SECRET"];

export function assertRuntimeSecrets(env = process.env) {
  for (const key of REQUIRED_RUNTIME_SECRETS) {
    const value = env[key]?.trim();
    if (!value) {
      throw new Error(`${key} must be set to a runtime secret before deployment.`);
    }
    if (value === "build-only-not-a-runtime-secret" || value.startsWith("CHANGE_ME_")) {
      throw new Error(`${key} still contains a documented/build placeholder; replace it with a real runtime secret before deployment.`);
    }
  }
}
