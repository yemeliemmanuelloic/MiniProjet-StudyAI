import { describe, expect, it } from 'vitest';
import APP from '../App.tsx?raw';
import type { Cle, Langue } from './i18n';
import { metaPour, texteBrut } from './metaPage';
import {
  PREFIXES_PRIVES,
  ROUTES_PUBLIQUES,
  balisesTete,
  genererRobots,
  genererSitemap,
  indexable,
  normaliserSite,
} from './referencement';
import { EN } from './traductions.en';
import { FR } from './traductions.fr';

const ROUTES = new Set([...APP.matchAll(/path="([^"]+)"/g)].map((m) => m[1]));
const SITE = 'https://exemple.test';
const EQUIPE = ['A', 'B'];
const tPour = (l: Langue) => (cle: Cle) => (l === 'fr' ? FR : EN)[cle];

describe('routes declarees au referencement', () => {
  it('chaque page publique et chaque prefixe prive existe dans App.tsx', () => {
    const absentes = [...ROUTES_PUBLIQUES.map((r) => r.chemin), ...PREFIXES_PRIVES].filter(
      (c) => !ROUTES.has(c),
    );
    expect(absentes).toEqual([]);
  });

  it('aucune page publique n est aussi privee', () => {
    const publiques = ROUTES_PUBLIQUES.map((r) => r.chemin);
    expect(publiques.filter((c) => PREFIXES_PRIVES.some((p) => c.startsWith(p)))).toEqual([]);
  });
});

describe('adresse et ouverture du site', () => {
  it('normalise l adresse et refuse ce qui n en est pas une', () => {
    expect(normaliserSite(' https://exemple.test/// ')).toBe(SITE);
    expect(normaliserSite('exemple.test')).toBeNull();
    expect(normaliserSite(undefined)).toBeNull();
  });

  it('ferme par defaut : il faut l adresse ET VITE_INDEXATION=1', () => {
    expect(indexable(SITE, undefined)).toBe(false);
    expect(indexable(SITE, 'true')).toBe(false);
    expect(indexable(null, '1')).toBe(false);
    expect(indexable(SITE, '1')).toBe(true);
  });
});

describe('robots.txt', () => {
  it('site ferme : exploration permise (la balise noindex doit etre lue), aucun sitemap', () => {
    const r = genererRobots(SITE, false);
    expect(r).toContain('Allow: /');
    expect(r).not.toMatch(/Disallow: \/\s*$/m);
    expect(r).not.toContain('Sitemap');
  });

  it('site ouvert : pages privees exclues, sitemap annonce', () => {
    const r = genererRobots(SITE, true);
    for (const p of PREFIXES_PRIVES) expect(r).toContain(`Disallow: ${p}`);
    expect(r).toContain(`Sitemap: ${SITE}/sitemap.xml`);
  });
});

describe('sitemap.xml', () => {
  it('liste toutes les pages publiques, et elles seules', () => {
    const s = genererSitemap(SITE, '2026-10-20');
    const locs = [...s.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
    expect(locs).toEqual(ROUTES_PUBLIQUES.map((r) => `${SITE}${r.chemin}`));
    expect(s).toContain('<lastmod>2026-10-20</lastmod>');
  });
});

describe('balises de index.html', () => {
  it('site ferme : noindex, et pas d image de partage sans adresse absolue', () => {
    const b = balisesTete(null, false, EQUIPE);
    expect(b).toContain('name="robots" content="noindex"');
    expect(b).not.toContain('og:image');
  });

  it('site ouvert : pas de noindex, image et adresse absolues', () => {
    const b = balisesTete(SITE, true, EQUIPE);
    expect(b).not.toContain('noindex');
    expect(b).toContain(`content="${SITE}/og-image.jpg"`);
  });

  it('les donnees structurees sont du JSON valide', () => {
    const b = balisesTete(SITE, true, EQUIPE);
    const json = JSON.parse(b.match(/<script type="application\/ld\+json">(.*)<\/script>/)![1]);
    expect(json['@type']).toBe('WebApplication');
    expect(json.author).toHaveLength(2);
    expect(json.url).toBe(`${SITE}/`);
  });

  it('un < dans les donnees ne peut pas fermer la balise script', () => {
    const b = balisesTete(SITE, true, ['</script><script>alert(1)']);
    expect(b.match(/<\/script>/g)).toHaveLength(1);
  });
});

describe('titre et description par page', () => {
  it.each(['fr', 'en'] as const)('chaque page publique a un titre distinct (%s)', (langue) => {
    const titres = ROUTES_PUBLIQUES.map((r) => metaPour(r.chemin, langue, tPour(langue)).titre);
    expect(new Set(titres).size).toBe(titres.length);
    expect(titres.every((t) => t.includes('StudyAI'))).toBe(true);
  });

  it('les pages publiques sont indexables et decrites', () => {
    for (const { chemin } of ROUTES_PUBLIQUES) {
      const m = metaPour(chemin, 'fr', tPour('fr'));
      expect(m.horsIndex, chemin).toBe(false);
      expect(m.description.length, chemin).toBeGreaterThan(20);
    }
  });

  it('les pages privees, une fiche de cours et une adresse inconnue restent hors index', () => {
    for (const c of [...PREFIXES_PRIVES, '/cours/abc', '/nimporte-quoi']) {
      expect(metaPour(c, 'fr', tPour('fr')).horsIndex, c).toBe(true);
    }
  });

  it('suit la langue', () => {
    expect(metaPour('/a-propos', 'en', tPour('en')).titre).not.toBe(metaPour('/a-propos', 'fr', tPour('fr')).titre);
  });

  it('retire le balisage des contenus', () => {
    expect(texteBrut('Voir la [FAQ](/faq), **vite** et `code`.')).toBe('Voir la FAQ, vite et code.');
  });
});
