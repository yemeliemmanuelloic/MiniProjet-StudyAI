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
        <div className="carte pile">
          <div className="ligne">
            <h2 style={{ margin: 0 }}>{t('resume.synthese')}</h2>
            <Pastille>{LIBELLE_NIVEAU[resume.level] ?? resume.level}</Pastille>
            <span className="discret petit pousse">
              {resume.model} · prompt {resume.promptVersion} · {resume.latencyMs} ms
              {resume.segmentCount > 1 && ` · ${resume.segmentCount} segments`}
            </span>
          </div>

          {resume.segmentCount > 1 && (
            <Alerte>
              {t('resume.coursLong', { n: resume.segmentCount })}
            </Alerte>
          )}

          <p style={{ margin: 0, whiteSpace: 'pre-wrap' }}>{resume.payload.abstract}</p>

          <div>
            <h2>{t('resume.pointsCles')}</h2>
            <ul style={{ margin: 0, paddingLeft: 20 }}>
              {resume.payload.keyPoints.map((p, i) => (
                <li key={i} style={{ marginBottom: 6 }}>
                  {p}
                </li>
              ))}
            </ul>
          </div>

          {resume.payload.keywords.length > 0 && (
            <div>
              <h2>{t('resume.notions')}</h2>
              <div className="ligne" style={{ gap: 8 }}>
                {resume.payload.keywords.map((m) => (
                  <Pastille key={m} ton="marque">
                    {m}
                  </Pastille>
                ))}
              </div>
            </div>
          )}

          {resume.payload.warnings.length > 0 && (
            <Alerte ton="attention" titre={t('resume.avertissements')}>
              {resume.payload.warnings.join(' · ')}
            </Alerte>
          )}

          <ChargeUtile resumeId={resume.id} />
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
      <summary style={{ cursor: 'pointer', fontWeight: 500 }}>
        Ce qui a ete envoye au modele
      </summary>

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
