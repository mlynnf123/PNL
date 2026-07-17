import type { DefaultSession } from 'next-auth';

declare module 'next-auth' {
  interface User {
    organizationId: string;
    userType: string;
    sessionVersion: number;
  }

  interface Session {
    user: {
      id: string;
      organizationId: string;
      userType: string;
    } & DefaultSession['user'];
  }
}

declare module '@auth/core/jwt' {
  interface JWT {
    id?: string;
    organizationId?: string;
    userType?: string;
    sessionVersion?: number;
  }
}
