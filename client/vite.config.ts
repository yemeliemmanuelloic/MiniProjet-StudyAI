/// <reference types="vitest" />
import { defineConfig, loadEnv, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import {
  balisesTete,
  genererRobots,
  genererSitemap,
  indexable,
  normaliserSite,
} from './src/lib/referencement';
import { EQUIPE } from './src/lib/site';

/**
 * Referencement a la construction (lot G) : robots.txt, sitemap.xml et
 * balises de index.html, selon VITE_SITE_URL et VITE_INDEXATION.
 * Voir src/lib/referencement.ts.
 */
function referencement(env: Record<string, string>): Plugin {
  const site = normaliserSite(env.VITE_SITE_URL);
  const ouvert = indexable(site, env.VITE_INDEXATION);
  return {
    name: 'studyai-referencement',
    transformIndexHtml(html) {
      return html.replace('</head>', `${balisesTete(site, ouvert, EQUIPE)}\n  </head>`);
    },
    generateBundle() {
      this.emitFile({ type: 'asset', fileName: 'robots.txt', source: genererRobots(site, ouvert) });
      // Un sitemap n'a de sens que pour un site ouvert, et exige des
      // adresses absolues.
      if (ouvert && site) {
        const jour = new Date().toISOString().slice(0, 10);
        this.emitFile({ type: 'asset', fileName: 'sitemap.xml', source: genererSitemap(site, jour) });
      }
    },
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), 'VITE_');
  return {
    plugins: [react(), referencement(env)],
    server: { port: 5174 },
    test: {
      // `environment` reste sur node par defaut : les tests de logique pure
      // n'ont pas besoin d'un DOM, et jsdom coute une seconde au demarrage.
      // Les fichiers qui montent des composants declarent eux-memes
      // `// @vitest-environment jsdom` en tete.
      globals: true,
      include: ['src/**/*.test.{ts,tsx}'],
    },
  };
});
