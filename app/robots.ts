import type { MetadataRoute } from 'next';

export default function robots(): MetadataRoute.Robots {
    return {
        rules: [
            {
                userAgent: '*',
                allow: '/',
                // The standalone widget is a page for other sites to frame, not something a
                // search result should send anyone to.
                disallow: ['/api/', '/embed'],
            },
        ],
    };
}
