import { expect, test } from '@playwright/test';
import { simulerApi } from './api-factice';

/**
 * Aucun lien interne casse : chaque lien des pages publiques est suivi, et
 * aucune destination ne doit tomber sur « Page introuvable ».
 */
test('liens internes des pages publiques', async ({ page }) => {
  test.skip(test.info().project.name !== 'bureau', 'un seul passage suffit');
  await simulerApi(page);
  const aVisiter = ['/'];
  const vus = new Set<string>();
  const casses: string[] = [];
  while (aVisiter.length) {
    const chemin = aVisiter.shift()!;
    if (vus.has(chemin)) continue;
    vus.add(chemin);
    await page.goto(chemin);
    await page.locator('main').first().waitFor();
    if (await page.getByRole('heading', { name: 'Page introuvable' }).count()) casses.push(chemin);
    const liens = await page.$$eval('a[href^="/"]', (as) => as.map((a) => a.getAttribute('href')!));
    for (const l of liens) {
      const propre = l.split(/[?#]/)[0];
      if (!vus.has(propre)) aVisiter.push(propre);
    }
  }
  expect(casses).toEqual([]);
  // Garde-fou : l'exploration a bien parcouru le site.
  expect(vus.size).toBeGreaterThanOrEqual(10);
});
