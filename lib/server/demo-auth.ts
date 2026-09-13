import { getServerEnv } from "./env";

export const DEMO_AUTH_COOKIE = "travplanner_demo_user";
export const DEFAULT_DEMO_MEMBER_ID = "you";

export function getDemoMemberId(environment: NodeJS.ProcessEnv = process.env) {
  return getServerEnv(environment).authDemoMemberId ?? DEFAULT_DEMO_MEMBER_ID;
}

export function isDemoAuthEnabled(environment: NodeJS.ProcessEnv = process.env) {
  const env = getServerEnv(environment);
  return env.authDemoEnabled && (env.nodeEnv !== "production" || Boolean(env.authDemoMemberId));
}

export function isCompetitionDemoMember(memberId: string, environment: NodeJS.ProcessEnv = process.env) {
  return isDemoAuthEnabled(environment) && memberId === getDemoMemberId(environment);
}
