import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Pin the workspace root to this project. Without it, Turbopack walks up and
  // finds an unrelated package-lock.json in a parent directory (a separate
  // home-directory project) and infers the wrong root.
  turbopack: { root: __dirname },
};

export default nextConfig;
