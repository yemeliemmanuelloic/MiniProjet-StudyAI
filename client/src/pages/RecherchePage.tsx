import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import {
  Alerte,
  Bouton,
  Chargement,
  ErreurApi,
  EtatVide,
  Pastille,
  TeteDePage,
} from '../components/ui';
import { api, ApiError } from '../lib/api';
import { useT } from '../lib/i18n';
import type { ReponseBibliotheque, ResultatsRecherche } from '../lib/types';

/**
 * Recherche et tuteur sur TOUTE la bibliotheque.
 *
 * Deux actions au cout tres different, et l'interface le dit explicitement :
 *
 *   - chercher : purement lexical, aucun appel au modele. Instantane, gratuit,
 *     et fonctionne meme si le fournisseur est en panne.
 *   - demander au tuteur : un appel, quel que soit le nombre de cours, parce
 *     que la selection des passages a deja ete faite cote serveur en local.
 *
 * Afficher ce cout n'est pas de la decoration : c'est la seule facon pour
 * l'etudiant de savoir ce qu'il consomme sur un palier gratuit.
 */

/** Surligne les mots cherches dans un extrait, accents et casse ignores. */
function Surligne({ texte, termes }: { texte: string; termes: string[] }) {
  if (termes.length === 0) return <>{texte}</>;

  // La comparaison se fait sur une copie sans accents, mais les tranches sont
  // prises dans le texte D'ORIGINE : retirer les accents a l'affichage
  // abimerait le cours.
  const plat = texte
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();

  const marques: [number, number][] = [];
  for (const terme of termes) {
    let depuis = 0;
    for (;;) {
      const trouve = plat.indexOf(terme, depuis);
      if (trouve === -1) break;
      marques.push([trouve, trouve + terme.length]);
      depuis = trouve + terme.length;
    }
  }
  if (marques.length === 0) return <>{texte}</>;

  marques.sort((a, b) => a[0] - b[0]);
  const morceaux: React.ReactNode[] = [];
  let curseur = 0;
  marques.forEach(([debut, fin], i) => {
    if (debut < curseur) return; // chevauchement : on garde la premiere marque
    if (debut > curseur) morceaux.push(texte.slice(curseur, debut));
    morceaux.push(<mark key={i}>{texte.slice(debut, fin)}</mark>);
    curseur = fin;
  });
  morceaux.push(texte.slice(curseur));
  return <>{morceaux}</>;
}

export function RecherchePage() {
  const t = useT();
  const [requete, setRequete] = useState('');
  const [resultats, setResultats] = useState<ResultatsRecherche | null>(null);
  const [reponse, setReponse] = useState<ReponseBibliotheque | null>(null);
  const [cherche, setCherche] = useState(false);
  const [demande, setDemande] = useState(false);
  const [erreur, setErreur] = useState<ApiError | null>(null);
  const champ = useRef<HTMLInputElement>(null);
  /* `null` tant qu'on ne sait pas : on n'affiche pas « aucun cours » avant
     d'avoir la reponse, sinon l'ecran clignote a chaque visite. */
  const [aucunCours, setAucunCours] = useState<boolean | null>(null);

  useEffect(() => champ.current?.focus(), []);

  useEffect(() => {
    api<{ courses: unknown[] }>('/courses')
      .then((d) => setAucunCours(d.courses.length === 0))
      .catch(() => setAucunCours(false));
  }, []);

  async function chercher(e: FormEvent) {
    e.preventDefault();
    if (requete.trim().length < 2) return;
    setErreur(null);
    setReponse(null);
    setCherche(true);
    try {
      setResultats(
        await api<ResultatsRecherche>(`/search?q=${encodeURIComponent(requete.trim())}`),
      );
    } catch (err) {
      setErreur(err as ApiError);
    } finally {
      setCherche(false);
    }
  }

  async function demanderAuTuteur() {
    setErreur(null);
    setDemande(true);
    try {
      setReponse(
        await api<ReponseBibliotheque>('/ask', { body: { question: requete.trim() } }),
      );
    } catch (err) {
      setErreur(err as ApiError);
    } finally {
      setDemande(false);
    }
  }

  return (
    <main className="page pile">
      <TeteDePage
        surtitre={t('nav.recherche')}
        titre={t('recherche.titre')}
        sous={t('recherche.sous')}
      >
        {/* LE CHAMP VIT DANS LA TETE, et c'est la troisieme mise en page
            differente du lot. Sur un ecran dont la raison d'etre EST la
            recherche, reléguer le champ dans une carte sous le titre en fait
            un outil parmi d'autres. Ici, il est l'ecran. */}
        <form className="tete-recherche" onSubmit={chercher}>
          <label htmlFor="q" className="tete-recherche-label">
            {t('recherche.champ')}
          </label>
          <div className="tete-recherche-ligne">
            <input
              id="q"
              ref={champ}
              type="search"
              placeholder={t('recherche.exemple')}
              value={requete}
              onChange={(e) => setRequete(e.target.value)}
            />
            <Bouton type="submit" disabled={requete.trim().length < 2 || cherche}>
              {cherche ? t('recherche.encours') : t('recherche.action')}
            </Bouton>
          </div>
        </form>
      </TeteDePage>

      <ErreurApi erreur={erreur} />

      {cherche && <Chargement lignes={3} />}

      {resultats && !cherche && (
        <>
          <div className="ligne">
            <h2 style={{ margin: 0 }}>
              {resultats.passages.length === 0
                ? t('recherche.aucun')
                : t(
                    resultats.passages.length > 1
                      ? 'recherche.compte.pluriel'
                      : 'recherche.compte',
                    { n: resultats.passages.length },
                  )}
            </h2>
            <span className="petit discret pousse">
              {t('recherche.gratuit')}
            </span>
          </div>

          {resultats.passages.length === 0 ? (
            <Alerte ton="attention">
              {t('recherche.rien')}
            </Alerte>
          ) : (
            resultats.passages.map((p, i) => (
              <article key={i} className="carte pile" style={{ gap: 8 }}>
                <div className="ligne">
                  <Link to={`/cours/${p.courseId}`}>
                    <strong>{p.courseTitle}</strong>
                  </Link>
                  <Pastille>
                    {t('recherche.passage', { n: p.rang, total: p.total })}
                  </Pastille>
                </div>
                <p style={{ margin: 0 }}>
                  <Surligne texte={p.extrait} termes={resultats.terms} />
                </p>
              </article>
            ))
          )}

          <section className="carte pile">
            <h2 style={{ margin: 0 }}>{t('tuteur.titre')}</h2>
            {/* Sans passage a lire, le tuteur repondrait « non couvert » sans
                rien consulter. Proposer le bouton reviendrait a promettre une
                reponse que l'on sait vide. */}
            {resultats.passages.length === 0 ? (
              <p className="petit discret" style={{ margin: 0 }}>
                {t('tuteur.sansPassage')}
              </p>
            ) : (
              <>
                <p className="petit discret" style={{ margin: 0 }}>
                  {t('examen.lit', {
                    passages:
                      resultats.passages.length === 1
                        ? t('tuteur.unPassage')
                        : t('tuteur.nPassages', {
                            n: Math.min(3, resultats.passages.length),
                          }),
                  })}{' '}
                  <strong>{t('examen.unAppel')}</strong>
                </p>
                <div className="ligne">
                  <Bouton onClick={demanderAuTuteur} disabled={demande}>
                    {demande ? t('tuteur.encours') : t('tuteur.action')}
                  </Bouton>
                </div>
              </>
            )}

            {demande && <Chargement lignes={2} message={t('chargement.tuteur')} />}

            {reponse && !demande && (
              <div className="pile" style={{ gap: 10 }}>
                <div className="ligne">
                  <Pastille ton={reponse.grounded ? 'succes' : 'alerte'}>
                    {reponse.grounded ? t('tuteur.ancree') : t('tuteur.nonCouverte')}
                  </Pastille>
                  {!reponse.appeleLeModele && (
                    <Pastille>{t('tuteur.sansAppel')}</Pastille>
                  )}
                  {reponse.latencyMs !== null && (
                    <span className="petit discret pousse">
                      {reponse.model} · {reponse.latencyMs} ms
                    </span>
                  )}
                </div>

                <p style={{ margin: 0 }}>{reponse.answer}</p>

                {reponse.sources.length > 0 && (
                  <div className="pile" style={{ gap: 6 }}>
                    <span className="petit discret">{t('tuteur.sources')}</span>
                    {reponse.sources.map((s, i) => (
                      <blockquote key={i} className="citation">
                        {s}
                      </blockquote>
                    ))}
                  </div>
                )}

                {reponse.courses.length > 0 && (
                  <span className="petit discret">
                    {t('tuteur.coursConsultes')}{' '}
                    {reponse.courses.map((c, i) => (
                      <span key={c.id}>
                        {i > 0 && ' · '}
                        <Link to={`/cours/${c.id}`}>{c.title}</Link>
                      </span>
                    ))}
                  </span>
                )}

                {reponse.tokenTypes.length > 0 && (
                  <span className="petit discret">
                    {t('tuteur.masque', { types: reponse.tokenTypes.join(', ') })}
                  </span>
                )}
              </div>
            )}
          </section>
        </>
      )}

      {!resultats && !cherche && (
        /* Un inscrit sans aucun cours voyait un champ de recherche et
           « Tapez un mot du cours » — une invitation a chercher dans le vide.
           Examen blanc et Consommation geraient ce cas, pas cette page. */
        aucunCours ? (
          <EtatVide
            titre={t('recherche.sansCoursTitre')}
            action={
              <Link className="bouton" to="/cours">
                {t('recherche.importer')}
              </Link>
            }
          >
            {t('recherche.sansCoursCorps')}
          </EtatVide>
        ) : (
          <EtatVide titre={t('recherche.videTitre')}>
            {t('recherche.videCorps')}
          </EtatVide>
        )
      )}
    </main>
  );
}
