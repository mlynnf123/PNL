import { eq } from 'drizzle-orm';
import NextAuth from 'next-auth';
import Credentials from 'next-auth/providers/credentials';
import { db } from '@/db/client';
import { users } from '@/db/schema';
import { verifyPassword } from '@/lib/password';

export const { handlers, signIn, signOut, auth } = NextAuth({
  session: { strategy: 'jwt' },
  providers: [
    Credentials({
      credentials: {
        email: {},
        password: {},
      },
      authorize: async (credentials) => {
        const email = credentials?.email;
        const password = credentials?.password;
        if (typeof email !== 'string' || typeof password !== 'string') {
          return null;
        }

        const [user] = await db
          .select()
          .from(users)
          .where(eq(users.email, email.toLowerCase()))
          .limit(1);

        if (!user || !user.active) {
          return null;
        }

        const passwordValid = await verifyPassword(password, user.passwordHash);
        if (!passwordValid) {
          return null;
        }

        return {
          id: user.id,
          email: user.email,
          name: user.displayName,
          organizationId: user.organizationId,
          userType: user.userType,
          sessionVersion: user.sessionVersion,
        };
      },
    }),
  ],
  callbacks: {
    // See docs/07 ADR-002: session_version is checked on every request so
    // that incrementing it (logout-everywhere, deactivation) invalidates
    // previously issued JWTs immediately, without database-backed sessions.
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.organizationId = user.organizationId;
        token.userType = user.userType;
        token.sessionVersion = user.sessionVersion;
      }

      if (!token.id) {
        return null;
      }

      const [current] = await db
        .select({ sessionVersion: users.sessionVersion, active: users.active })
        .from(users)
        .where(eq(users.id, token.id))
        .limit(1);

      if (!current || !current.active || current.sessionVersion !== token.sessionVersion) {
        return null;
      }

      return token;
    },
    async session({ session, token }) {
      if (token.id && token.organizationId && token.userType) {
        session.user.id = token.id;
        session.user.organizationId = token.organizationId;
        session.user.userType = token.userType;
      }
      return session;
    },
  },
});
