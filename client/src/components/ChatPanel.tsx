import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Alerte, Chargement, ErreurApi, Pastille } from './ui';
import { api, ApiError } from '../lib/api';
import { useT } from '../lib/i18n';
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
  const t = useT();
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
        {t('chat.intro')}
      </Alerte>

      {/* LA CONVERSATION EST UNE CONVERSATION, pas une pile de blocs.
          Les bulles etaient dessinees par des styles ecrits en ligne —
          couleurs comprises — en contradiction avec la regle que la feuille
          de style enonce : aucune couleur dans le TSX. Elles ont desormais
          leurs classes, un bec qui designe l'interlocuteur, et une largeur
          de lecture bornee. */}
      <div className="carte conversation">
        {messages.length === 0 && !enCours && (
          <p className="discret conversation-vide">{t('chat.vide')}</p>
        )}

        {messages.map((m) => {
          const etudiant = m.role === 'user';
          return (
            <div
              key={m.id}
              className={`bulle ${etudiant ? 'bulle-etudiant' : 'bulle-tuteur'}`}
            >
              <div className="bulle-texte">{m.content}</div>

              {!etudiant && !m.grounded && (
                <div className="bulle-pied">
                  <Pastille ton="alerte">{t('chat.horsCours')}</Pastille>
                </div>
              )}

              {!etudiant && m.sources && m.sources.length > 0 && (
                <details className="bulle-pied">
                  <summary className="petit discret depliant-titre">
                    {t('chat.extraits', { n: m.sources.length })}
                  </summary>
                  <div className="pile bulle-sources">
                    {m.sources.map((s, i) => (
                      <blockquote key={i} className="citation">
                        {s}
                      </blockquote>
                    ))}
                  </div>
                </details>
              )}
            </div>
          );
        })}

        {enCours && (
          <div className="bulle bulle-tuteur bulle-attente">
            <Chargement lignes={2} message={t('chargement.tuteur')} />
          </div>
        )}

        <div ref={bas} />
      </div>

      <ErreurApi erreur={erreur} onReessayer={derniere ? () => poser(derniere) : undefined} />

      <form className="ligne" style={{ flexWrap: 'nowrap' }} onSubmit={envoyer}>
        <div className="champ" style={{ flex: 1 }}>
          <input
            aria-label={t('chat.question')}
            placeholder={t('chat.exemple')}
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            disabled={enCours}
          />
        </div>
        <button className="bouton" type="submit" disabled={enCours || question.trim().length < 3}>
          {enCours ? t('chat.encours') : t('chat.envoyer')}
        </button>
      </form>
    </div>
  );
}
