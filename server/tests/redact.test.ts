import { describe, expect, it } from 'vitest';
import { leakRate, redact, rehydrate } from '../src/llm/redact.js';

/**
 * Ce sont les tests les plus importants du projet : ils portent l'exigence la
 * plus visible de l'enonce (« jamais de donnees personnelles brutes envoyees
 * telles quelles au LLM »). Les cas difficiles sont volontaires — un jeu de
 * tests qui ne contient que des cas faciles ne prouve rien.
 */

const KNOWN = { fullName: 'Amine Ben Salah', phone: '+216 55 123 456', city: 'Tunis' };

describe('redact', () => {
  it('masque le nom, y compris en minuscules et en partie', () => {
    const { redacted } = redact('CV de amine ben salah, developpeur.', KNOWN);
    expect(redacted.toLowerCase()).not.toContain('amine');
    expect(redacted.toLowerCase()).not.toContain('ben salah');
  });

  it('masque un email en pied de page', () => {
    const { redacted } = redact('...\n\nContact : a.bensalah@example.com', KNOWN);
    expect(redacted).not.toContain('@example.com');
    expect(redacted).toMatch(/\[EMAIL_\d+\]/);
  });

  it('masque un telephone avec indicatif international', () => {
    const { redacted } = redact('Tel : +216 55 123 456', KNOWN);
    expect(redacted).not.toContain('55 123 456');
  });

  it('masque les URLs de profils en ligne', () => {
    const { redacted } = redact('linkedin.com/in/abensalah', KNOWN);
    expect(redacted).not.toContain('abensalah');
  });

  it("masque l'etablissement de formation", () => {
    const { redacted } = redact('Diplome ESPRIT 2026', KNOWN);
    expect(redacted).not.toContain('ESPRIT');
  });

  it('attribue un jeton stable a une valeur repetee', () => {
    const { redacted } = redact('a@b.com puis a@b.com', KNOWN);
    const tokens = [...redacted.matchAll(/\[EMAIL_(\d+)\]/g)].map((m) => m[1]);
    expect(new Set(tokens).size).toBe(1);
  });

  it('laisse intact le contenu professionnel', () => {
    const { redacted } = redact('5 ans en Node.js et PostgreSQL.', KNOWN);
    expect(redacted).toContain('Node.js');
    expect(redacted).toContain('PostgreSQL');
  });
});

describe('rehydrate', () => {
  it('restaure les valeurs dans une structure imbriquee', () => {
    const { redacted, map } = redact('Contact : a@b.com', KNOWN);
    const restored = rehydrate({ items: [{ note: redacted }] }, map);
    expect(restored.items[0].note).toContain('a@b.com');
  });
});

describe('leakRate', () => {
  it('vaut 0 sur une charge utile correctement masquee', () => {
    const { redacted } = redact('Amine Ben Salah, Tunis, +216 55 123 456', KNOWN);
    expect(leakRate(redacted, KNOWN)).toBe(0);
  });

  it('detecte une fuite quand une valeur connue subsiste', () => {
    expect(leakRate('Candidat: Amine Ben Salah', KNOWN)).toBeGreaterThan(0);
  });
});

describe('secrets', () => {
  // Defaut constate le 1er octobre lors de la premiere verification reelle :
  // une fausse clef AWS laissee dans une note de CV partait vers le fournisseur.
  it("masque une clef AWS laissee dans le CV", () => {
    const { redacted } = redact('cle de test : AKIAIOSFODNN7EXAMPLE', KNOWN);
    expect(redacted).not.toContain('AKIAIOSFODNN7EXAMPLE');
    expect(redacted).toMatch(/\[SECRET_\d+\]/);
  });

  it('masque une chaine de connexion', () => {
    const { redacted } = redact('base : postgresql://user:motdepasse@host:5432/db', KNOWN);
    expect(redacted).not.toContain('motdepasse');
  });

  it("masque une ligne de mot de passe", () => {
    const { redacted } = redact('password: Tr0ub4dour&3', KNOWN);
    expect(redacted).not.toContain('Tr0ub4dour');
  });
});

describe('faux positifs', () => {
  // Une plage d'annees de formation est utile au scoring : la masquer comme un
  // numero de telephone detruisait de l'information pertinente.
  it("ne masque pas une plage d'annees de formation", () => {
    const { redacted } = redact('Cycle ingenieur, 2022-2026', KNOWN);
    expect(redacted).toContain('2022-2026');
  });
});
