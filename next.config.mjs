/** @type {import('next').NextConfig} */
const nextConfig = {
    // A verification build can write elsewhere so it never clobbers the running
    // dev server's .next (NEXT_DIST_DIR=.next-build npx next build).
    distDir: process.env.NEXT_DIST_DIR || ".next",
    compress: true,
    poweredByHeader: false,
    // Lint runs with `npm run lint` (.eslintrc.json), not as part of the build.
    // The old eslint.config.mjs was never picked up by Next 14, so builds have
    // never linted; older code still has lint errors that would now fail every
    // Vercel deploy. Turn this off once `npm run lint` is clean.
    eslint: { ignoreDuringBuilds: true },
    // pdfjs-dist (LMS PDF viewer) has an optional Node-only "canvas" import;
    // the browser build must not try to bundle it.
    webpack: (config) => {
        config.resolve.alias = { ...(config.resolve.alias || {}), canvas: false }
        return config
    },
    experimental: {
        // @react-pdf/renderer ships ESM only. From Next 14.2.4+ the strict
        // default refuses it ("ESM packages need to be imported") when a page
        // dynamic-imports it (app/share/[token]); "loose" restores the 14.2.3
        // behaviour.
        esmExternals: "loose",
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
            {
                // Short-lived links to private files (lib/secure-files).
                protocol: "https",
                hostname: "xpopbdukjhgorfzhmuzd.supabase.co",
                pathname: "/storage/v1/object/sign/**",
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
