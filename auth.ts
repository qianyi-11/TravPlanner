import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import Google from "next-auth/providers/google";
import { isDemoAuthEnabled } from "@/lib/server/demo-auth";
import { getServerEnv } from "@/lib/server/env";
import { provisionGoogleMember } from "@/lib/server/auth-identities";
import { prisma } from "@/lib/server/prisma";

const env = getServerEnv();

const demoProvider = Credentials({
  id: "demo",
  name: "Trippy demo user",
  credentials: {
    memberId: { label: "Member ID", type: "text" },
  },
  async authorize(credentials) {
    if (typeof credentials.memberId !== "string") return null;
    const memberId = credentials.memberId.trim();
    if (!memberId || memberId.length > 200) return null;

    const member = await prisma.member.findUnique({ where: { id: memberId } });
    if (!member) return null;
    return { id: member.id, name: member.name, memberId: member.id };
  },
});

export const { handlers, auth, signIn, signOut } = NextAuth({
  secret: env.authSecret,
  trustHost: true,
  providers: [
    ...(env.googleClientId && env.googleClientSecret
      ? [Google({ clientId: env.googleClientId, clientSecret: env.googleClientSecret })]
      : []),
    ...(isDemoAuthEnabled() ? [demoProvider] : []),
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
