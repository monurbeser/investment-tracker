/**
 * STATIC_EXPORT=1 builds a static site for GitHub Pages (no API routes; see
 * .github/workflows/pages.yml). NEXT_PUBLIC_BASE_PATH is the repo sub-path.
 * @type {import('next').NextConfig}
 */
const isStatic = process.env.STATIC_EXPORT === "1";
const basePath = process.env.NEXT_PUBLIC_BASE_PATH || "";

const nextConfig = {
  reactStrictMode: true,
  ...(isStatic ? { output: "export", basePath, trailingSlash: true, images: { unoptimized: true } } : {}),
};
export default nextConfig;
