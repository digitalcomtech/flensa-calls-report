import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

function assertPostHogBuildConfig(env) {
  if (env.VITE_ENABLE_POSTHOG !== 'true') {
    return;
  }

  const key = String(env.VITE_POSTHOG_KEY || '').trim();
  if (!key.startsWith('phc_')) {
    const prefix = key ? key.slice(0, 8) : '(missing)';
    throw new Error(
      `PostHog analytics misconfigured (build): VITE_POSTHOG_KEY must start with "phc_" (got ${prefix})`
    );
  }
}

export default defineConfig(({ mode }) => {
  assertPostHogBuildConfig(process.env);

  return {
  plugins: [react()],
  root: 'client',
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://localhost:3001',
    },
  },
  build: {
    outDir: '../dist/client',
    emptyOutDir: true,
  },
  };
});
