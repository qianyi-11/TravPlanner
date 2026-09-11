import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { isDemoAuthEnabled } from "@/lib/server/demo-auth";
import { prisma } from "@/lib/server/prisma";

const demoProvider = Credentials({
  id: "demo",
  name: "TravPlanner demo user",
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
  providers: isDemoAuthEnabled() ? [demoProvider] : [],
  session: { strategy: "jwt" },
  callbacks: {
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
