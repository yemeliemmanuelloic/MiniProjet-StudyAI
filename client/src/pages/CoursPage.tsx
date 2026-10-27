import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import {
  Alerte,
  Bouton,
  Chargement,
  Champ,
  ErreurApi,
  EtatVide,
  Pastille,
  TeteDePage,
} from '../components/ui';
import { useRetours } from '../components/Retours';
import { TableauDuJour, useApercu } from '../components/TableauDuJour';
import { api, ApiError } from '../lib/api';
import { classeCours } from '../lib/couleurCours';
import { LOCALE, useI18n } from '../lib/i18n';
import { filtrerEtTrier, type Tri } from '../lib/triCours';
import type { Cours, CoursResume } from '../lib/types';

/**
 * Bibliotheque de cours de l'etudiant.
 *
 * Deux voies d'entree volontairement distinctes :
 *   - le collage de texte, qui marche toujours et ne depend de rien ;
 *   - l'import d'un fichier (PDF, .docx, .pptx, .txt, .md), plus confortable
 *     echoue sur un scan ou sur un document fait uniquement d'images.
 * La seconde ne remplace pas la premiere : le jour de la demonstration, un
 * fichier recalcitrant ne doit pas bloquer la seance.
 *
 * Aucun appel au modele ici. Creer un cours, c'est enregistrer du texte ; les
 * trois modules IA ne se declenchent que depuis la fiche du cours.
 */

const MIN_CARACTERES = 200;

function formaterDate(iso: string, locale: string): string {
  return new Date(iso).toLocaleDateString(locale, {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

export function CoursPage() {
  const { t, langue } = useI18n();
  const locale = LOCALE[langue];
  const [cours, setCours] = useState<CoursResume[] | null>(null);
  const [erreur, setErreur] = useState<ApiError | null>(null);
  const [formulaireOuvert, setFormulaireOuvert] = useState(false);
  const [recherche, setRecherche] = useState('');
  const [tri, setTri] = useState<Tri>('recent');
  const { notifier, confirmer } = useRetours();

  function charger() {
    setErreur(null);
    api<{ courses: CoursResume[] }>('/courses')
      .then((d) => setCours(d.courses))
      .catch((e) => {
        setErreur(e as ApiError);
        setCours([]);
      });
  }

  useEffect(charger, []);

  function ajouter(nouveau: Cours) {
    setCours((liste) => [
      { ...nouveau, _count: { summaries: 0, quizzes: 0, messages: 0 } },
      ...(liste ?? []),
    ]);
    setFormulaireOuvert(false);
    notifier(t('cours.ajoute', { titre: nouveau.title }));
  }

  async function supprimer(id: string, titre: string) {
    const ok = await confirmer({
      titre: t('cours.supprimer.titre'),
      message: t('cours.supprimer.confirmation', { titre }),
      action: t('cours.supprimer.action'),
      danger: true,
    });
    if (!ok) return;

    setErreur(null);
    try {
      await api<void>(`/courses/${id}`, { method: 'DELETE' });
      setCours((liste) => (liste ?? []).filter((c) => c.id !== id));
      notifier(t('cours.supprime', { titre }));
    } catch (e) {
      setErreur(e as ApiError);
    }
  }

  const totalQuiz = (cours ?? []).reduce((n, c) => n + c._count.quizzes, 0);
  const apercu = useApercu(cours);
  const affiches = useMemo(
    () => (cours ? filtrerEtTrier(cours, recherche, tri, apercu.parCours) : null),
    [cours, recherche, tri, apercu.parCours],
  );

  return (
    <main className="page pile page-cours">
      <TeteDePage
        surtitre={t('nav.cours')}
        titre={t('cours.titre')}
        sous={t('cours.sous')}
        actions={
          <>
          {/* Deux chiffres sur l'aplat : la tete annonce ce que contient la
              bibliotheque avant qu'on lise une carte. Calcules sur la liste
              deja chargee — aucun appel de plus. */}
          {cours && cours.length > 0 && (
            <div className="tete-stats">
              <div className="tete-stat">
                <strong>{cours.length}</strong>
                <span>{t(cours.length > 1 ? 'cours.stat.cours.pluriel' : 'cours.stat.cours')}</span>
              </div>
              <div className="tete-stat">
                <strong>{totalQuiz}</strong>
                <span>{t('cours.stat.quiz')}</span>
              </div>
            </div>
          )}
          {/* Secondaire aussi quand la liste est vide : l'etat vide porte
             deja « Ajouter mon premier cours » en plein, et deux boutons
             primaires identiques se disputaient le regard. */}
          <Bouton
            onClick={() => setFormulaireOuvert((o) => !o)}
            secondaire={formulaireOuvert || cours?.length === 0}
          >
            {formulaireOuvert ? t('cours.annuler') : t('cours.ajouter')}
          </Bouton>
          </>
        }
      />

      <ErreurApi erreur={erreur} onReessayer={charger} />

      {/* DEUX COLONNES sur grand ecran (20 octobre) : la liste a gauche,
          un panneau a droite avec le filtre et « Aujourd'hui ». Avant, tout
          s'empilait et la liste commencait sous la ligne de flottaison.
          Le panneau est ecrit AVANT la liste : sur telephone, l'ordre de
          lecture reste « Aujourd'hui », filtre, liste (index.css). */}
      <div className="cours-disposition">
        {cours && cours.length > 0 && (
          <aside className="cours-panneau" aria-label={t('cours.panneau')}>
            {cours && cours.length > 1 && (
              <div className="cours-outils cours-panneau-outils">
                <label className="cours-outil">
                  <span>{t('cours.filtre.libelle')}</span>
                  <input
                    type="search"
                    value={recherche}
                    placeholder={t('cours.filtre.indice')}
                    onChange={(e) => setRecherche(e.target.value)}
                  />
                </label>
                <label className="cours-outil">
                  <span>{t('cours.tri.libelle')}</span>
                  <select value={tri} onChange={(e) => setTri(e.target.value as Tri)}>
                    <option value="recent">{t('cours.tri.recent')}</option>
                    <option value="titre">{t('cours.tri.titre')}</option>
                    <option value="revoir">{t('cours.tri.revoir')}</option>
                    <option value="score">{t('cours.tri.score')}</option>
                  </select>
                </label>
              </div>
            )}
            <TableauDuJour cours={cours} apercu={apercu} />
            {/* Le calendrier et la courbe vivent dans « Mon compte › Mon
                activite » : ici, on dit quoi faire maintenant. */}
            <Link className="jour-lien activite-lien" to="/compte?onglet=activite">
              {t('activite.voir')} →
            </Link>
          </aside>
        )}
        <div className="cours-principal pile">
          {formulaireOuvert && <FormulaireCours onCree={ajouter} />}

          {/* Le squelette, et non un « Chargement… » en texte nu : c'est le
              composant utilise partout ailleurs, et il dessine la forme de ce qui
              arrive au lieu de faire patienter devant un mot. */}
          {cours === null && <Chargement lignes={3} />}

          {cours?.length === 0 && !formulaireOuvert && (
            <EtatVide
              titre={t('cours.vide.titre')}
              action={
                <Bouton onClick={() => setFormulaireOuvert(true)}>{t('cours.vide.action')}</Bouton>
              }
            >
              {t('cours.vide.corps', { min: MIN_CARACTERES })}
            </EtatVide>
          )}

          {affiches && affiches.length === 0 && cours && cours.length > 0 && (
            <EtatVide
              titre={t('cours.filtre.aucun', { q: recherche })}
              illustration={null}
              action={
                <Bouton secondaire onClick={() => setRecherche('')}>
                  {t('cours.filtre.effacer')}
                </Bouton>
              }
            />
          )}

          {/* GRILLE, et non plus pile. Le cours le plus recent occupe les deux
              colonnes : c'est celui sur lequel l'etudiant travaille, et la taille
              le dit sans un mot. Voir DECISIONS 026. */}
          <div className="grille-cours">
          {affiches?.map((c) => {
            const analyse = c._count.summaries + c._count.quizzes + c._count.messages;
            const suivi = apercu.parCours[c.id];
            const score = suivi?.progression?.attemptCount ? suivi.progression.averageScore : null;
            const dues = suivi?.dues ?? 0;
            return (
              <article key={c.id} className={`carte carte-cours ${classeCours(c.title)}`}>
                <div className="cours-tete">
                  {/* Pastille d'initiale : la liste n'avait aucun point d'ancrage
                      visuel, toutes les lignes se ressemblaient. */}
                  <span className="cours-initiale" aria-hidden="true">
                    {c.title.trim().charAt(0).toUpperCase()}
                  </span>

                  <div className="cours-corps">
                  {/* Lien etendu : c'est la CARTE ENTIERE qui ouvre le cours, pas
                      seulement le titre. Le pseudo-element couvre la carte ; le
                      bouton de suppression repasse au-dessus par z-index. Un
                      <button> imbrique dans un <a> serait du balisage invalide. */}
                    <Link to={`/cours/${c.id}`} className="cours-titre lien-etendu">
                      {c.title}
                    </Link>
                    <div className="cours-meta petit discret">
                      {c.subject && <span>{c.subject}</span>}
                      <span>{t('cours.caracteres', { n: c.charCount.toLocaleString(locale) })}</span>
                      <span>{t('cours.ajouteLe', { date: formaterDate(c.createdAt, locale) })}</span>
                    </div>
                  </div>
                </div>

                <div className="cours-pastilles">
                  {analyse === 0 ? (
                    <span className="petit discret">{t('cours.pasAnalyse')}</span>
                  ) : (
                    <>
                      {c._count.summaries > 0 && (
                        <Pastille ton="marque">
                          {t(c._count.summaries > 1 ? 'cours.resumes.pluriel' : 'cours.resumes', {
                            n: c._count.summaries,
                          })}
                        </Pastille>
                      )}
                      {c._count.quizzes > 0 && (
                        <Pastille>{t('cours.quiz', { n: c._count.quizzes })}</Pastille>
                      )}
                      {c._count.messages > 0 && (
                        <Pastille>
                          {t(c._count.messages > 1 ? 'cours.messages.pluriel' : 'cours.messages', {
                            n: c._count.messages,
                          })}
                        </Pastille>
                      )}
                      {dues > 0 && (
                        <Pastille ton="alerte">
                          {dues > 1 ? t('cours.carte.dues', { n: dues }) : t('cours.carte.due')}
                        </Pastille>
                      )}
                    </>
                  )}
                </div>

                {/* Le suivi, sur la carte meme : ou en est l'etudiant sur ce cours,
                    sans avoir a l'ouvrir. Absent tant qu'aucun quiz n'est rendu. */}
                {score !== null && (
                  <div className="cours-suivi">
                    <span className="cours-suivi-barre" role="img" aria-label={`${score} %`}>
                      <i style={{ width: `${score}%` }} />
                    </span>
                    <span className="petit discret">{t('cours.carte.score', { n: score })}</span>
                  </div>
                )}

                {/* La suppression etait le bouton le plus visible de la carte :
                    une action destructrice au meme poids que le titre. Elle
                    devient discrete, et ne se colore qu'au survol. */}
                <button
                  type="button"
                  className="cours-supprimer"
                  onClick={() => supprimer(c.id, c.title)}
                  title={t('cours.supprimer', { titre: c.title })}
                  aria-label={t('cours.supprimer', { titre: c.title })}
                >
                  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                    <path
                      d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"
                      stroke="currentColor"
                      strokeWidth="1.8"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </button>
              </article>
            );
          })}
          </div>
        </div>
      </div>
    </main>
  );
}

/* --- Creation : texte colle ou fichier importe --- */

/* Fichiers sans texte, lus par un modele (decision 043). Memes listes que le
   serveur (services/extraction.py). */
const AUDIO = ['.mp3', '.m4a', '.wav', '.ogg', '.flac', '.webm', '.mp4', '.mpeg', '.mpga'];
const IMAGES = ['.jpg', '.jpeg', '.png', '.webp', '.heic'];
type Nature = 'enregistrement' | 'document';

function natureDe(nom: string): Nature | null {
  const extension = nom.slice(nom.lastIndexOf('.')).toLowerCase();
  if (AUDIO.includes(extension)) return 'enregistrement';
  if (IMAGES.includes(extension)) return 'document';
  return null;
}

/* Meme plafond que le serveur (routers/courses.py, TAILLE_MAX_FICHIER).
   Verifie AVANT l'envoi : sans cela, un enregistrement de 200 Mo etait
   televerse en entier, pendant de longues minutes, pour etre refuse a
   l'arrivee. */
const TAILLE_MAX_FICHIER = 25 * 1024 * 1024;

function FormulaireCours({ onCree }: { onCree: (cours: Cours) => void }) {
  const { t, langue } = useI18n();
  const locale = LOCALE[langue];
  const [mode, setMode] = useState<'texte' | 'fichier'>('texte');
  const [titre, setTitre] = useState('');
  const [matiere, setMatiere] = useState('');
  const [contenu, setContenu] = useState('');
  const [fichier, setFichier] = useState<File | null>(null);
  /* Un fichier qui part SANS MASQUAGE exige l'accord explicite de
     l'etudiant, pour ce fichier-la. La nature vient de l'extension, ou du
     serveur quand il decouvre qu'un PDF est scanne. */
  const [nature, setNature] = useState<Nature | null>(null);
  const [consentement, setConsentement] = useState(false);
  const [envoi, setEnvoi] = useState(false);
  const [erreur, setErreur] = useState<ApiError | null>(null);

  const saisi = contenu.trim().length;
  const tropLourd = mode === 'fichier' && fichier !== null && fichier.size > TAILLE_MAX_FICHIER;
  const tropCourt = mode === 'texte' && saisi > 0 && saisi < MIN_CARACTERES;
  const pretAEnvoyer =
    titre.trim().length >= 3 &&
    (mode === 'texte'
      ? saisi >= MIN_CARACTERES
      : fichier !== null && !tropLourd && (nature === null || consentement));

  async function soumettre(e: FormEvent) {
    e.preventDefault();
    setErreur(null);
    setEnvoi(true);
    try {
      if (mode === 'texte') {
        const d = await api<{ course: Cours }>('/courses', {
          body: {
            title: titre.trim(),
            subject: matiere.trim() || undefined,
            content: contenu.trim(),
          },
        });
        onCree(d.course);
      } else {
        const formulaire = new FormData();
        formulaire.append('file', fichier!);
        formulaire.append('title', titre.trim());
        if (matiere.trim()) formulaire.append('subject', matiere.trim());
        if (nature && consentement) formulaire.append('consentement', 'true');
        const d = await api<{ course: Cours }>('/courses/import', { raw: formulaire });
        onCree(d.course);
      }
    } catch (err) {
      const e = err as ApiError;
      // PDF scanne : le serveur demande l'accord, l'encadre d'accord apparait.
      const requis = e.details?.consentement_requis as Nature | undefined;
      if (requis && !consentement) setNature(requis);
      setErreur(e);
    } finally {
      setEnvoi(false);
    }
  }

  return (
    <form className="carte pile" onSubmit={soumettre}>
      <div className="ligne" style={{ gap: 8 }}>
        <button
          type="button"
          className={`bouton${mode === 'texte' ? '' : ' bouton-secondaire'}`}
          onClick={() => setMode('texte')}
        >
          {t('forme.collerTexte')}
        </button>
        <button
          type="button"
          className={`bouton${mode === 'fichier' ? '' : ' bouton-secondaire'}`}
          onClick={() => setMode('fichier')}
        >
          {t('forme.importerFichier')}
        </button>
      </div>

      <div className="ligne" style={{ alignItems: 'flex-start' }}>
        <div style={{ flex: '1 1 260px' }}>
          <Champ
            libelle={t('forme.titre')}
            name="title"
            required
            placeholder={t('forme.titre.exemple')}
            value={titre}
            onChange={(e) => setTitre(e.target.value)}
          />
        </div>
        <div style={{ flex: '1 1 200px' }}>
          <Champ
            libelle={t('forme.matiere')}
            name="subject"
            placeholder={t('forme.matiere.exemple')}
            value={matiere}
            onChange={(e) => setMatiere(e.target.value)}
          />
        </div>
      </div>

      {mode === 'texte' ? (
        <div className={`champ${tropCourt ? ' champ-erreur' : ''}`}>
          <label htmlFor="contenu">{t('forme.contenu')}</label>
          <textarea
            id="contenu"
            rows={10}
            placeholder={t('forme.contenu.exemple')}
            value={contenu}
            onChange={(e) => setContenu(e.target.value)}
          />
          <span className={tropCourt ? 'message-erreur' : 'petit discret'}>
            {tropCourt
              ? t('forme.contenu.troPeu', { n: saisi.toLocaleString(locale), min: MIN_CARACTERES })
              : t('forme.contenu.compte', { n: saisi.toLocaleString(locale) })}
          </span>
        </div>
      ) : (
        <div className="pile" style={{ gap: 8 }}>
          <div className={`champ${tropLourd ? ' champ-erreur' : ''}`}>
            <label htmlFor="fichier">{t('forme.fichier')}</label>
            {/*
              Des EXTENSIONS et non des types MIME : le navigateur les compare
              au nom du fichier, la ou un type MIME depend de ce que le systeme
              d'exploitation declare — et Windows annonce volontiers
              application/octet-stream pour un .pptx. C'est le meme critere que
              le serveur applique (voir services/extraction.py), donc les deux
              filtres ne peuvent pas diverger.
            */}
            <input
              id="fichier"
              type="file"
              accept={['.pdf', '.docx', '.pptx', '.txt', '.md', ...AUDIO, ...IMAGES].join(',')}
              onChange={(e) => {
                const choisi = e.target.files?.[0] ?? null;
                setFichier(choisi);
                setNature(choisi ? natureDe(choisi.name) : null);
                setConsentement(false);
                setErreur(null);
              }}
            />
            {tropLourd ? (
              <span className="message-erreur" role="alert">
                {t('forme.fichier.tropLourd', {
                  taille: (fichier!.size / 1024 / 1024).toLocaleString(locale, { maximumFractionDigits: 1 }),
                })}
              </span>
            ) : (
              <span className="petit discret">{t('forme.fichier.formats')}</span>
            )}
          </div>
          {nature && !tropLourd && (
            <div className="envoi-brut" role="group" aria-labelledby="envoi-brut-titre">
              <p id="envoi-brut-titre" className="envoi-brut-titre">
                {t(nature === 'enregistrement' ? 'forme.envoi.titre.enregistrement' : 'forme.envoi.titre.document')}
              </p>
              <p className="envoi-brut-corps">{t('forme.envoi.corps')}</p>
              <label className="case-cgu">
                <input type="checkbox" checked={consentement} onChange={(e) => setConsentement(e.target.checked)} />
                <span>{t('forme.envoi.accepter')}</span>
              </label>
            </div>
          )}
          <p className="petit discret" style={{ margin: 0 }}>
            {t('forme.fichier.avertissement')}
          </p>
          <Alerte ton="info">
            {t('forme.fichier.notes')}
          </Alerte>
        </div>
      )}

      <ErreurApi erreur={erreur} />

      <div className="ligne">
        <Bouton type="submit" disabled={!pretAEnvoyer || envoi}>
          {envoi ? (nature && consentement ? t('forme.lecture.encours') : t('forme.enregistrement')) : t('forme.enregistrer')}
        </Bouton>
        {/* Faux pour un fichier lu par l'IA : la phrase disparait alors. */}
        {!(mode === 'fichier' && nature) && (
          <span className="petit discret">
            {t('forme.gratuit')}
          </span>
        )}
      </div>
    </form>
  );
}
