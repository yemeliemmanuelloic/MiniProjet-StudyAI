import { defineConfig } from '@playwright/test';

/**
 * Tests de bout en bout (lot H, 20 octobre).
 *
 * Ils pilotent le VRAI front dans un vrai navigateur, mais face a une API
 * SIMULEE (e2e/api-factice.ts) : aucun appel a Supabase ni a Gemini, donc
 * aucun cout, aucune donnee ecrite, et des resultats qui ne dependent ni du
 * reseau ni de l'humeur du modele.
 *
 * Navigateur : le Chrome deja installe sur la machine (`channel: 'chrome'`),
 * pour ne rien telecharger. Lancement : `npm run e2e`.
 */
const PORT = 5180;

export default defineConfig({
  testDir: 'e2e',
  fullyParallel: true,
  retries: 0,
  reporter: [['list']],
  use: {
    baseURL: `http://localhost:${PORT}`,
    channel: 'chrome',
    locale: 'fr-FR',
    trace: 'retain-on-failure',
  },
  webServer: {
    // L'adresse de l'API pointe vers un domaine reserve aux tests (.test) :
    // si une requete echappait a la simulation, elle echouerait au lieu
    // d'atteindre un vrai serveur.
    command: `npx vite --port ${PORT} --strictPort`,
    port: PORT,
    reuseExistingServer: false,
    env: { VITE_API_URL: 'http://api.studyai.test/api' },
  },
  projects: [
    { name: 'bureau', use: { viewport: { width: 1280, height: 800 } } },
    { name: 'mobile', use: { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true } },
  ],
});
