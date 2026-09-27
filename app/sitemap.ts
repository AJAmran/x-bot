import type { MetadataRoute } from 'next';

export default function sitemap(): MetadataRoute.Sitemap {
    const base = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, '') ?? 'https://fourseason-dhanmondi.com';

    return [
        { url: base, changeFrequency: 'weekly', priority: 1 },
    ];
}
