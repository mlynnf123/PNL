import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Pin the workspace root to this project. Without it, Turbopack walks up and
  // finds an unrelated package-lock.json in a parent directory (a separate
  // home-directory project) and infers the wrong root.
  turbopack: { root: __dirname },
  // Document + insurance-scope uploads post the file through a Server Action;
  // the default 1 MB body cap is too small for real PDFs.
  experimental: {
    serverActions: {
      bodySizeLimit: '25mb',
    },
  },
};

export default nextConfig;
