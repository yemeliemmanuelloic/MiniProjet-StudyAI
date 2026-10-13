import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Alerte, Chargement, ErreurApi, Pastille } from './ui';
import { api, ApiError } from '../lib/api';
import type { Message } from '../lib/types';

/**
 * Module 3 — chatbot ancre sur le cours.
 *
 * Le marqueur `grounded` est la garantie anti-hallucination : quand il est
 * faux, le modele declare que le cours ne permet pas de repondre plutot que
 * de completer avec ses connaissances generales. C'est affiche a l'ecran,
 * pas seulement stocke.
 */
export function ChatPanel({ coursId }: { coursId: string }) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [question, setQuestion] = useState('');
  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState<ApiError | null>(null);
  // Conservee pour que « Reessayer » renvoie la question sans la retaper.
  const [derniere, setDerniere] = useState('');
  const bas = useRef<HTMLDivElement>(null);

  useEffect(() => {
    api<{ messages: Message[] }>(`/courses/${coursId}/messages`)
      .then((d) => setMessages(d.messages))
      .catch(() => setMessages([]));
  }, [coursId]);

  useEffect(() => {
    bas.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, enCours]);

  async function envoyer(e: FormEvent) {
    e.preventDefault();
    await poser(question.trim());
  }

  async function poser(texte: string) {
    if (texte.length < 3) return;
    setDerniere(texte);
    setErreur(null);
    setEnCours(true);
    setQuestion('');
    // Affichage optimiste : la question apparait immediatement, la reponse suit.
    const provisoire: Message = {
      id: `local-${Date.now()}`,
      role: 'user',
      content: texte,
      sources: null,
      grounded: true,
      latencyMs: null,
      createdAt: new Date().toISOString(),
    };
    setMessages((m) => [...m, provisoire]);

    try {
      const d = await api<{ message: Message }>(`/courses/${coursId}/chat`, {
        body: { question: texte },
      });
      setMessages((m) => [...m, d.message]);
    } catch (e) {
      setErreur(e as ApiError);
    } finally {
      setEnCours(false);
    }
  }

  return (
    <div className="pile">
      <Alerte>
        Le tuteur repond <strong>uniquement a partir de votre cours</strong>. S'il n'y trouve pas la
        reponse, il vous le dit au lieu d'inventer.
      </Alerte>

      <div className="carte pile" style={{ gap: 14, minHeight: 280 }}>
        {messages.length === 0 && !enCours && (
          <p className="discret" style={{ margin: 'auto', textAlign: 'center', maxWidth: 420 }}>
            Posez une question sur ce cours. Par exemple : « Explique-moi la difference entre les
            deux notions du chapitre 2 ».
          </p>
        )}

        {messages.map((m) => {
          const etudiant = m.role === 'user';
          return (
            <div
              key={m.id}
              style={{
                alignSelf: etudiant ? 'flex-end' : 'flex-start',
                maxWidth: '80%',
                padding: '12px 16px',
                borderRadius: 10,
                background: etudiant ? 'var(--brand-clair)' : 'var(--fond-discret)',
              }}
            >
              <div style={{ whiteSpace: 'pre-wrap' }}>{m.content}</div>

              {!etudiant && !m.grounded && (
                <div style={{ marginTop: 8 }}>
                  <Pastille ton="alerte">Hors du cours</Pastille>
                </div>
              )}

              {!etudiant && m.sources && m.sources.length > 0 && (
                <details style={{ marginTop: 8 }}>
                  <summary className="petit discret" style={{ cursor: 'pointer' }}>
                    {m.sources.length} extrait{m.sources.length > 1 ? 's' : ''} du cours
                  </summary>
                  <div className="pile" style={{ gap: 6, marginTop: 6 }}>
                    {m.sources.map((s, i) => (
                      <div key={i} className="petit discret" style={{ fontStyle: 'italic' }}>
                        « {s} »
                      </div>
                    ))}
                  </div>
                </details>
              )}
            </div>
          );
        })}

        {enCours && (
          <div style={{ alignSelf: 'flex-start', maxWidth: '80%', width: 320 }}>
            <Chargement lignes={2} />
          </div>
        )}

        <div ref={bas} />
      </div>

      <ErreurApi erreur={erreur} onReessayer={derniere ? () => poser(derniere) : undefined} />

      <form className="ligne" style={{ flexWrap: 'nowrap' }} onSubmit={envoyer}>
        <div className="champ" style={{ flex: 1 }}>
          <input
            aria-label="Votre question"
            placeholder="Posez une question sur ce cours…"
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            disabled={enCours}
          />
        </div>
        <button className="bouton" type="submit" disabled={enCours || question.trim().length < 3}>
          {enCours ? 'Reflexion…' : 'Envoyer'}
        </button>
      </form>
    </div>
  );
}
