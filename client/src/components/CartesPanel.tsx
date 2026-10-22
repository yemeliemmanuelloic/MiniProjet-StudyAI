import { useCallback, useEffect, useState } from 'react';
import { Citation } from './SourceCours';
import { Alerte, Bouton, Chargement, ErreurApi, EtatVide, Pastille } from './ui';
import { api, ApiError } from '../lib/api';
import { useI18n } from '../lib/i18n';
import type { BoutonCarte, Carte, Jeu, Materialisation, Revision } from '../lib/types';

/**
 * Cartes de revision espacee.
 *
 * N'APPELLE AUCUN MODELE, ni pour fabriquer le jeu ni pour le reviser. Une
 * carte se derive d'une question de quiz deja en base ; l'algorithme FSRS
 * (serveur, services/fsrs.py) est de l'arithmetique sur quelques nombres. La pastille « gratuit » de l'onglet le
 * dit, et le bandeau apres fabrication affiche le compte d'appels — zero —
 * plutot que de demander qu'on le croie.
 *
 * TROIS ECRANS, et pas un seul. Une liste vide ne dit pas si le jeu n'existe
 * pas ou si tout est deja revise : ce sont deux situations opposees, l'une
 * appelle un bouton, l'autre une felicitation. L'etat du jeu voyage donc avec
 * les cartes pour permettre de les distinguer.
 */

/** Les quatre boutons, dans l'ordre de difficulte croissante pour l'etudiant. */
const BOUTONS: { cle: BoutonCarte; ton: string; touche: string }[] = [
  { cle: 'oublie', ton: 'note-oublie', touche: '1' },
  { cle: 'difficile', ton: 'note-difficile', touche: '2' },
  { cle: 'correct', ton: 'note-correct', touche: '3' },
  { cle: 'facile', ton: 'note-facile', touche: '4' },
];

function joursAvant(iso: string): number {
  const jour = 24 * 60 * 60 * 1000;
  const cible = new Date(iso).setHours(0, 0, 0, 0);
  const aujourdhui = new Date().setHours(0, 0, 0, 0);
  return Math.round((cible - aujourdhui) / jour);
}

export function CartesPanel({ coursId }: { coursId: string }) {
  const { t } = useI18n();
  const [jeu, setJeu] = useState<Jeu | null>(null);
  const [erreur, setErreur] = useState<ApiError | null>(null);
  const [rang, setRang] = useState(0);
  const [retournee, setRetournee] = useState(false);
  const [occupe, setOccupe] = useState(false);
  const [fabrication, setFabrication] = useState<Materialisation | null>(null);
  const [prochaine, setProchaine] = useState<number | null>(null);

  const charger = useCallback(() => {
    setErreur(null);
    api<Jeu>(`/courses/${coursId}/flashcards`)
      .then((d) => {
        setJeu(d);
        setRang(0);
        setRetournee(false);
      })
      .catch((e) => setErreur(e as ApiError));
  }, [coursId]);

  useEffect(charger, [charger]);

  const fabriquer = () => {
    setOccupe(true);
    setErreur(null);
    api<Materialisation>(`/courses/${coursId}/flashcards`, { method: 'POST' })
      .then((d) => {
        setFabrication(d);
        charger();
      })
      .catch((e) => setErreur(e as ApiError))
      .finally(() => setOccupe(false));
  };

  const carte: Carte | undefined = jeu?.cards[rang];

  const noter = useCallback(
    (bouton: BoutonCarte) => {
      if (!carte || occupe) return;
      setOccupe(true);
      api<Revision>(`/flashcards/${carte.id}/review`, {
        method: 'POST',
        body: { bouton },
      })
        .then((apres) => {
          // L'echeance ET les compteurs viennent du serveur, affiches tels
          // quels. Les recalculer ici dupliquerait FSRS et le seuil
          // « acquise » dans le navigateur, et les deux copies finiraient
          // par diverger.
          setProchaine(joursAvant(apres.card.dueLe));
          setJeu((j) => (j ? { ...j, etat: apres.etat } : j));
          setRetournee(false);
          setRang((r) => r + 1);
        })
        .catch((e) => setErreur(e as ApiError))
        .finally(() => setOccupe(false));
    },
    [carte, occupe],
  );

  /*
   * Raccourcis clavier : espace pour retourner, 1 a 4 pour noter.
   *
   * Ce n'est pas un ornement. Une session de vingt cartes demande quarante
   * clics a la souris ; au clavier, l'etudiant garde les mains en place et
   * va trois fois plus vite. C'est la raison pour laquelle tous les outils
   * du genre en ont.
   */
  useEffect(() => {
    if (!carte) return;
    const sur = (evenement: KeyboardEvent) => {
      const cible = evenement.target as HTMLElement | null;
      if (cible && ['INPUT', 'TEXTAREA'].includes(cible.tagName)) return;
      // Le texte source ouvert par-dessus : Espace ou 1 a 4 ne notent pas la
      // carte cachee derriere (components/SourceCours.tsx).
      if (cible?.closest('[role="dialog"]')) return;

      if (evenement.key === ' ' || evenement.key === 'Enter') {
        if (!retournee) {
          evenement.preventDefault();
          setRetournee(true);
        }
        return;
      }
      if (!retournee) return;
      const bouton = BOUTONS.find((b) => b.touche === evenement.key);
      if (bouton) {
        evenement.preventDefault();
        noter(bouton.cle);
      }
    };
    window.addEventListener('keydown', sur);
    return () => window.removeEventListener('keydown', sur);
  }, [carte, retournee, noter]);

  if (erreur && !jeu) {
    return (
      <section className="carte pile">
        <ErreurApi erreur={erreur} />
      </section>
    );
  }

  if (!jeu) return <Chargement lignes={3} />;

  // --- Aucun jeu : il faut le fabriquer ------------------------------------
  if (jeu.etat.total === 0) {
    return (
      <section className="carte pile">
        {erreur && <ErreurApi erreur={erreur} />}
        <EtatVide
          titre={t('cartes.videTitre')}
          action={
            <Bouton onClick={fabriquer} disabled={occupe}>
              {occupe ? t('cartes.fabrication') : t('cartes.fabriquer')}
            </Bouton>
          }
        >
          {t('cartes.videCorps')}
        </EtatVide>
      </section>
    );
  }

  const fini = rang >= jeu.cards.length;

  return (
    <section className="pile">
      {erreur && <ErreurApi erreur={erreur} />}

      {fabrication && (
        <Alerte>
          {t('cartes.fabriquees', {
            n: fabrication.creees,
            ignorees: fabrication.ignorees,
            appels: fabrication.appels,
          })}
        </Alerte>
      )}

      <div className="ligne grille-chiffres">
        <Compteur valeur={jeu.etat.total} libelle={t('cartes.total')} />
        <Compteur valeur={jeu.etat.dues} libelle={t('cartes.dues')} />
        <Compteur valeur={jeu.etat.neuves} libelle={t('cartes.neuves')} />
        <Compteur valeur={jeu.etat.acquises} libelle={t('cartes.acquises')} accent />
      </div>

      {fini ? (
        <EtatVide
          titre={t('cartes.finiTitre')}
          action={
            <Bouton secondaire onClick={charger}>
              {t('cartes.recharger')}
            </Bouton>
          }
        >
          {jeu.cards.length > 0
            ? t('cartes.finiCorps', { n: jeu.cards.length })
            : t('cartes.rienDuJour')}
        </EtatVide>
      ) : (
        carte && (
          <article className="carte pile carte-revision">
            <div className="ligne petit discret">
              <span>
                {t('cartes.position', { i: rang + 1, n: jeu.cards.length })}
              </span>
              {carte.repetitions === 0 && <Pastille>{t('cartes.neuve')}</Pastille>}
              {carte.revisions > 0 && (
                <span className="pousse">
                  {t('cartes.revue', { n: carte.revisions })}
                </span>
              )}
            </div>

            <p className="carte-recto">{carte.recto}</p>

            {retournee ? (
              <>
                <div className="carte-verso">
                  <strong>{carte.verso}</strong>
                  <p style={{ margin: '8px 0 0' }}>{carte.explication}</p>
                  {carte.citation && (
                    <Citation passage={carte.citation}>
                      {carte.citation}
                    </Citation>
                  )}
                </div>

                <div className="ligne notes-carte">
                  {BOUTONS.map((b) => (
                    <button
                      key={b.cle}
                      type="button"
                      className={`bouton-note ${b.ton}`}
                      onClick={() => noter(b.cle)}
                      disabled={occupe}
                    >
                      {t(`cartes.note.${b.cle}`)}
                      <span className="petit discret"> {b.touche}</span>
                    </button>
                  ))}
                </div>
                <p className="petit discret aide-clavier">{t('cartes.aide')}</p>
              </>
            ) : (
              <Bouton onClick={() => setRetournee(true)}>
                {t('cartes.retourner')}
              </Bouton>
            )}
          </article>
        )
      )}

      {prochaine !== null && !fini && (
        <p className="petit discret" style={{ margin: 0 }}>
          {prochaine <= 0
            ? t('cartes.revientAujourdhui')
            : t('cartes.revientDans', { n: prochaine })}
        </p>
      )}

      <div className="ligne">
        <Bouton secondaire onClick={fabriquer} disabled={occupe}>
          {t('cartes.completer')}
        </Bouton>
        <span className="petit discret">{t('cartes.completer.note')}</span>
      </div>
    </section>
  );
}

function Compteur({
  valeur,
  libelle,
  accent = false,
}: {
  valeur: number;
  libelle: string;
  accent?: boolean;
}) {
  return (
    <div className={`chiffre-cle${accent ? ' chiffre-accent' : ''}`}>
      <div className="chiffre-valeur">{valeur}</div>
      <div className="petit discret">{libelle}</div>
    </div>
  );
}
