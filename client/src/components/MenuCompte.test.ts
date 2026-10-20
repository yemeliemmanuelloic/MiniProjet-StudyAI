// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { initiale } from './MenuCompte';

describe('initiale de la pastille de compte', () => {
  it('premiere lettre de l adresse, en majuscule', () => {
    expect(initiale('demo.supabase@esprit.tn')).toBe('D');
  });
  it('ignore la ponctuation de tete et garde les lettres accentuees', () => {
    expect(initiale('  _élodie@exemple.test')).toBe('É');
  });
  it('accepte un chiffre, et rend « ? » sans lettre ni chiffre', () => {
    expect(initiale('5sae9@exemple.test')).toBe('5');
    expect(initiale('@')).toBe('?');
  });
});
