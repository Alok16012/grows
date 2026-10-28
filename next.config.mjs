/** @type {import('next').NextConfig} */
const nextConfig = {
    // A verification build can write elsewhere so it never clobbers the running
    // dev server's .next (NEXT_DIST_DIR=.next-build npx next build).
    distDir: process.env.NEXT_DIST_DIR || ".next",
    compress: true,
    poweredByHeader: false,
    experimental: {
        optimizePackageImports: ["@radix-ui/react-icons", "recharts", "lucide-react", "date-fns"],
        // Client router cache: revisiting a page within 30s reuses the cached
        // RSC payload instead of re-rendering on the server — makes back/forward
        // and sidebar navigation feel instant.
        staleTimes: {
            dynamic: 30,
            static: 180,
        },
    },
    images: {
        formats: ["image/avif", "image/webp"],
        minimumCacheTTL: 604800, // 7 days
        remotePatterns: [
            {
                protocol: "https",
                hostname: "xpopbdukjhgorfzhmuzd.supabase.co",
                pathname: "/storage/v1/object/public/**",
            },
        ],
    },
    async headers() {
        return [
            // Long-cache static assets. Production only: production chunk names
            // carry a content hash, but dev chunks keep the same URL across
            // edits, so caching them for a year makes the browser run stale code.
            ...(process.env.NODE_ENV === "production" ? [{
                source: "/_next/static/:path*",
                headers: [
                    { key: "Cache-Control", value: "public, max-age=31536000, immutable" },
                ],
            }] : []),
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
