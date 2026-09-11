export interface ServerEnv {
  nodeEnv: string;
  databaseUrl: string | undefined;
  authSecret: string | undefined;
  googleClientId: string | undefined;
  googleClientSecret: string | undefined;
  googlePlacesServerApiKey: string | undefined;
  mapsBrowserApiKey: string | undefined;
  authDemoEnabled: boolean;
  appUrl: string | undefined;
  buildVersion: string;
}

export function getServerEnv(environment: NodeJS.ProcessEnv = process.env): ServerEnv {
  return {
    nodeEnv: environment.NODE_ENV ?? "development",
    databaseUrl: environment.DATABASE_URL,
    authSecret: environment.AUTH_SECRET,
    googleClientId: environment.AUTH_GOOGLE_ID ?? environment.AUTH_GOOGLE_CLIENT_ID,
    googleClientSecret: environment.AUTH_GOOGLE_SECRET ?? environment.AUTH_GOOGLE_CLIENT_SECRET,
    googlePlacesServerApiKey:
      environment.GOOGLE_PLACES_SERVER_API_KEY ?? environment.GOOGLE_MAPS_SERVER_API_KEY ?? environment.GOOGLE_PLACES_API_KEY,
    mapsBrowserApiKey: environment.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY,
    authDemoEnabled: environment.AUTH_DEMO_ENABLED === "true",
    appUrl: environment.AUTH_URL ?? environment.NEXTAUTH_URL,
    buildVersion: environment.VERCEL_GIT_COMMIT_SHA ?? environment.NEXT_PUBLIC_APP_VERSION ?? "local",
  };
}

export function assertProductionEnv(environment: NodeJS.ProcessEnv = process.env): ServerEnv {
  const env = getServerEnv(environment);
  if (env.nodeEnv !== "production") return env;

  const missing = [
    ["AUTH_SECRET", env.authSecret],
    ["AUTH_GOOGLE_ID", env.googleClientId],
    ["AUTH_GOOGLE_SECRET", env.googleClientSecret],
    ["DATABASE_URL", env.databaseUrl],
    ["NEXT_PUBLIC_GOOGLE_MAPS_API_KEY", env.mapsBrowserApiKey],
    ["GOOGLE_PLACES_SERVER_API_KEY", env.googlePlacesServerApiKey],
  ].filter(([, value]) => !value).map(([name]) => name);

  if (env.authDemoEnabled) missing.push("AUTH_DEMO_ENABLED must not be true in production");
  if (env.databaseUrl && !/^(postgres|postgresql):\/\//.test(env.databaseUrl)) {
    missing.push("DATABASE_URL must use PostgreSQL in production");
  }
  if (missing.length) throw new Error(`Production configuration is incomplete: ${missing.join(", ")}`);
  return env;
}
