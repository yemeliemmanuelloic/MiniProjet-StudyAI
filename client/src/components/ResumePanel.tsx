import { useEffect, useState } from 'react';
import { Alerte, Bouton, Chargement, ErreurApi, EtatVide, Pastille } from './ui';
import { api, ApiError } from '../lib/api';
import { useT } from '../lib/i18n';
import { LIBELLE_NIVEAU, type Resume } from '../lib/types';

/** Module 1 — resume automatique du cours. */
export function ResumePanel({ coursId }: { coursId: string }) {
  const t = useT();
  const [resume, setResume] = useState<Resume | null>(null);
  const [niveau, setNiveau] = useState('standard');
  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState<ApiError | null>(null);

  useEffect(() => {
    api<{ summaries: Resume[] }>(`/courses/${coursId}/summaries`)
      .then((d) => setResume(d.summaries[0] ?? null))
      .catch(() => setResume(null));
  }, [coursId]);

  async function generer() {
    setErreur(null);
    setEnCours(true);
    try {
      const d = await api<{ summary: Resume }>(`/courses/${coursId}/summary`, {
        body: { level: niveau },
      });
      setResume(d.summary);
    } catch (e) {
      setErreur(e as ApiError);
    } finally {
      setEnCours(false);
    }
  }

  return (
    <div className="pile">
      <div className="ligne">
        <div className="champ" style={{ flex: '0 1 200px' }}>
          <label htmlFor="niveau">{t('resume.niveau')}</label>
          <select id="niveau" value={niveau} onChange={(e) => setNiveau(e.target.value)}>
            <option value="court">{t('resume.court')}</option>
            <option value="standard">{t('resume.standard')}</option>
            <option value="detaille">{t('resume.detaille')}</option>
          </select>
        </div>
        <Bouton onClick={generer} disabled={enCours} style={{ alignSelf: 'flex-end' }}>
          {enCours ? t('resume.encours') : resume ? t('resume.regenerer') : t('resume.action')}
        </Bouton>
      </div>

      <ErreurApi erreur={erreur} onReessayer={generer} />

      {enCours && (
        <div className="carte pile">
          <Alerte>{t('resume.anonymisation')}</Alerte>
          <Chargement lignes={5} message={t('chargement.resume')} />
        </div>
      )}

      {!resume && !enCours && !erreur && (
        <EtatVide titre={t('resume.vide')}>
          {t('resume.vide.corps')}
        </EtatVide>
      )}

      {resume && !enCours && (
        /* DEUX COLONNES : UNE DE LECTURE, UN RAIL.
           Le resume etait une pile ou la synthese, les points cles, les
           notions et la telemetrie se suivaient a la meme largeur et avec le
           meme poids. Or ce ne sont pas des choses du meme ordre : la
           synthese SE LIT — elle a besoin d'une colonne courte, la ligne
           longue fatigue au-dela de 70 signes environ — tandis que les
           notions et la provenance se CONSULTENT du coin de l'oeil. */
        <div className="carte resume-grille">
          <div className="resume-lecture">
            <div className="ligne" style={{ marginBottom: 14 }}>
              <h2 style={{ margin: 0 }}>{t('resume.synthese')}</h2>
              <Pastille>{LIBELLE_NIVEAU[resume.level] ?? resume.level}</Pastille>
            </div>

            {resume.segmentCount > 1 && (
              <Alerte>{t('resume.coursLong', { n: resume.segmentCount })}</Alerte>
            )}

            <p className="resume-synthese">{resume.payload.abstract}</p>

            <h3>{t('resume.pointsCles')}</h3>
            {/* Numerotes, et le numero porte la couleur de marque : une liste
                a puces grises ne se distinguait pas du paragraphe au-dessus. */}
            <ol className="points-cles">
              {resume.payload.keyPoints.map((p, i) => (
                <li key={i}>{p}</li>
              ))}
            </ol>

            {resume.payload.warnings.length > 0 && (
              <Alerte ton="attention" titre={t('resume.avertissements')}>
                {resume.payload.warnings.join(' · ')}
              </Alerte>
            )}
          </div>

          <aside className="resume-rail">
            {resume.payload.keywords.length > 0 && (
              <div>
                <h3>{t('resume.notions')}</h3>
                <div className="ligne" style={{ gap: 8 }}>
                  {resume.payload.keywords.map((m) => (
                    <Pastille key={m} ton="marque">
                      {m}
                    </Pastille>
                  ))}
                </div>
              </div>
            )}

            <div className="resume-provenance petit discret">
              <div>{resume.model}</div>
              <div>prompt {resume.promptVersion}</div>
              <div>{resume.latencyMs} ms</div>
              {resume.segmentCount > 1 && <div>{resume.segmentCount} segments</div>}
            </div>

            <ChargeUtile resumeId={resume.id} />
          </aside>
        </div>
      )}
    </div>
  );
}

/**
 * Vue de transparence : la charge utile exacte transmise au modele.
 *
 * C'est la seule preuve verifiable de l'anonymisation. Affirmer « les donnees
 * sont masquees » ne vaut rien ; montrer le texte reellement envoye, jetons
 * compris, se verifie a l'oeil nu pendant la soutenance.
 *
 * Le chargement est differe a l'ouverture : la charge utile pese plusieurs
 * milliers de caracteres, inutile de la transporter a chaque affichage.
 */
function ChargeUtile({ resumeId }: { resumeId: string }) {
  const t = useT();
  const [donnees, setDonnees] = useState<{ payload: string; tokenMap: string[] } | null>(null);
  const [erreur, setErreur] = useState<ApiError | null>(null);

  async function charger() {
    if (donnees || erreur) return;
    try {
      setDonnees(await api<{ payload: string; tokenMap: string[] }>(`/summaries/${resumeId}/payload`));
    } catch (e) {
      setErreur(e as ApiError);
    }
  }

  return (
    <details onToggle={charger}>
      <summary className="depliant-titre">{t('resume.envoye')}</summary>

      <div className="pile" style={{ gap: 10, marginTop: 10 }}>
        <ErreurApi erreur={erreur} onReessayer={() => { setErreur(null); charger(); }} />

        {donnees && (
          <>
            <div className="ligne" style={{ gap: 8 }}>
              {donnees.tokenMap.length > 0 ? (
                donnees.tokenMap.map((t) => (
                  <Pastille key={t} ton="succes">
                    {t} masque
                  </Pastille>
                ))
              ) : (
                <span className="petit discret">
                  {t('resume.aucuneDonnee')}
                </span>
              )}
            </div>
            <div className="bloc-code" style={{ maxHeight: 320, overflowY: 'auto' }}>
              {donnees.payload}
            </div>
          </>
        )}

        {!donnees && !erreur && <Chargement lignes={3} />}
      </div>
    </details>
  );
}
