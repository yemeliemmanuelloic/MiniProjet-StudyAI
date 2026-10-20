import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { simulerApi } from './api-factice';

/**
 * Audit d'accessibilite automatise (axe-core), regles WCAG 2.1 A et AA.
 *
 * Il ne remplace pas un essai au clavier ou au lecteur d'ecran : il attrape
 * ce qui se mesure (contrastes, libelles, roles, hierarchie des titres).
 */

const PUBLIQUES = ['/', '/connexion', '/inscription', '/a-propos', '/aide', '/faq', '/contact', '/mentions-legales', '/confidentialite', '/conditions'];
const PRIVEES = ['/cours', '/cours/c-1', '/examen', '/compte'];

async function auditer(page: import('@playwright/test').Page) {
  // Les animations d'entree faussent la mesure des contrastes.
  await page.addStyleTag({ content: '*{animation:none!important;transition:none!important}' });
  const r = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
  return r.violations.map((v) => `${v.id} (${v.impact}) : ${v.nodes.length} element(s) — ${v.nodes[0]?.target.join(' ')}`);
}

for (const chemin of PUBLIQUES) {
  test(`accessibilite ${chemin}`, async ({ page }) => {
    await simulerApi(page);
    await page.goto(chemin);
    await page.locator('main').first().waitFor();
    expect(await auditer(page)).toEqual([]);
  });
}

for (const chemin of PRIVEES) {
  test(`accessibilite ${chemin} (connecte)`, async ({ page }) => {
    await simulerApi(page, { connecte: true, cours: [{ id: 'c-1', title: 'Réseaux' }, { title: 'Algorithmique' }] });
    await page.goto(chemin);
    await page.locator('main').first().waitFor();
    await page.waitForLoadState('networkidle');
    expect(await auditer(page)).toEqual([]);
  });
}
