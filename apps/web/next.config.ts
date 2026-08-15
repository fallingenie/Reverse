import type {NextConfig} from 'next';

const isGitHubPages = process.env.GITHUB_PAGES === 'true';
const repositoryName = process.env.GITHUB_REPOSITORY?.split('/')[1] ?? 'Reverse';
const basePath = isGitHubPages ? `/${repositoryName}` : '';

const nextConfig: NextConfig = {
  agentRules: false,
  env: {
    NEXT_PUBLIC_BASE_PATH: basePath,
    NEXT_PUBLIC_STATIC_EXPORT: isGitHubPages ? 'true' : 'false',
  },
  ...(isGitHubPages
    ? {
        assetPrefix: basePath,
        basePath,
        output: 'export',
        trailingSlash: true,
      }
    : {}),
  poweredByHeader: false,
  reactStrictMode: true,
};

export default nextConfig;
