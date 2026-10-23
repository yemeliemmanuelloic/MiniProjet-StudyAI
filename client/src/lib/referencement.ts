/**
 * Referencement (lot G, 20 octobre) : ce que voient les moteurs de recherche.
 *
 * Logique PURE, sans React ni navigateur : `vite.config.ts` l'importe au
 * moment de la construction pour ecrire robots.txt, sitemap.xml et les
 * balises de index.html ; les tests l'exercent directement.
 *
 * DEUX REGLAGES, LUS A LA CONSTRUCTION (variables d'environnement) :
 *  - VITE_SITE_URL   : l'adresse publique du front, sans barre finale. Elle
 *                      n'est ecrite nulle part dans le depot : l'equipe ne
 *                      souhaite pas la diffuser.
 *  - VITE_INDEXATION : « 1 » pour ouvrir le site aux moteurs. Par defaut,
 *                      le site est construit NON INDEXABLE : balise
 *                      `noindex` sur chaque page, aucun sitemap annonce.
 *
 * Pourquoi `noindex` plutot que « Disallow: / » pour fermer le site : un
 * robot a qui l'on interdit d'explorer ne lit jamais la balise, et peut
 * indexer l'adresse quand meme si un lien y mene. Pour rester hors des
 * resultats, il faut le laisser lire la consigne.
 */

/** Pages publiques : celles qu'un moteur peut presenter. */
export const ROUTES_PUBLIQUES: ReadonlyArray<{ chemin: string; priorite: number }> = [
  { chemin: '/', priorite: 1.0 },
  { chemin: '/a-propos', priorite: 0.8 },
  { chemin: '/faq', priorite: 0.7 },
  { chemin: '/aide', priorite: 0.7 },
  { chemin: '/inscription', priorite: 0.6 },
  { chemin: '/connexion', priorite: 0.5 },
  { chemin: '/contact', priorite: 0.5 },
  { chemin: '/mentions-legales', priorite: 0.2 },
  { chemin: '/confidentialite', priorite: 0.2 },
  { chemin: '/conditions', priorite: 0.2 },
];

/** Prefixes reserves aux comptes : jamais indexes, jamais explores. */
export const PREFIXES_PRIVES = ['/cours', '/plan', '/examen', '/recherche', '/consommation', '/compte'];

export function estPublique(chemin: string): boolean {
  return ROUTES_PUBLIQUES.some((r) => r.chemin === chemin);
}

/** Adresse nettoyee, ou null si absente ou invalide. */
export function normaliserSite(url: string | undefined): string | null {
  if (!url) return null;
  const propre = url.trim().replace(/\/+$/, '');
  return /^https?:\/\/[^\s/]+/.test(propre) ? propre : null;
}

export function indexable(site: string | null, indexation: string | undefined): boolean {
  return site !== null && indexation === '1';
}

export function genererRobots(site: string | null, ouvert: boolean): string {
  if (!ouvert || !site) {
    // Exploration permise, pour que la balise `noindex` soit lue.
    return ['# Site non indexable : chaque page porte la balise noindex.', 'User-agent: *', 'Allow: /', ''].join('\n');
  }
  return [
    'User-agent: *',
    'Allow: /',
    ...PREFIXES_PRIVES.map((p) => `Disallow: ${p}`),
    '',
    `Sitemap: ${site}/sitemap.xml`,
    '',
  ].join('\n');
}

export function genererSitemap(site: string, jour: string): string {
  const entrees = ROUTES_PUBLIQUES.map(
    (r) =>
      `  <url>\n    <loc>${site}${r.chemin}</loc>\n    <lastmod>${jour}</lastmod>\n    <priority>${r.priorite.toFixed(1)}</priority>\n  </url>`,
  );
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ...entrees,
    '</urlset>',
    '',
  ].join('\n');
}

const DESCRIPTION =
  'Importez un cours : StudyAI le résume, génère un quiz pour vous auto-évaluer et répond à vos questions en s’appuyant uniquement sur son contenu.';

function echapper(texte: string): string {
  return texte.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
}

/**
 * Balises ajoutees a index.html : partage sur les reseaux (Open Graph),
 * donnees structurees, consigne aux robots. Elles sont dans le HTML servi,
 * pas ajoutees par JavaScript : un apercu de lien ne lance pas React.
 */
export function balisesTete(site: string | null, ouvert: boolean, equipe: readonly string[]): string {
  const lignes: string[] = [];
  if (!ouvert) lignes.push('<meta name="robots" content="noindex" />');
  lignes.push(
    '<meta property="og:type" content="website" />',
    '<meta property="og:site_name" content="StudyAI" />',
    '<meta property="og:title" content="StudyAI — résumez, révisez, interrogez vos cours" />',
    `<meta property="og:description" content="${echapper(DESCRIPTION)}" />`,
    '<meta property="og:locale" content="fr_FR" />',
    '<meta property="og:locale:alternate" content="en_GB" />',
    '<meta name="twitter:card" content="summary_large_image" />',
  );
  // Un apercu de lien exige une adresse ABSOLUE pour l'image.
  if (site) {
    lignes.push(
      `<meta property="og:url" content="${site}/" />`,
      `<meta property="og:image" content="${site}/og-image.jpg" />`,
      '<meta property="og:image:width" content="1200" />',
      '<meta property="og:image:height" content="630" />',
      '<meta property="og:image:alt" content="StudyAI — vos cours, résumés, révisés et expliqués." />',
    );
  }
  const donnees: Record<string, unknown> = {
    '@context': 'https://schema.org',
    '@type': 'WebApplication',
    name: 'StudyAI',
    description: DESCRIPTION,
    applicationCategory: 'EducationalApplication',
    operatingSystem: 'Web',
    inLanguage: ['fr', 'en'],
    isAccessibleForFree: true,
    offers: { '@type': 'Offer', price: '0', priceCurrency: 'TND' },
    author: equipe.map((nom) => ({ '@type': 'Person', name: nom })),
  };
  if (site) donnees.url = `${site}/`;
  // `<` echappe : une chaine contenant </script> ne peut pas fermer la balise.
  const json = JSON.stringify(donnees).replace(/</g, '\\u003c');
  lignes.push(`<script type="application/ld+json">${json}</script>`);
  return lignes.map((l) => `    ${l}`).join('\n');
}
