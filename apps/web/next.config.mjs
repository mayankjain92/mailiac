/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ['@mailiac/shared-types'],
  eslint: {
    ignoreDuringBuilds: true,
  },
  async rewrites() {
    return [
      {
        source: '/api/:path*',
        destination: 'http://localhost:4000/api/:path*',
      },
    ];
  },
};

export default nextConfig;
