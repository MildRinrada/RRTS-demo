import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';

/**
 * The site never shows an em dash or a middle dot. A library can still carry one inside its own
 * strings (ExcelJS's XML parser lists the middle dot as a name character); written as a \u escape
 * it means the same to JavaScript and the character itself never ships.
 */
function escapeBannedCharacters(): Plugin {
  const banned = /[—·]/g;
  const escape = (c: string) => `\\u${c.charCodeAt(0).toString(16).padStart(4, '0')}`;
  return {
    name: 'escape-banned-characters',
    // After minifying, which would turn the escapes back into the characters.
    generateBundle(_, bundle) {
      for (const file of Object.values(bundle)) {
        if (file.type === 'chunk') file.code = file.code.replace(banned, escape);
      }
    },
  };
}

// A static site: relative asset paths and a hash router, so it runs from any folder on any static host.
export default defineConfig({
  base: './',
  plugins: [react(), escapeBannedCharacters()],
  server: { port: 5190, strictPort: true, host: true },
  preview: { port: 5191, strictPort: true },
  build: { sourcemap: false, chunkSizeWarningLimit: 1100 },
});
