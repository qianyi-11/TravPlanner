export const DEMO_AUTH_COOKIE = "travplanner_demo_user";

export function isDemoAuthEnabled(environment: NodeJS.ProcessEnv = process.env) {
  return environment.AUTH_DEMO_ENABLED === "true" && environment.NODE_ENV !== "production";
}
