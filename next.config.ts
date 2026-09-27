import type { NextConfig } from "next";

/**
 * Headers applied to every response.
 *
 * Framing needs care here. The widget's whole distribution channel is an iframe on someone
 * else's site, so `/embed` must be framable by anyone — but every other route should not be, or a
 * third party could overlay our checkout and click it on a guest's behalf. So framing is denied by
 * default and re-opened for that one path, rather than being denied everywhere and broken in the
 * one place it is the product.
 */
const securityHeaders = [
    { key: "X-Content-Type-Options", value: "nosniff" },
    { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
    { key: "X-DNS-Prefetch-Control", value: "on" },
    // The widget asks for the microphone (voice ordering) and nothing else.
    {
        key: "Permissions-Policy",
        value: "microphone=(self), camera=(), geolocation=(), payment=(), usb=()",
    },
    {
        key: "Strict-Transport-Security",
        // Only meaningful over TLS, and ignored over plain http, so it is safe to send always.
        value: "max-age=63072000; includeSubDomains; preload",
    },
];

const nextConfig: NextConfig = {
    async headers() {
        return [
            {
                /*
                 * Everything except the embeddable widget page. A negative lookahead in the path
                 * is the only way to say "all routes but this one" — the two header sets would
                 * otherwise both apply to /embed, and two CSP policies are intersected rather than
                 * overridden, so the stricter one would win and break the embed.
                 */
                source: "/:path((?!embed).*)",
                headers: [...securityHeaders, { key: "X-Frame-Options", value: "SAMEORIGIN" }],
            },
        ];
    },
    images: {
        remotePatterns: [
            {
                protocol: 'https',
                hostname: 'images.unsplash.com',
            },
        ],
    },
};

export default nextConfig;
