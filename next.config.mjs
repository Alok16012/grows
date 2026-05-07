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
            {
                source: "/_next/static/:path*",
                headers: [
                    { key: "Cache-Control", value: "public, max-age=31536000, immutable" },
                ],
            },
            {
                source: "/((?!_next/static|_next/image|favicon.ico).*)",
                headers: [
                    { key: "Cache-Control", value: "no-store, must-revalidate" },
                ],
            },
        ]
    },
};

export default nextConfig;
