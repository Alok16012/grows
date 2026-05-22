/** @type {import('next').NextConfig} */
const nextConfig = {
    compress: true,
    poweredByHeader: false,
    experimental: {
        optimizePackageImports: ["@radix-ui/react-icons", "recharts", "lucide-react", "date-fns"],
    },
    images: {
        formats: ["image/avif", "image/webp"],
        minimumCacheTTL: 604800, // 7 days
    },
    async headers() {
        return [
            // Long-cache static assets
            {
                source: "/_next/static/:path*",
                headers: [
                    { key: "Cache-Control", value: "public, max-age=31536000, immutable" },
                ],
            },
            // Auth endpoints must never be cached
            {
                source: "/api/auth/:path*",
                headers: [
                    { key: "Cache-Control", value: "no-store, must-revalidate" },
                ],
            },
            // Mutable API data — short revalidate window (allows browser back/forward cache,
            // RSC payload cache, and CDN revalidation)
            {
                source: "/api/:path*",
                headers: [
                    { key: "Cache-Control", value: "private, no-cache, must-revalidate" },
                ],
            },
        ]
    },
};

export default nextConfig;
