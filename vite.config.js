import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
  base: './',
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        robotics: resolve(__dirname, 'robotics.html'),
        '3d-design': resolve(__dirname, '3d-design.html')
      }
    }
  }
});
