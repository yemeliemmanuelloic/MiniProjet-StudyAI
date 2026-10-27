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

test('connexion : l oeil affiche le mot de passe, le lien d oubli mene a la reponse de la FAQ', async ({ page }) => {
  await simulerApi(page);
  await page.goto('/connexion');
  const champ = page.getByLabel('Mot de passe');
  await champ.fill('secret-de-test');
  await expect(champ).toHaveAttribute('type', 'password');
  await page.getByRole('button', { name: 'Afficher les caractères saisis' }).click();
  await expect(champ).toHaveAttribute('type', 'text');
  await page.getByRole('button', { name: 'Masquer les caractères saisis' }).click();
  await expect(champ).toHaveAttribute('type', 'password');
  await page.getByRole('link', { name: 'Mot de passe oublié ?' }).click();
  await expect(page).toHaveURL(/\/faq#j-ai-oublie-mon-mot-de-passe$/);
  await expect(page.getByRole('heading', { name: 'J’ai oublié mon mot de passe.' })).toBeInViewport();
});


test('import d un enregistrement : avertissement, accord explicite, puis cours cree', async ({ page }) => {
  await simulerApi(page, { connecte: true });
  await page.goto('/cours');
  await page.getByRole('button', { name: 'Ajouter un cours' }).first().click();
  await page.getByRole('button', { name: 'Importer un fichier' }).click();
  await page.getByLabel('Titre').fill('Amphi du lundi');
  await page.getByLabel('Fichier du cours').setInputFiles({
    name: 'amphi.mp3',
    mimeType: 'audio/mpeg',
    buffer: Buffer.from('ID3 enregistrement simule'),
  });

  // L'avertissement nomme le destinataire, et l'envoi attend l'accord.
  await expect(page.getByText('Cet enregistrement sera transcrit par Whisper, chez Groq')).toBeVisible();
  const enregistrer = page.getByRole('button', { name: 'Enregistrer le cours' });
  await expect(enregistrer).toBeDisabled();
  await page.getByLabel('J’accepte que ce fichier soit envoyé sans masquage').check();
  await expect(enregistrer).toBeEnabled();
  await enregistrer.click();
  await expect(page.getByRole('link', { name: 'Amphi du lundi' }).first()).toBeVisible();
});


test('presentation narree : creer, avancer, mode audio, citation', async ({ page }) => {
  await simulerApi(page, { connecte: true, cours: [{ id: 'c-1', title: 'Réseaux', content: CONTENU }] });
  await page.goto('/cours/c-1?onglet=presentation');
  await page.getByRole('button', { name: 'Créer la présentation' }).click();
  await expect(page.getByText('Diapositive 1 sur 5')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Scène simulée 1' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Diapositive précédente' })).toBeDisabled();

  await page.getByRole('button', { name: 'Diapositive suivante' }).click();
  await expect(page.getByText('Diapositive 2 sur 5')).toBeVisible();
  await expect(page.getByText('Narration simulée de la scène 2')).toBeVisible();

  // Lecture : la voix naturelle de la scene est demandee au serveur ; sur 204,
  // le lecteur passe a la voix de l'appareil sans erreur.
  const voix = page.waitForRequest(/\/presentation\/[^/]+\/voice\/1$/);
  await page.getByRole('button', { name: 'Lire la présentation' }).click();
  await voix;
  await expect(page.getByRole('alert')).toHaveCount(0);
  await page.getByRole('button', { name: 'Mettre en pause' }).click();

  // Audio seul : la diapositive disparait, les sous-titres restent.
  await page.getByRole('button', { name: 'Audio seul' }).click();
  await expect(page.getByText('Diapositive 2 sur 5')).toHaveCount(0);
  await expect(page.getByText('Narration simulée de la scène 2')).toBeVisible();

  // La citation mene au texte source, passage surligne.
  await page.getByRole('button', { name: 'Voir dans le cours' }).click();
  await expect(page.getByRole('dialog', { name: 'Texte source du cours' })).toBeVisible();
});

test('plan de revision : creer, cocher une seance, ouvrir un cours', async ({ page }) => {
  await simulerApi(page, {
    connecte: true,
    cours: [
      { id: 'c-1', title: 'Réseaux', content: CONTENU },
      { id: 'c-2', title: 'Systèmes', content: CONTENU },
    ],
  });
  await page.goto('/plan');
  await expect(page.getByRole('heading', { name: 'Préparez votre examen' })).toBeVisible();
  const creer = page.getByRole('button', { name: 'Créer mon plan' });
  await expect(creer).toBeDisabled();

  await page.getByRole('checkbox', { name: 'Réseaux' }).check();
  await page.getByRole('checkbox', { name: 'Systèmes' }).check();
  const dans = new Date();
  dans.setDate(dans.getDate() + 3);
  await page.getByLabel('Date de l’examen').fill(
    `${dans.getFullYear()}-${String(dans.getMonth() + 1).padStart(2, '0')}-${String(dans.getDate()).padStart(2, '0')}`,
  );
  await creer.click();

  await expect(page.getByText('J-3')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Aujourd’hui' })).toBeVisible();
  const seance = page.getByRole('checkbox', { name: /Relire le résumé — Réseaux/ });
  await seance.check();
  await expect(page.getByText('1 sur 2')).toBeVisible();
  await expect(page.getByText('Passer un examen blanc')).toBeVisible();

  await page.getByRole('link', { name: 'Ouvrir' }).first().click();
  await expect(page).toHaveURL(/\/cours\/c-1\?onglet=resume/);
});

test('carte mentale : creer, choisir une idee, vue plan', async ({ page }) => {
  await simulerApi(page, { connecte: true, cours: [{ id: 'c-1', title: 'Réseaux', content: CONTENU }] });
  await page.goto('/cours/c-1?onglet=carte-mentale');
  await page.getByRole('button', { name: 'Créer la carte mentale' }).click();
  await expect(page.getByText('Cliquez sur une idée')).toBeVisible();

  // Une idee choisie affiche sa citation, qui ouvre le texte source.
  const vuePlan = page.getByRole('button', { name: 'Plan', exact: true });
  if ((await vuePlan.getAttribute('aria-pressed')) === 'true') {
    await page.getByRole('button', { name: 'Effet de convoi' }).click();
  } else {
    await page.getByRole('button', { name: 'Effet de convoi' }).click();
    await vuePlan.click();
    await expect(page.getByRole('button', { name: 'Algorithme FIFO' })).toBeVisible();
  }
  await page.getByRole('button', { name: 'Voir dans le cours' }).click();
  await expect(page.getByRole('dialog', { name: 'Texte source du cours' })).toBeVisible();
});


test('import : un fichier de plus de 25 Mo est refuse avant tout envoi', async ({ page }) => {
  await simulerApi(page, { connecte: true });
  let envois = 0;
  page.on('request', (r) => {
    if (r.url().includes('/courses/import')) envois++;
  });
  await page.goto('/cours');
  await page.getByRole('button', { name: 'Ajouter un cours' }).first().click();
  await page.getByRole('button', { name: 'Importer un fichier' }).click();
  await page.getByLabel('Titre').fill('Amphi complet');
  await page.getByLabel('Fichier du cours').setInputFiles({
    name: 'amphi-complet.mp3',
    mimeType: 'audio/mpeg',
    buffer: Buffer.alloc(26 * 1024 * 1024),
  });

  await expect(page.getByRole('alert').filter({ hasText: 'la limite est de 25 Mo' })).toBeVisible();
  await expect(page.getByText('26 Mo')).toBeVisible();
  // Ni encadre d'accord, ni envoi possible.
  await expect(page.getByRole('checkbox', { name: /J’accepte|J'accepte/ })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Enregistrer le cours' })).toBeDisabled();
  expect(envois).toBe(0);
});

test('quiz : une question ratee part dans les cartes, avec un lien pour reviser', async ({ page }) => {
  await simulerApi(page, { connecte: true, cours: [{ id: 'c-1', title: 'Réseaux', content: CONTENU }] });
  await page.goto('/cours/c-1?onglet=quiz');
  await page.getByRole('button', { name: 'Générer un quiz' }).click();
  await page.getByRole('button', { name: 'Mauvaise A' }).first().click();
  const bonnes = page.getByRole('button', { name: /Bonne reponse/ });
  for (const b of (await bonnes.all()).slice(1)) await b.click();
  await page.getByRole('button', { name: 'Valider mes réponses' }).click();

  await expect(page.getByText('La question ratée est ajoutée à vos cartes')).toBeVisible();
  await page.getByRole('link', { name: 'Réviser mes cartes' }).click();
  await expect(page).toHaveURL(/onglet=cartes/);
});

