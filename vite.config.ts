import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig, loadEnv} from 'vite';

export default defineConfig(({mode}) => {
  const env = loadEnv(mode, '.', '');
  return {
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      hmr: false,
    },
    build: {
      minify: 'terser',
      terserOptions: {
        compress: {
          drop_console: true,
          drop_debugger: true,
        },
        format: {
          comments: false,
        },
      },
      rollupOptions: {
        output: {
          manualChunks: {
            'vendor-react': ['react', 'react-dom'],
            'vendor-ui': ['lucide-react', 'motion'],
            'vendor-markdown': ['react-markdown'],
          },
          entryFileNames: 'js/[name].[hash].js',
          chunkFileNames: 'js/[name].[hash].js',
          assetFileNames: ({ name }: { name?: string }) => {
            if (name && /\.(gif|jpe?g|png|svg|webp)$/.test(name)) {
              return 'images/[name].[hash][extname]';
            } else if (name && /\.css$/.test(name)) {
              return 'css/[name].[hash][extname]';
            }
            return '[name].[hash][extname]';
          },
        },
      },
      sourcemap: false,
      reportCompressedSize: true,
      chunkSizeWarningLimit: 600,
    },
  };
});
