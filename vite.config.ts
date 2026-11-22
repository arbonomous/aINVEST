import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  plugins: [react()],
  build: {
    rolldownOptions: {
      output: {
        codeSplitting: {
          groups: [
            {
              name: 'react-vendor',
              test: /node_modules[\\/](react|react-dom|scheduler)/,
              priority: 20,
            },
            {
              name: 'charts-vendor',
              test: /node_modules[\\/]lightweight-charts/,
              priority: 18,
            },
            {
              name: 'icons-vendor',
              test: /node_modules[\\/]lucide-react/,
              priority: 15,
            },
          ],
        },
      },
    },
  },
});
