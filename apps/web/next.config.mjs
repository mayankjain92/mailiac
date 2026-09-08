/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ['@mailiac/shared-types'],
  eslint: {
    ignoreDuringBuilds: true,
  },
  async rewrites() {
    const rawUrl =
      process.env.API_URL ||
      process.env.NEXT_PUBLIC_API_URL ||
      (process.env.VERCEL ? 'https://mailiac.onrender.com' : 'http://localhost:4000');
    const backendUrl = rawUrl.replace(/\/+$/, '');
    return [
      {
        source: '/api/:path*',
        destination: `${backendUrl}/api/:path*`,
      },
    ];
  },
};

export default nextConfig;
