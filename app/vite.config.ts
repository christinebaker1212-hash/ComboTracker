import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
  // Relative paths so the build works from any folder, a file:// URL, or the Tauri shell.
  base: './',
  plugins: [react()],
})
