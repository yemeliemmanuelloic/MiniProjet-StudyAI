import { expect, test } from '@playwright/test';
import { COMPTE, simulerApi } from './api-factice';

/**
 * Parcours complets, du point de vue de l'etudiant.
 *
 * Les tests unitaires verifient des fonctions ; ceux-ci verifient que les
 * ecrans s'enchainent : un bouton mal branche, une redirection perdue ou un
 * message qui ne s'affiche pas ne se voient qu'ici.
 */

const CONTENU = 'Ordonnancement des processus. '.repeat(12);

test('inscription : la case des conditions conditionne le bouton, puis bienvenue', async ({ page }) => {
  await simulerApi(page);
  await page.goto('/inscription');
  await page.getByLabel('Adresse électronique').fill('nouvelle@exemple.test');
  await page.getByLabel('Mot de passe').fill('un-mot-de-passe');
  const bouton = page.getByRole('button', { name: 'Créer mon compte' });
  await expect(bouton).toBeDisabled();
  await page.locator('.case-cgu input[type="checkbox"]').check();
  await bouton.click();
  await expect(page).toHaveURL(/\/cours$/);
  await expect(page.getByText('Bienvenue sur StudyAI')).toBeVisible();
});

test('page reservee : « connexion requise », puis retour a la page demandee', async ({ page }) => {
  await simulerApi(page, { cours: [{ title: 'Algorithmique' }] });
  await page.goto('/examen');
  await expect(page).toHaveURL(/\/connexion$/);
  await expect(page.getByText('Connectez-vous pour accéder à cette page')).toBeVisible();
  await page.getByLabel('Adresse électronique').fill(COMPTE.email);
  await page.getByLabel('Mot de passe').fill(COMPTE.motDePasse);
  await page.getByRole('button', { name: 'Se connecter' }).click();
  await expect(page).toHaveURL(/\/examen$/);
});

test('mauvais mot de passe : message clair, on reste sur la connexion', async ({ page }) => {
  await simulerApi(page);
  await page.goto('/connexion');
  await page.getByLabel('Adresse électronique').fill(COMPTE.email);
  await page.getByLabel('Mot de passe').fill('pas-le-bon');
  await page.getByRole('button', { name: 'Se connecter' }).click();
  await expect(page.getByRole('alert')).toBeVisible();
  await expect(page).toHaveURL(/\/connexion$/);
});

test('ajouter puis supprimer un cours, avec confirmation', async ({ page }) => {
  await simulerApi(page, { connecte: true });
  await page.goto('/cours');
  await page.getByRole('button', { name: 'Ajouter un cours' }).first().click();
  await page.getByLabel('Titre du cours').fill('Systèmes d’exploitation');
  await page.getByLabel('Contenu du cours').fill(CONTENU);
  await page.getByRole('button', { name: 'Enregistrer le cours' }).click();
  await expect(page.getByText('« Systèmes d’exploitation » a été ajouté.')).toBeVisible();

  await page.goto('/cours');
  const supprimer = page.getByRole('button', { name: 'Supprimer Systèmes d’exploitation' });
  // Annuler ne supprime rien.
  await supprimer.click();
  await page.getByRole('dialog').getByRole('button', { name: 'Annuler' }).click();
  await expect(supprimer).toBeVisible();
  // Confirmer supprime.
  await supprimer.click();
  await page.getByRole('dialog').getByRole('button', { name: 'Supprimer le cours' }).click();
  await expect(page.getByText('« Systèmes d’exploitation » a été supprimé.')).toBeVisible();
  await expect(supprimer).toHaveCount(0);
});

test('resume puis quiz sur un cours', async ({ page }) => {
  await simulerApi(page, { connecte: true, cours: [{ id: 'c-1', title: 'Réseaux', content: CONTENU }] });
  await page.goto('/cours/c-1');
  await page.getByRole('button', { name: 'Résumer mon cours' }).click();
  await expect(page.getByRole('heading', { name: 'Synthèse' })).toBeVisible();
  await expect(page.getByText('Premier point cle')).toBeVisible();

  await page.getByRole('tab', { name: /Quiz/ }).or(page.getByRole('link', { name: /^Quiz/ })).first().click();
  await page.getByRole('button', { name: 'Générer un quiz' }).click();
  const bonnes = page.getByRole('button', { name: /Bonne reponse/ });
  await expect(bonnes).toHaveCount(3);
  for (const b of await bonnes.all()) await b.click();
  await page.getByRole('button', { name: 'Valider mes réponses' }).click();
  await expect(page.getByRole('heading', { name: 'Résultat' })).toBeVisible();
});

test('tuteur : conversations, nouvelle conversation, retour a une ancienne, suppression', async ({ page, isMobile }) => {
  test.skip(isMobile, 'sur telephone, la liste devient un menu deroulant');
  await simulerApi(page, { connecte: true, cours: [{ id: 'c-1', title: 'Réseaux', content: CONTENU }] });
  await page.goto('/cours/c-1?onglet=chat');
  const champ = page.getByLabel('Votre question');
  await champ.fill('Qu’est-ce que le protocole TCP ?');
  await page.getByRole('button', { name: 'Envoyer' }).click();
  await expect(page.getByText('Réponse simulée à : Qu’est-ce que le protocole TCP ?')).toBeVisible();
  const liste = page.getByRole('complementary', { name: 'Conversations' });
  await expect(liste.locator('.tuteur-conv-ouvrir', { hasText: 'protocole TCP' })).toBeVisible();

  // Nouvelle conversation : le fil se vide, une seconde question en ouvre une autre.
  await liste.getByRole('button', { name: /Nouvelle conversation/ }).click();
  await expect(page.getByText('Réponse simulée à : Qu’est-ce que le protocole TCP ?')).toHaveCount(0);
  await champ.fill('Et le protocole UDP ?');
  await page.getByRole('button', { name: 'Envoyer' }).click();
  await expect(page.getByText('Réponse simulée à : Et le protocole UDP ?')).toBeVisible();
  await expect(liste.locator('.tuteur-conv-ouvrir')).toHaveCount(2);

  // Retour a la premiere : son fil revient.
  await liste.locator('.tuteur-conv-ouvrir', { hasText: 'protocole TCP' }).click();
  await expect(page.getByText('Réponse simulée à : Qu’est-ce que le protocole TCP ?')).toBeVisible();

  // Suppression, avec confirmation.
  await liste.getByRole('button', { name: /Supprimer la conversation « Et le protocole UDP/ }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Supprimer la conversation' }).click();
  await expect(page.getByText('Conversation supprimée.')).toBeVisible();
  await expect(liste.locator('.tuteur-conv-ouvrir')).toHaveCount(1);
});

test('erreur du modele (LLM_KEY_MISSING, 503) : le code est affiche, pas « serveur injoignable »', async ({ page }) => {
  await simulerApi(page, {
    connecte: true,
    cours: [{ id: 'c-1', title: 'Réseaux', content: CONTENU }],
    erreurResume: { statut: 503, code: 'LLM_KEY_MISSING', message: 'Clé absente.' },
  });
  await page.goto('/cours/c-1');
  await page.getByRole('button', { name: 'Résumer mon cours' }).click();
  await expect(page.getByText('LLM_KEY_MISSING')).toBeVisible();
  await expect(page.locator('.bandeau-injoignable')).toHaveCount(0);
});

test('serveur hors service : la session est conservee et l on peut reessayer', async ({ page }) => {
  await simulerApi(page, { connecte: true });
  // La passerelle de l'hebergeur repond a la place de l'API.
  const PANNE = /api\.studyai\.test\/api\/(auth\/me|health)$/;
  await page.route(PANNE, (r) =>
    r.fulfill({ status: 503, contentType: 'text/html', body: '<html>Service Unavailable</html>' }),
  );
  await page.goto('/cours');
  await expect(page.getByRole('heading', { name: 'Service momentanément indisponible' })).toBeVisible();
  await expect(page.locator('.bandeau-injoignable')).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem('token'))).not.toBeNull();

  await page.unroute(PANNE);
  await page.getByRole('main').getByRole('button', { name: 'Réessayer' }).click();
  await expect(page.getByRole('heading', { name: 'Mes cours', level: 1 })).toBeVisible();
});

test('adresse inconnue : page introuvable et titre d onglet', async ({ page }) => {
  await simulerApi(page);
  await page.goto('/nulle-part');
  await expect(page.getByRole('heading', { name: 'Page introuvable' })).toBeVisible();
  await expect(page).toHaveTitle('Page introuvable · StudyAI');
});

test('menu de compte : pastille, adresse, Mon activite, Echap', async ({ page, isMobile }) => {
  test.skip(isMobile, 'sur telephone, le panneau est deplie dans le menu replie');
  await simulerApi(page, { connecte: true, cours: [{ title: 'Réseaux' }] });
  await page.goto('/cours');
  const pastille = page.getByRole('button', { name: /Menu du compte/ });
  await expect(pastille).toHaveText('E');
  await pastille.click();
  await expect(page.getByText(COMPTE.email)).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(pastille).toHaveAttribute('aria-expanded', 'false');
  await expect(pastille).toBeFocused();
  await pastille.click();
  // Dans le panneau : « Voir mon activite → » de la page porte aussi ces mots.
  await page.locator('#compte-menu').getByRole('link', { name: 'Mon activité' }).click();
  await expect(page).toHaveURL(/\/compte\?onglet=activite$/);
  await expect(page.getByRole('heading', { name: 'Votre régularité' })).toBeVisible();
});

test('menu mobile : s ouvre, mene a la page, se referme', async ({ page, isMobile }) => {
  test.skip(!isMobile, 'menu burger affiche sous 720 px seulement');
  await simulerApi(page, { connecte: true });
  await page.goto('/cours');
  const burger = page.getByRole('button', { name: 'Ouvrir le menu' });
  await burger.click();
  await page.locator('#entete-menu').getByRole('link', { name: 'Examen blanc' }).click();
  await expect(page).toHaveURL(/\/examen$/);
  await expect(page.getByRole('button', { name: 'Ouvrir le menu' })).toHaveAttribute('aria-expanded', 'false');
});

test('texte source : depuis la tete, puis depuis une citation du quiz, passage surligne', async ({ page }) => {
  await simulerApi(page, {
    connecte: true,
    cours: [{ id: 'c-1', title: 'Réseaux', content: 'Introduction. Contenu du cours. Conclusion du chapitre.' }],
  });
  await page.goto('/cours/c-1');

  // Depuis la tete : le panneau s'ouvre, la recherche compte, Echap referme.
  const bouton = page.getByRole('button', { name: 'Texte source' });
  await bouton.click();
  const panneau = page.getByRole('dialog', { name: 'Texte source du cours' });
  await expect(panneau).toBeVisible();
  await panneau.getByRole('searchbox', { name: 'Rechercher dans le cours' }).fill('contenu');
  await expect(panneau.getByText('1 résultat(s)')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(panneau).toHaveCount(0);
  await expect(bouton).toBeFocused();

  // Depuis une citation du corrige : le passage cite est surligne.
  await page.getByRole('tab', { name: /Quiz/ }).click();
  await page.getByRole('button', { name: 'Générer un quiz' }).click();
  for (const b of await page.getByRole('button', { name: /Bonne reponse/ }).all()) await b.click();
  await page.getByRole('button', { name: 'Valider mes réponses' }).click();
  await page.getByRole('button', { name: 'Voir dans le cours' }).first().click();
  await expect(panneau.locator('mark.source-passage')).toHaveText('Contenu du cours.');
  await panneau.getByRole('button', { name: 'Fermer le texte source' }).click();
  await expect(panneau).toHaveCount(0);
});

test('accueil : le lien FAQ de l en-tete mene a la section, une question se deplie', async ({ page, isMobile }) => {
  test.skip(isMobile, 'sur telephone, les liens sont dans le menu replie');
  await simulerApi(page);
  await page.goto('/connexion');
  await page.getByRole('navigation', { name: 'Navigation principale' }).getByRole('link', { name: 'FAQ' }).click();
  await expect(page).toHaveURL(/\/#faq$/);
  await expect(page.getByRole('heading', { name: 'Vos questions, nos réponses' })).toBeInViewport();
  await page.getByText('StudyAI est-il gratuit ?').click();
  await expect(page.getByText(/Il n’y a ni abonnement, ni publicité/)).toBeVisible();
});
