import { fileURLToPath } from 'node:url'

const rootDir = fileURLToPath(new URL('.', import.meta.url))

/** @type {import('next').NextConfig} */
const nextConfig = {
  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
    unoptimized: true,
  },
  turbopack: {
    root: rootDir,
  },
  async redirects() {
    return [
      // Renamed from /shopshop to /shop/summary. Keep the old path alive so any
      // link already shared still lands on the case study.
      { source: '/shopshop', destination: '/shop/summary', permanent: true },
    ]
  },
}

export default nextConfig
