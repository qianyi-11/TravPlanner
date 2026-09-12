import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import { getServerEnv } from "@/lib/server/env";
import { provisionGoogleMember } from "@/lib/server/auth-identities";

const env = getServerEnv();

export const { handlers, auth, signIn, signOut } = NextAuth({
  secret: env.authSecret,
  trustHost: true,
  providers: [
    ...(env.googleClientId && env.googleClientSecret
      ? [Google({ clientId: env.googleClientId, clientSecret: env.googleClientSecret })]
      : []),
  ],
  session: { strategy: "jwt" },
  callbacks: {
    async signIn({ user, account }) {
      if (account?.provider !== "google") return true;
      if (!account.providerAccountId) return false;
      user.memberId = await provisionGoogleMember({
        providerAccountId: account.providerAccountId,
        email: user.email,
        name: user.name,
      });
      return true;
    },
    jwt({ token, user }) {
      if (user?.memberId) token.memberId = user.memberId;
      return token;
    },
    session({ session, token }) {
      if (session.user) session.user.memberId = typeof token.memberId === "string" ? token.memberId : undefined;
      return session;
    },
  },
});
