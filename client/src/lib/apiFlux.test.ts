// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { apiFlux, ApiError, type EvenementTuteur } from './api';

/**
 * Lecture du flux NDJSON du tuteur (23 octobre).
 *
 * Le reseau ne respecte pas les lignes : un paquet peut couper une ligne JSON
 * en deux, ou en porter plusieurs. Le lecteur doit rendre exactement les
 * evenements emis, dans l'ordre, et transformer un evenement « erreur » en
 * ApiError comme pour une requete ordinaire.
 */

function fluxDe(paquets: Array<string | Uint8Array>, statut = 200) {
  const encodeur = new TextEncoder();
  const corps = new ReadableStream<Uint8Array>({
    start(controle) {
      paquets.forEach((p) => controle.enqueue(typeof p === 'string' ? encodeur.encode(p) : p));
      controle.close();
    },
  });
  vi.stubGlobal('fetch', vi.fn(async () => new Response(corps, { status: statut })));
}

const lignes = (...evenements: unknown[]) => evenements.map((e) => JSON.stringify(e)).join('\n') + '\n';

describe('apiFlux', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('rend les evenements meme quand les paquets coupent les lignes', async () => {
    const brut = lignes(
      { type: 'conversation', conversationId: 'c1' },
      { type: 'texte', texte: 'Bon' },
      { type: 'texte', texte: 'jour é' },
      { type: 'fin', message: { id: 'm1', content: 'Bonjour é' } },
    );
    // Decoupage arbitraire, y compris au milieu d'un caractere accentue.
    const octets = new TextEncoder().encode(brut);
    const decoupes = [7, 30, 31, 55, octets.length];
    const paquets: Uint8Array[] = [];
    let debut = 0;
    for (const fin of decoupes) {
      paquets.push(octets.slice(debut, fin));
      debut = fin;
    }
    fluxDe(paquets);
    const recus: EvenementTuteur[] = [];
    await apiFlux('/courses/x/chat/stream', { question: 'q' }, (e) => recus.push(e));
    expect(recus.map((e) => e.type)).toEqual(['conversation', 'texte', 'texte', 'fin']);
    expect(recus.filter((e) => e.type === 'texte').map((e) => (e as { texte: string }).texte).join('')).toBe('Bonjour é');
  });

  it('leve une ApiError sur un evenement erreur, apres les morceaux deja recus', async () => {
    fluxDe([
      lignes(
        { type: 'texte', texte: 'debut' },
        { type: 'erreur', error: { code: 'LLM_QUOTA_EXCEEDED', message: 'Quota', details: {} } },
      ),
    ]);
    const recus: EvenementTuteur[] = [];
    const erreur = await apiFlux('/x', {}, (e) => recus.push(e)).catch((e) => e);
    expect(erreur).toBeInstanceOf(ApiError);
    expect((erreur as ApiError).code).toBe('LLM_QUOTA_EXCEEDED');
    expect(recus).toHaveLength(1);
  });

  it('une erreur avant le flux garde son statut et son code', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({ error: { code: 'NOT_FOUND', message: 'm', details: {} } }), { status: 404 })),
    );
    const erreur = await apiFlux('/x', {}, () => {}).catch((e) => e);
    expect((erreur as ApiError).code).toBe('NOT_FOUND');
  });
});
