import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv } from 'vite'

export default defineConfig(({ mode }) => {
  // Vite embeds public VITE_* values at build time. Load them explicitly so
  // Netlify builds and local builds resolve the same value from the frontend base.
  const env = loadEnv(mode, process.cwd(), 'VITE_')
  const vapidPublicKey = (process.env.VITE_VAPID_PUBLIC_KEY || env.VITE_VAPID_PUBLIC_KEY || '').trim()

  // Do not allow a deploy that looks successful while shipping a bundle that
  // can never create a push subscription. Local builds remain usable without push.
  if (process.env.NETLIFY === 'true' && !vapidPublicKey) {
    throw new Error(
      'Missing VITE_VAPID_PUBLIC_KEY in the Netlify build environment. Set its scope to include Builds and redeploy.',
    )
  }

  return {
    plugins: [react()],
    define: {
      'import.meta.env.VITE_VAPID_PUBLIC_KEY': JSON.stringify(vapidPublicKey),
    },
  }
})
