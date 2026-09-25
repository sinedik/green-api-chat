/// <reference types="vitest/config" />
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  // Относительные пути — сборка работает и на GitHub Pages в подкаталоге
  base: './',
  plugins: [react(), tailwindcss()],
  test: {
    environment: 'node',
  },
})
