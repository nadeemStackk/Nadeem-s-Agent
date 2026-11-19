/** @type {import('next').NextConfig} */
const nextConfig = {
  // Make sure the profile file is shipped with the chat API when deployed (e.g. on Vercel)
  outputFileTracingIncludes: {
    '/api/chat': ['./data/**/*'],
  },
};

export default nextConfig;
