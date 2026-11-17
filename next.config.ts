import { execSync } from 'node:child_process';
import type { NextConfig } from 'next';

/** The commit being built, for /api/health (gap audit G-17); empty when the build has no git. */
const BUILD_SHA = (() => {
  if (process.env.GIT_SHA) return process.env.GIT_SHA;
  try {
    return execSync('git rev-parse --short HEAD', { stdio: ['ignore', 'pipe', 'ignore'] })
      .toString()
      .trim();
  } catch {
    return '';
  }
})();

const securityHeaders = [
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
  { key: 'X-Frame-Options', value: 'DENY' },
  // HTTPS only from now on (browsers ignore this on plain-http localhost).
  { key: 'Strict-Transport-Security', value: 'max-age=31536000' },
  // The parts of a Content-Security-Policy that can't break the app's own scripts: no plugins, no
  // <base> hijacking, no framing by other sites.
  {
    key: 'Content-Security-Policy',
    value: "object-src 'none'; base-uri 'self'; frame-ancestors 'none'",
  },
];

const nextConfig: NextConfig = {
  env: { BUILD_SHA },
  reactStrictMode: true,
  poweredByHeader: false,
  output: 'standalone',
  // Serverless Chromium ships a compressed binary that must stay on disk, not be bundled.
  serverExternalPackages: ['@sparticuz/chromium', 'puppeteer-core', 'unpdf', 'mammoth'],
  outputFileTracingIncludes: {
    '/api/pdf': ['./node_modules/@sparticuz/chromium/bin/**'],
    '/api/health': ['./node_modules/@sparticuz/chromium/bin/**'],
    // The standalone server only ships traced files; design thumbnails are served from public/
    // (fonts are traced through the PDF renderer). Without this they were 404 in production.
    '/templates': ['./public/templates/**'],
    // The link-preview image used by every page's <meta property="og:image">.
    '/': ['./public/og/**'],
    // The installable app: service worker and icons (served from public/).
    '/offline': ['./public/sw.js', './public/icons/**'],
  },
  async headers() {
    return [
      { source: '/:path*', headers: securityHeaders },
      // CV preview documents run in a sandboxed (opaque-origin) iframe and load fonts cross-origin.
      { source: '/fonts/:path*', headers: [{ key: 'Access-Control-Allow-Origin', value: '*' }] },
    ];
  },
};

export default nextConfig;
