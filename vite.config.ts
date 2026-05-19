import path from 'path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  optimizeDeps: {
    include: [
      '@solana/wallet-adapter-phantom',
      '@solana/wallet-adapter-solflare',
    ],
    exclude: ['@solana/wallet-adapter-wallets'],
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@trading': path.resolve(__dirname, './trading/index.ts'),
    },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules')) {
            if (id.includes('recharts')) return 'charts'
            if (id.includes('framer-motion')) return 'motion'
            if (id.includes('@solana')) return 'solana'
            if (id.includes('react')) return 'vendor'
          }
        },
      },
    },
    sourcemap: false,
    chunkSizeWarningLimit: 1200,
  },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
      '/socket.io': {
        target: 'http://localhost:3001',
        ws: true,
      },
    },
  },
})
