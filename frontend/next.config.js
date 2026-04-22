/** @type {import('next').NextConfig} */
const nextConfig = {
  // Enable standalone output for Docker
  output: 'standalone',
  
  // 禁用 Turbopack，使用 Webpack（Turbopack 有已知问题）
  // turbopack: false, // 在 next.config 中不需要设置，通过命令行控制
  
  async rewrites() {
    return [
      {
        source: '/api/:path*',
        // In Docker, use service name; in dev, use localhost
        destination: process.env.NODE_ENV === 'production' 
          ? 'http://backend:8000/api/:path*'
          : 'http://localhost:8000/api/:path*',
      },
    ];
  },
};

module.exports = nextConfig;
