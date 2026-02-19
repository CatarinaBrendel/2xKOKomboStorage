import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  optimizeDeps: {
    include: ['@tauri-apps/api', '@tauri-apps/api/tauri', 'lucide-react']
  },
  server: {
    port: 5173
  }
})
