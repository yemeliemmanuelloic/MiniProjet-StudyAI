import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Alerte, Chargement, ErreurApi, EtatVide, Pastille } from '../components/ui';
import { api, ApiError } from '../lib/api';
import type { Consommation } from '../lib/types';

/**
 * Ce que l'IA a coute.
 *
 * Toute cette telemetrie etait deja enregistree a chaque operation depuis le
 * premier jour — modele, jetons, latence — et n'apparaissait NULLE PART. Des
 * donnees collectees que personne ne regarde ne servent a rien ; pires, elles
 * donnent l'illusion d'une mesure.
 *
 * Trois partis pris d'affichage, tous destines a ne pas tromper le lecteur :
 *
 *   - le TARIF est affiche a cote du montant, avec sa source. Une estimation
 *     en argent dont la provenance n'est pas visible se lit comme un fait ;
 *   - les operations dont le nombre d'appels n'a pas ete enregistre sont
 *     comptees A PART, jamais fondues dans le total ;
 *   - ce qui n'est pas mesure est dit comme tel, pas omis.
 */

const nf = new Intl.NumberFormat('fr-FR');

function argent(montant: number, devise: string): string {
  // Quatre decimales : a ces volumes, deux arrondiraient tout a 0,00 — ce qui
  // donnerait l'impression trompeuse que rien n'a ete consomme.
  return `${montant.toFixed(4)} ${devise}`;
}

export function ConsommationPage() {
  const [donnees, setDonnees] = useState<Consommation | null>(null);
  const [erreur, setErreur] = useState<ApiError | null>(null);

  useEffect(() => {
    api<Consommation>('/usage')
      .then(setDonnees)
      .catch((e) => setErreur(e as ApiError));
  }, []);

  if (erreur) {
    return (
      <main className="page">
        <ErreurApi erreur={erreur} />
      </main>
    );
  }

  if (!donnees) {
    return (
      <main className="page">
        <Chargement lignes={4} />
      </main>
    );
  }

  const { total, tarif, gratuit } = donnees;
  const vide = total.operations === 0;

  return (
    <main className="page pile">
      <div>
        <h1>Ce que l’IA a coute</h1>
        <p className="discret">
          Jetons consommes, appels effectues, latence et cout estime. Ces mesures sont
          enregistrees a chaque operation depuis le premier jour.{' '}
          <strong>Consulter cette page n’appelle pas le modele.</strong>
        </p>
      </div>

      {vide ? (
        <EtatVide
          titre="Rien a mesurer pour l’instant"
          action={
            <Link className="bouton" to="/cours">
              Importer un cours
            </Link>
          }
        >
          Generez un resume ou un quiz, et cette page vous dira exactement ce qu’il a coute.
        </EtatVide>
      ) : (
        <>
          <div className="ligne grille-chiffres">
            <Chiffre valeur={nf.format(total.operations)} libelle="operations" />
            {/* Afficher « 0 appels » alors que des operations existent sans
                decompte serait faux a la lecture, meme si le total des appels
                CONNUS vaut bien zero. Un tiret dit « non mesure ». */}
            <Chiffre
              valeur={
                total.calls === 0 && total.operationsSansDecompte > 0
                  ? '—'
                  : nf.format(total.calls)
              }
              libelle="appels au modele"
            />
            <Chiffre valeur={nf.format(total.tokensIn)} libelle="jetons en entree" />
            <Chiffre valeur={nf.format(total.tokensOut)} libelle="jetons en sortie" />
            <Chiffre valeur={argent(total.cout, tarif.devise)} libelle="cout estime" accent />
          </div>

          <Alerte>
            Cout estime au tarif de{' '}
            <strong>
              {tarif.entreeParMillion.toFixed(2)} {tarif.devise}
            </strong>{' '}
            par million de jetons en entree et{' '}
            <strong>
              {tarif.sortieParMillion.toFixed(2)} {tarif.devise}
            </strong>{' '}
            en sortie. Source : <em>{tarif.source}</em>. La page officielle du fournisseur fait
            foi — ce chiffre est un ordre de grandeur, pas une facture.
          </Alerte>

          {total.operationsSansDecompte > 0 && (
            <Alerte ton="attention">
              {total.operationsSansDecompte} operation
              {total.operationsSansDecompte > 1 ? 's' : ''} ne porte
              {total.operationsSansDecompte > 1 ? 'nt' : ''} pas de decompte d’appels : elle
              {total.operationsSansDecompte > 1 ? 's sont' : ' est'} anterieure
              {total.operationsSansDecompte > 1 ? 's' : ''} a l’enregistrement de cette donnee.
              Les jetons, eux, sont comptes. Mieux vaut un trou signale qu’un total faux.
            </Alerte>
          )}

          <section className="carte pile">
            <h2>Par module</h2>
            <div className="tableau-defilant">
              <table className="tableau">
                <thead>
                  <tr>
                    <th>Module</th>
                    <th>Operations</th>
                    <th>Appels</th>
                    <th>Jetons entree</th>
                    <th>Jetons sortie</th>
                    <th>Latence moy.</th>
                    <th>Cout</th>
                  </tr>
                </thead>
                <tbody>
                  {donnees.parModule.map((m) => (
                    <tr key={m.module}>
                      <td>{m.module}</td>
                      <td>{nf.format(m.operations)}</td>
                      <td>
                        {m.calls === 0 && m.operationsSansDecompte > 0
                          ? '—'
                          : nf.format(m.calls)}
                        {m.operationsSansDecompte > 0 && (
                          <span
                            className="petit discret"
                            title={`${m.operationsSansDecompte} operation(s) sans decompte enregistre`}
                          >
                            {' '}
                            ({m.operationsSansDecompte} non mesuree
                            {m.operationsSansDecompte > 1 ? 's' : ''})
                          </span>
                        )}
                      </td>
                      <td>{nf.format(m.tokensIn)}</td>
                      <td>{nf.format(m.tokensOut)}</td>
                      <td>{m.latenceMoyenneMs ? `${nf.format(m.latenceMoyenneMs)} ms` : '—'}</td>
                      <td>{argent(m.cout, tarif.devise)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="petit discret" style={{ margin: 0 }}>
              <strong>Une operation n’est pas un appel.</strong> Un cours long est resume segment
              par segment, puis agrege : une seule operation, plusieurs appels.
            </p>
          </section>

          {donnees.parCours.length > 0 && (
            <section className="carte pile">
              <h2>Par cours</h2>
              <p className="petit discret" style={{ marginTop: -6 }}>
                Du plus couteux au moins couteux.
              </p>
              {donnees.parCours.map((c) => (
                <div key={c.courseId} className="ligne">
                  <Link to={`/cours/${c.courseId}`} style={{ flex: 1 }}>
                    {c.courseTitle}
                  </Link>
                  <span className="petit discret">
                    {nf.format(c.operations)} operation{c.operations > 1 ? 's' : ''} ·{' '}
                    {nf.format(c.tokensIn + c.tokensOut)} jetons
                  </span>
                  <Pastille>{argent(c.cout, tarif.devise)}</Pastille>
                </div>
              ))}
            </section>
          )}

          <section className="carte pile">
            <h2>Par modele</h2>
            <p className="petit discret" style={{ marginTop: -6 }}>
              La bascule entre fournisseurs se fait par une variable d’environnement, et
              l’historique garde la trace de qui a repondu. C’est ce tableau qui servira le jour
              d’une comparaison.
            </p>
            {donnees.parModele.map((m) => (
              <div key={m.model} className="ligne">
                <code style={{ flex: 1 }}>{m.model}</code>
                <span className="petit discret">
                  {nf.format(m.operations)} operation{m.operations > 1 ? 's' : ''}
                  {m.latenceMoyenneMs !== null && ` · ${nf.format(m.latenceMoyenneMs)} ms`}
                </span>
                <Pastille>{argent(m.cout, tarif.devise)}</Pastille>
              </div>
            ))}
          </section>
        </>
      )}

      <section className="carte pile">
        <h2>Ce qui n’a rien coute</h2>
        <div className="ligne grille-chiffres">
          <Chiffre valeur={nf.format(gratuit.examens)} libelle="examens blancs" />
          <Chiffre valeur={nf.format(gratuit.questionsServies)} libelle="questions servies" />
          <Chiffre valeur="0" libelle="appel supplementaire" accent />
        </div>
        <p className="petit discret" style={{ margin: 0 }}>
          {gratuit.explication}
        </p>
      </section>
    </main>
  );
}

function Chiffre({
  valeur,
  libelle,
  accent = false,
}: {
  valeur: string;
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
