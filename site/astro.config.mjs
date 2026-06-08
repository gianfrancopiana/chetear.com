// @ts-check
import { defineConfig } from 'astro/config';
import vercel from '@astrojs/vercel';
import react from '@astrojs/react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  site: 'https://chetear.com',
  adapter: vercel({ skewProtection: true }),
  integrations: [react()],
  prefetch: {
    prefetchAll: false,
    defaultStrategy: 'tap',
  },
  redirects: {
    "/descuentos": "/",
  },
  vite: {
    plugins: [tailwindcss()],
  },
  image: {
    service: { entrypoint: 'astro/assets/services/noop' },
  },
});
