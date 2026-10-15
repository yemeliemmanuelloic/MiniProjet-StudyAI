import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { Alerte, Bouton, Chargement, ErreurApi, EtatVide, Pastille } from '../components/ui';
import { api, ApiError } from '../lib/api';
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
      <div>
        <h1>Chercher dans mes cours</h1>
        <p className="discret">
          Une seule recherche sur toute votre bibliotheque, pour retrouver dans quel chapitre
          une notion a ete vue. <strong>La recherche n’appelle pas le modele</strong> : elle est
          instantanee, gratuite, et fonctionne meme hors ligne cote serveur.
        </p>
      </div>

      <form className="carte ligne" onSubmit={chercher} style={{ alignItems: 'flex-end' }}>
        <div className="champ" style={{ flex: 1 }}>
          <label htmlFor="q">Que cherchez-vous ?</label>
          <input
            id="q"
            ref={champ}
            type="search"
            placeholder="execution symbolique, preemption, Gherkin…"
            value={requete}
            onChange={(e) => setRequete(e.target.value)}
          />
        </div>
        <Bouton type="submit" disabled={requete.trim().length < 2 || cherche}>
          {cherche ? 'Recherche…' : 'Chercher'}
        </Bouton>
      </form>

      <ErreurApi erreur={erreur} />

      {cherche && <Chargement lignes={3} />}

      {resultats && !cherche && (
        <>
          <div className="ligne">
            <h2 style={{ margin: 0 }}>
              {resultats.passages.length === 0
                ? 'Aucun passage'
                : `${resultats.passages.length} passage${
                    resultats.passages.length > 1 ? 's' : ''
                  }`}
            </h2>
            <span className="petit discret pousse">
              Recherche lexicale, {resultats.passages.length === 0 ? '0' : 'aucun'} appel au
              modele
            </span>
          </div>

          {resultats.passages.length === 0 ? (
            <Alerte ton="attention">
              Aucun de vos cours n’emploie ces mots. La recherche est <strong>lexicale</strong> :
              elle compare les mots, pas le sens. Essayez avec les termes employes dans le cours
              — « preemption » plutot que « priorite des taches ».
            </Alerte>
          ) : (
            resultats.passages.map((p, i) => (
              <article key={i} className="carte pile" style={{ gap: 8 }}>
                <div className="ligne">
                  <Link to={`/cours/${p.courseId}`}>
                    <strong>{p.courseTitle}</strong>
                  </Link>
                  <Pastille>
                    passage {p.rang} / {p.total}
                  </Pastille>
                </div>
                <p style={{ margin: 0 }}>
                  <Surligne texte={p.extrait} termes={resultats.terms} />
                </p>
              </article>
            ))
          )}

          <section className="carte pile">
            <h2 style={{ margin: 0 }}>Demander au tuteur</h2>
            {/* Sans passage a lire, le tuteur repondrait « non couvert » sans
                rien consulter. Proposer le bouton reviendrait a promettre une
                reponse que l'on sait vide. */}
            {resultats.passages.length === 0 ? (
              <p className="petit discret" style={{ margin: 0 }}>
                Aucun passage a lire : le tuteur repondrait sans rien consulter. Reformulez avec
                les mots du cours.
              </p>
            ) : (
              <>
                <p className="petit discret" style={{ margin: 0 }}>
                  Le tuteur lit{' '}
                  {resultats.passages.length === 1
                    ? "l'unique passage trouve"
                    : `les ${Math.min(3, resultats.passages.length)} passages les plus proches`}
                  , tous cours confondus, et repond en citant le cours dont vient chaque source.{' '}
                  <strong>Un seul appel au modele</strong>, quel que soit le nombre de cours.
                </p>
                <div className="ligne">
                  <Bouton onClick={demanderAuTuteur} disabled={demande}>
                    {demande ? 'Le tuteur reflechit…' : 'Demander au tuteur'}
                  </Bouton>
                </div>
              </>
            )}

            {demande && <Chargement lignes={2} message="Lecture des passages retenus, puis reponse…" />}

            {reponse && !demande && (
              <div className="pile" style={{ gap: 10 }}>
                <div className="ligne">
                  <Pastille ton={reponse.grounded ? 'succes' : 'alerte'}>
                    {reponse.grounded ? 'Ancree dans vos cours' : 'Non couverte'}
                  </Pastille>
                  {!reponse.appeleLeModele && (
                    <Pastille>Repondu sans appel au modele</Pastille>
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
                    <span className="petit discret">Sources citees</span>
                    {reponse.sources.map((s, i) => (
                      <blockquote key={i} className="citation">
                        {s}
                      </blockquote>
                    ))}
                  </div>
                )}

                {reponse.courses.length > 0 && (
                  <span className="petit discret">
                    Cours consultes :{' '}
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
                    Donnees personnelles masquees avant l’envoi :{' '}
                    {reponse.tokenTypes.join(', ')}
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
            titre="Aucun cours a fouiller"
            action={
              <Link className="bouton" to="/cours">
                Importer un cours
              </Link>
            }
          >
            La recherche parcourt vos supports. Importez-en au moins un, et vous pourrez
            retrouver une notion sans vous souvenir du chapitre.
          </EtatVide>
        ) : (
          <EtatVide titre="Cherchez une notion">
            Tapez un mot du cours. StudyAI parcourt tous vos supports et vous dit dans lequel, et
            a quel endroit, il apparait.
          </EtatVide>
        )
      )}
    </main>
  );
}
