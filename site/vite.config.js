import { defineConfig } from 'vite';

export default defineConfig({
  // relative asset URLs: works at a domain root (Netlify) and under a subpath (GitHub Pages)
  base: './',
  build: {
    target: 'es2022',
    assetsInlineLimit: 0,
  },
});
