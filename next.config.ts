import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async rewrites() {
    return [
      {
        source: '/api/chat',
        destination: 'https://relay-that-backend.vercel.app/api/chat',
      },
      {
        source: '/api/summarize',
        destination: 'https://relay-that-backend.vercel.app/api/summarize',
      },
      {
        source: '/api/regenerate',
        destination: 'https://relay-that-backend.vercel.app/api/regenerate',
      },
      {
        source: '/api/analyze',
        destination: 'https://relay-that-backend.vercel.app/api/analyze',
      },
    ];
  },
};

export default nextConfig;
