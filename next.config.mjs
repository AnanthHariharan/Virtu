/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // the floating dev badge sits exactly on top of the first navigation tab
  devIndicators: false,
  async headers() {
    return [
      {
        // The service worker must never be served stale, and it must be
        // allowed to claim the whole origin rather than just /.
        source: "/sw.js",
        headers: [
          { key: "Cache-Control", value: "public, max-age=0, must-revalidate" },
          { key: "Service-Worker-Allowed", value: "/" },
        ],
      },
    ];
  },
};

export default nextConfig;
