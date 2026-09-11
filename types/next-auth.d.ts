import type { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface Session {
    user: DefaultSession["user"] & { memberId?: string };
  }

  interface User {
    memberId?: string;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    memberId?: string;
  }
}
