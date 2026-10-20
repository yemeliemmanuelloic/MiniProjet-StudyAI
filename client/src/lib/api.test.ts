// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { api, ApiError } from './api';
import { etatActuel, reinitialiser } from './etatServeur';

/**
 * Le client HTTP face aux statuts 502, 503 et 504.
 *
 * Regression evitee : ces statuts servent AUSSI a l'API pour les erreurs du
 * modele (LLM_KEY_MISSING 503, LLM_TIMEOUT 504, LLM_UNAVAILABLE 502). Les
 * confondre avec une panne de l'hebergeur masquait les quatre messages
 * LLM_* exiges par l'enonce.
 */

function repondre(statut: number, corps: unknown, type = 'application/json') {
  const texte = typeof corps === 'string' ? corps : JSON.stringify(corps);
  vi.stubGlobal('fetch', vi.fn(async () => new Response(texte, { status: statut, headers: { 'Content-Type': type } })));
}

async function erreurDe(promesse: Promise<unknown>): Promise<ApiError> {
  try {
    await promesse;
  } catch (e) {
    return e as ApiError;
  }
  throw new Error('aucune erreur levee');
}

describe('client HTTP : erreurs 5xx', () => {
  beforeEach(() => reinitialiser());
  afterEach(() => vi.unstubAllGlobals());

  it.each([
    [503, 'LLM_KEY_MISSING'],
    [504, 'LLM_TIMEOUT'],
    [502, 'LLM_UNAVAILABLE'],
    [502, 'LLM_INVALID_OUTPUT'],
  ])('%i portant %s : le code de l API est conserve, le serveur est joignable', async (statut, code) => {
    repondre(statut, { error: { code, message: 'm', details: {} } });
    const e = await erreurDe(api('/courses/x/summary', { body: {} }));
    expect(e.code).toBe(code);
    expect(e.details.cause).toBeUndefined();
    expect(etatActuel()).toBe('pret');
  });

  it('503 sans notre enveloppe (page de l hebergeur) : service indisponible', async () => {
    repondre(503, '<html>Service Unavailable</html>', 'text/html');
    const e = await erreurDe(api('/courses'));
    expect(e.code).toBe('INTERNAL');
    expect(e.details.cause).toBe('indisponible');
    expect(etatActuel()).toBe('injoignable');
  });

  it('panne reseau : cause reseau, serveur injoignable', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('Failed to fetch'); }));
    const e = await erreurDe(api('/courses'));
    expect(e.details.cause).toBe('reseau');
    expect(etatActuel()).toBe('injoignable');
  });

  it('succes et 204', async () => {
    repondre(200, { ok: 1 });
    await expect(api('/x')).resolves.toEqual({ ok: 1 });
    vi.stubGlobal('fetch', vi.fn(async () => new Response(null, { status: 204 })));
    await expect(api('/x', { method: 'DELETE' })).resolves.toBeUndefined();
  });
});
