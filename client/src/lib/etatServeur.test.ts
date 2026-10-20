import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  SEUIL_REVEIL_MS,
  abonner,
  etatActuel,
  reinitialiser,
  requetesEnCours,
  statutIndisponible,
  suivreRequete,
} from './etatServeur';

describe('etat du serveur', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    reinitialiser();
  });
  afterEach(() => vi.useRealTimers());

  it('une requete rapide ne declenche pas le bandeau de reveil', () => {
    const fin = suivreRequete();
    vi.advanceTimersByTime(SEUIL_REVEIL_MS - 1);
    fin(true);
    vi.advanceTimersByTime(10_000);
    expect(etatActuel()).toBe('pret');
  });

  it('une requete lente signale le reveil, sa reponse le leve', () => {
    const vus: string[] = [];
    abonner((e) => vus.push(e));
    const fin = suivreRequete();
    vi.advanceTimersByTime(SEUIL_REVEIL_MS);
    expect(etatActuel()).toBe('reveil');
    fin(true);
    expect(etatActuel()).toBe('pret');
    expect(vus).toEqual(['reveil', 'pret']);
  });

  it('une reponse rapide ne leve pas le bandeau tant qu une requete lente attend', () => {
    const lente = suivreRequete();
    vi.advanceTimersByTime(SEUIL_REVEIL_MS);
    suivreRequete()(true);
    expect(etatActuel()).toBe('reveil');
    lente(true);
    expect(etatActuel()).toBe('pret');
  });

  it('un echec reseau rend le serveur injoignable, et le reveil ne le masque pas', () => {
    suivreRequete()(false);
    expect(etatActuel()).toBe('injoignable');
    suivreRequete();
    vi.advanceTimersByTime(SEUIL_REVEIL_MS * 2);
    expect(etatActuel()).toBe('injoignable');
  });

  it('une reponse apres une panne retablit l etat', () => {
    suivreRequete()(false);
    suivreRequete()(true);
    expect(etatActuel()).toBe('pret');
  });

  it('terminer deux fois ne fausse pas le compte', () => {
    const fin = suivreRequete();
    fin(true);
    fin(true);
    expect(requetesEnCours()).toBe(0);
  });

  it('502, 503 et 504 sont des indisponibilites ; 500 et 429 non', () => {
    expect([502, 503, 504].every(statutIndisponible)).toBe(true);
    expect([200, 401, 429, 500].some(statutIndisponible)).toBe(false);
  });
});
