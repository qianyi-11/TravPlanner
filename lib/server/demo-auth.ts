import { getServerEnv } from "./env";

export const DEMO_AUTH_COOKIE = "travplanner_demo_user";

export function isDemoAuthEnabled(environment: NodeJS.ProcessEnv = process.env) {
  const env = getServerEnv(environment);
  return env.authDemoEnabled && env.nodeEnv !== "production";
}
