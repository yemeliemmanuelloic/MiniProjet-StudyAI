import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { Citation } from './SourceCours';
import { Alerte, Chargement, ErreurApi, Pastille } from './ui';
import { useRetours } from './Retours';
import { api, ApiError } from '../lib/api';
import { LOCALE, useI18n } from '../lib/i18n';
import type { Conversation, Message } from '../lib/types';

/**
 * Module 3 — chatbot ancre sur le cours.
 *
 * Le marqueur `grounded` est la garantie anti-hallucination : quand il est
 * faux, le modele declare que le cours ne permet pas de repondre plutot que
 * de completer avec ses connaissances generales. C'est affiche a l'ecran,
 * pas seulement stocke.
 *
 * CONVERSATIONS (20 octobre). Un cours n'avait qu'un fil, sans fin : on ne
 * pouvait ni repartir de zero, ni retrouver un echange, et le contexte d'une
 * vieille question orientait la suivante. Le panneau liste desormais les
 * conversations, la plus recente en tete, et « Nouvelle conversation » ouvre
 * un brouillon. Rien n'est enregistre tant qu'aucune question n'est posee :
 * c'est la premiere question qui cree la conversation cote serveur, et qui
 * lui donne son titre.
 */

/** `null` : brouillon d'une nouvelle conversation, pas encore enregistree. */
type Selection = string | null;

export function ChatPanel({ coursId }: { coursId: string }) {
  const { t, langue } = useI18n();
  const { confirmer, notifier } = useRetours();
  const [conversations, setConversations] = useState<Conversation[] | null>(null);
  const [actif, setActif] = useState<Selection>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [chargementFil, setChargementFil] = useState(false);
  const [question, setQuestion] = useState('');
  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState<ApiError | null>(null);
  // Conservee pour que « Reessayer » renvoie la question sans la retaper.
  const [derniere, setDerniere] = useState('');
  const bas = useRef<HTMLDivElement>(null);
  const champ = useRef<HTMLInputElement>(null);
  // Vrai juste apres la premiere question d'un brouillon : le fil affiche est
  // deja a jour, le relire depuis le serveur ne ferait que clignoter l'ecran.
  const sauterRelecture = useRef(false);

  const libelle = useCallback(
    (c: Conversation) =>
      c.title ?? (c.messageCount > 0 ? t('chat.conv.precedente') : t('chat.conv.nouvelle')),
    [t],
  );

  const chargerListe = useCallback(
    () =>
      api<{ conversations: Conversation[] }>(`/courses/${coursId}/conversations`).then((d) => {
        setConversations(d.conversations);
        return d.conversations;
      }),
    [coursId],
  );

  // A l'ouverture : la conversation la plus recente, ou un brouillon.
  useEffect(() => {
    chargerListe()
      .then((liste) => setActif(liste[0]?.id ?? null))
      .catch(() => setConversations([]));
  }, [chargerListe]);

  useEffect(() => {
    if (actif === null) {
      setMessages([]);
      return;
    }
    if (sauterRelecture.current) {
      sauterRelecture.current = false;
      return;
    }
    let annule = false;
    setChargementFil(true);
    api<{ messages: Message[] }>(`/conversations/${actif}/messages`)
      .then((d) => !annule && setMessages(d.messages))
      .catch(() => !annule && setMessages([]))
      .finally(() => !annule && setChargementFil(false));
    return () => {
      annule = true;
    };
  }, [actif]);

  useEffect(() => {
    bas.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, [messages, enCours]);

  function nouvelle() {
    setActif(null);
    setErreur(null);
    setQuestion('');
    champ.current?.focus();
  }

  async function supprimer(c: Conversation) {
    const ok = await confirmer({
      titre: t('chat.conv.supprimer.titre'),
      message: t('chat.conv.supprimer.message', { titre: libelle(c) }),
      action: t('chat.conv.supprimer.action'),
      danger: true,
    });
    if (!ok) return;
    try {
      await api<void>(`/conversations/${c.id}`, { method: 'DELETE' });
      const reste = (conversations ?? []).filter((x) => x.id !== c.id);
      setConversations(reste);
      if (actif === c.id) setActif(reste[0]?.id ?? null);
      notifier(t('chat.conv.supprimee'));
    } catch (e) {
      setErreur(e as ApiError);
    }
  }

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
        body: actif ? { question: texte, conversationId: actif } : { question: texte },
      });
      setMessages((m) => [...m, d.message]);
      // La liste change (titre, ordre, compte) ; et la premiere question d'un
      // brouillon vient de creer la conversation : on la selectionne.
      await chargerListe();
      if (actif === null && d.message.conversationId) {
        sauterRelecture.current = true;
        setActif(d.message.conversationId);
      }
    } catch (e) {
      setErreur(e as ApiError);
    } finally {
      setEnCours(false);
    }
  }

  const fmt = new Intl.DateTimeFormat(LOCALE[langue], { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

  return (
    <div className="pile">
      <Alerte>{t('chat.intro')}</Alerte>

      <div className="tuteur">
        {/* --- Liste des conversations ---------------------------------- */}
        <aside className="tuteur-liste" aria-label={t('chat.conv.titre')}>
          <button type="button" className="bouton bouton-secondaire tuteur-nouvelle" onClick={nouvelle}>
            <span aria-hidden="true">+</span> {t('chat.conv.nouvelle')}
          </button>

          {/* Telephone : une liste deroulante remplace la colonne. */}
          <label className="tuteur-choix">
            <span>{t('chat.conv.titre')}</span>
            <select
              value={actif ?? ''}
              onChange={(e) => (e.target.value ? setActif(e.target.value) : nouvelle())}
            >
              <option value="">{t('chat.conv.nouvelle')}</option>
              {(conversations ?? []).map((c) => (
                <option key={c.id} value={c.id}>
                  {libelle(c)}
                </option>
              ))}
            </select>
          </label>

          {conversations === null ? (
            <Chargement lignes={3} />
          ) : conversations.length === 0 ? (
            <p className="petit discret tuteur-aucune">{t('chat.conv.aucune')}</p>
          ) : (
            <ul className="tuteur-conversations">
              {actif === null && (
                <li className="tuteur-conversation actif" aria-current="true">
                  <span className="tuteur-conv-titre">{t('chat.conv.nouvelle')}</span>
                  <span className="petit discret">{t('chat.conv.brouillon')}</span>
                </li>
              )}
              {conversations.map((c) => (
                <li key={c.id} className={`tuteur-conversation${c.id === actif ? ' actif' : ''}`}>
                  <button
                    type="button"
                    className="tuteur-conv-ouvrir"
                    aria-current={c.id === actif ? 'true' : undefined}
                    onClick={() => setActif(c.id)}
                  >
                    <span className="tuteur-conv-titre">{libelle(c)}</span>
                    <span className="petit discret">
                      {fmt.format(new Date(c.updatedAt))} · {t('chat.conv.messages', { n: c.messageCount })}
                    </span>
                  </button>
                  <button
                    type="button"
                    className="tuteur-conv-supprimer"
                    aria-label={t('chat.conv.supprimer', { titre: libelle(c) })}
                    title={t('chat.conv.supprimer', { titre: libelle(c) })}
                    onClick={() => supprimer(c)}
                  >
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                      <path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </aside>

        {/* --- Conversation active ----------------------------------------- */}
        <div className="tuteur-fil pile">
          {/* LA CONVERSATION EST UNE CONVERSATION, pas une pile de blocs :
              bulles, bec qui designe l'interlocuteur, largeur de lecture
              bornee. Aucune couleur dans le TSX. */}
          <div className="carte conversation">
            {chargementFil ? (
              <Chargement lignes={3} />
            ) : (
              messages.length === 0 && !enCours && (
                <p className="discret conversation-vide">{t('chat.vide')}</p>
              )
            )}

            {!chargementFil &&
              messages.map((m) => {
                const etudiant = m.role === 'user';
                return (
                  <div key={m.id} className={`bulle ${etudiant ? 'bulle-etudiant' : 'bulle-tuteur'}`}>
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
                            <Citation key={i} passage={s}>
                              {s}
                            </Citation>
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
                ref={champ}
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
      </div>
    </div>
  );
}
