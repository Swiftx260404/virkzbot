import type { NextAuthOptions, Session } from 'next-auth';
import DiscordProvider from 'next-auth/providers/discord';
import { prisma } from './prisma';

const ADMIN_USER_ID = process.env.ADMIN_USER_ID;

export const authOptions: NextAuthOptions = {
  secret: process.env.NEXTAUTH_SECRET,
  session: {
    strategy: 'jwt',
  },
  pages: {
    signIn: '/login',
  },
  providers: [
    DiscordProvider({
      clientId: process.env.DISCORD_CLIENT_ID ?? '',
      clientSecret: process.env.DISCORD_CLIENT_SECRET ?? '',
      authorization: {
        params: {
          scope: 'identify',
        },
      },
    }),
  ],
  callbacks: {
    async signIn({ user, profile }) {
      if (!user?.id) {
        return false;
      }
      await prisma.user.upsert({
        where: { id: user.id },
        update: {
          metadata: profile ? { set: { discord: profile } } : undefined,
        },
        create: {
          id: user.id,
          metadata: profile ? { discord: profile } : undefined,
        },
      });
      return true;
    },
    async jwt({ token, user }) {
      if (user?.id) {
        token.sub = user.id;
        token.isAdmin = ADMIN_USER_ID ? user.id === ADMIN_USER_ID : false;
      }
      if (token.sub && ADMIN_USER_ID) {
        token.isAdmin = token.sub === ADMIN_USER_ID;
      }
      return token;
    },
    async session({ session, token }) {
      if (!token.sub) {
        return session;
      }
      const userSession = (session.user ?? {}) as NonNullable<Session['user']>;
      userSession.id = token.sub;
      userSession.isAdmin = Boolean(token.isAdmin);
      userSession.name = userSession.name ?? '';
      session.user = userSession;
      return session;
    },
  },
};

export type PanelSession = Session & {
  user: Session['user'] & { id: string; isAdmin?: boolean };
};
