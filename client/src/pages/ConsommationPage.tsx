import { useEffect, useState, type CSSProperties } from 'react';
import { Link } from 'react-router-dom';
import { Alerte, Chargement, ErreurApi, EtatVide, Pastille, TeteDePage } from '../components/ui';
import { api, ApiError } from '../lib/api';
import { LOCALE, useI18n } from '../lib/i18n';
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

/* Le formateur suit la langue : il etait fige en 'fr-FR', donc un
   etudiant en anglais lisait « 27 281 » avec une espace fine. */

function argent(montant: number, devise: string): string {
  // Quatre decimales : a ces volumes, deux arrondiraient tout a 0,00 — ce qui
  // donnerait l'impression trompeuse que rien n'a ete consomme.
  return `${montant.toFixed(4)} ${devise}`;
}

export function ConsommationPage() {
  const { t, langue } = useI18n();
  const nf = new Intl.NumberFormat(LOCALE[langue]);
  const [donnees, setDonnees] = useState<Consommation | null>(null);
  const [erreur, setErreur] = useState<ApiError | null>(null);

  useEffect(() => {
    api<Consommation>('/usage')
      .then(setDonnees)
      .catch((e) => setErreur(e as ApiError));
  }, []);

  if (erreur) {
    return (
      <main className="page pile">
        <TeteDePage ton="ardoise" titre={t('conso.titre')} sous={t('conso.sous')} />
        <ErreurApi erreur={erreur} />
      </main>
    );
  }

  if (!donnees) {
    return (
      <main className="page pile">
        <TeteDePage ton="ardoise" titre={t('conso.titre')} sous={t('conso.sous')} />
        <Chargement lignes={4} />
      </main>
    );
  }

  const { total, tarif, gratuit } = donnees;
  const vide = total.operations === 0;

  return (
    <main className="page pile">
      <TeteDePage
        ton="ardoise"
        surtitre={t('nav.consommation')}
        titre={t('conso.titre')}
        sous={t('conso.sous')}
      >
        {/* LE MONTANT MONTE DANS LA TETE. Il etait la cinquieme case d'une
            grille de cinq, distinguee par une bordure : le chiffre que
            l'etudiant vient chercher avait exactement le poids des quatre
            autres. Ici il est seul, en grand, sur l'aplat. */}
        {!vide && (
          <div className="tete-chiffre">
            <div className="tete-chiffre-valeur">{argent(total.cout, tarif.devise)}</div>
            <div className="tete-chiffre-libelle">
              {t('conso.cout')} · {t('conso.operations')} : {nf.format(total.operations)}
            </div>
          </div>
        )}
      </TeteDePage>

      {vide ? (
        <EtatVide
          titre={t('conso.videTitre')}
          action={
            <Link className="bouton" to="/cours">
              {t('recherche.importer')}
            </Link>
          }
        >
          {t('conso.videCorps')}
        </EtatVide>
      ) : (
        <>
          <div className="ligne grille-chiffres">
            <Chiffre valeur={nf.format(total.operations)} libelle={t('conso.operations')} />
            {/* Afficher « 0 appels » alors que des operations existent sans
                decompte serait faux a la lecture, meme si le total des appels
                CONNUS vaut bien zero. Un tiret dit « non mesure ». */}
            <Chiffre
              valeur={
                total.calls === 0 && total.operationsSansDecompte > 0
                  ? '—'
                  : nf.format(total.calls)
              }
              libelle={t('conso.appels')}
            />
            <Chiffre valeur={nf.format(total.tokensIn)} libelle={t('conso.jetonsEntree')} />
            <Chiffre valeur={nf.format(total.tokensOut)} libelle={t('conso.jetonsSortie')} />
          </div>

          <Alerte>
            {t('conso.tarif', {
              entree: tarif.entreeParMillion.toFixed(2),
              sortie: tarif.sortieParMillion.toFixed(2),
              devise: tarif.devise,
              source: tarif.source,
            })}
          </Alerte>

          {total.operationsSansDecompte > 0 && (
            <Alerte ton="attention">
              {t('conso.sansDecompte', { n: total.operationsSansDecompte })}
            </Alerte>
          )}

          <section className="carte pile">
            <h2>{t('conso.parModule')}</h2>
            <div className="tableau-defilant">
              <table className="tableau">
                <thead>
                  <tr>
                    <th>{t('conso.col.module')}</th>
                    <th>{t('conso.col.operations')}</th>
                    <th>{t('conso.col.appels')}</th>
                    <th>{t('conso.col.entree')}</th>
                    <th>{t('conso.col.sortie')}</th>
                    <th>{t('conso.col.latence')}</th>
                    <th>{t('conso.col.cout')}</th>
                  </tr>
                </thead>
                <tbody>
                  {donnees.parModule.map((m) => {
                    /* Part du module dans le cout total : sert a dessiner une
                       barre derriere la cellule. Un tableau de sept colonnes
                       ne dit pas d'un coup d'oeil qui pese le plus ; la barre,
                       si — et elle ne coute pas une colonne de plus. */
                    const plafond = Math.max(...donnees.parModule.map((x) => x.cout), 1e-9);
                    return (
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
                            title={t('conso.nonMesurees', { n: m.operationsSansDecompte })}
                          >
                            {' '}
                            {t('conso.nonMesurees', { n: m.operationsSansDecompte })}
                          </span>
                        )}
                      </td>
                      <td>{nf.format(m.tokensIn)}</td>
                      <td>{nf.format(m.tokensOut)}</td>
                      <td>{m.latenceMoyenneMs ? `${nf.format(m.latenceMoyenneMs)} ms` : '—'}</td>
                      <td
                        className="cellule-part"
                        style={{ '--part': m.cout / plafond } as CSSProperties}
                      >
                        {argent(m.cout, tarif.devise)}
                      </td>
                    </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <p className="petit discret" style={{ margin: 0 }}>
              {t('conso.noteOperation')}
            </p>
          </section>

          {donnees.parCours.length > 0 && (
            <section className="carte pile">
              <h2>{t('conso.parCours')}</h2>
              <p className="petit discret" style={{ marginTop: -6 }}>
                {t('conso.parCours.note')}
              </p>
              {donnees.parCours.map((c) => (
                <div key={c.courseId} className="ligne">
                  <Link to={`/cours/${c.courseId}`} style={{ flex: 1 }}>
                    {c.courseTitle}
                  </Link>
                  <span className="petit discret">
                    {t('conso.parCours.ligne', {
                      n: nf.format(c.operations),
                      jetons: nf.format(c.tokensIn + c.tokensOut),
                    })}
                  </span>
                  <Pastille>{argent(c.cout, tarif.devise)}</Pastille>
                </div>
              ))}
            </section>
          )}

          <section className="carte pile">
            <h2>{t('conso.parModele')}</h2>
            <p className="petit discret" style={{ marginTop: -6 }}>
              {t('conso.parModele.note')}
            </p>
            {donnees.parModele.map((m) => (
              <div key={m.model} className="ligne">
                <code style={{ flex: 1 }}>{m.model}</code>
                <span className="petit discret">
                  {t('conso.parModele.ligne', { n: nf.format(m.operations) })}
                  {m.latenceMoyenneMs !== null && ` · ${nf.format(m.latenceMoyenneMs)} ms`}
                </span>
                <Pastille>{argent(m.cout, tarif.devise)}</Pastille>
              </div>
            ))}
          </section>
        </>
      )}

      <section className="carte pile">
        <h2>{t('conso.gratuitTitre')}</h2>
        <div className="ligne grille-chiffres">
          <Chiffre valeur={nf.format(gratuit.examens)} libelle={t('conso.examens')} />
          <Chiffre valeur={nf.format(gratuit.questionsServies)} libelle={t('conso.questions')} />
          <Chiffre valeur="0" libelle={t('conso.appelSupp')} accent />
        </div>
        <p className="petit discret" style={{ margin: 0 }}>
          {t('conso.gratuitCorps')}
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
