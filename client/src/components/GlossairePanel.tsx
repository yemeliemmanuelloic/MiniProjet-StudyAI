import { useEffect, useMemo, useState } from 'react';
import { Citation, useSourceCours } from './SourceCours';
import { Bouton, Chargement, ErreurApi, EtatVide } from './ui';
import { api, ApiError } from '../lib/api';
import { LOCALE, useI18n } from '../lib/i18n';
import type { Glossaire } from '../lib/types';

/**
 * Glossaire du cours (decision 054).
 *
 * Les termes cles, chacun defini PAR le cours et cite. Classes de A a Z,
 * filtrables. Une fois etabli, le glossaire est confie au panneau du texte
 * source, ou ses termes deviennent cliquables.
 */
export function GlossairePanel({ coursId }: { coursId: string }) {
  const { t, langue } = useI18n();
  const source = useSourceCours();
  const [glossaire, setGlossaire] = useState<Glossaire | null | undefined>(undefined);
  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState<ApiError | null>(null);
  const [filtre, setFiltre] = useState('');

  useEffect(() => {
    api<{ glossary: Glossaire | null }>(`/courses/${coursId}/glossary`)
      .then((d) => setGlossaire(d.glossary))
      .catch((e) => {
        setGlossaire(null);
        setErreur(e as ApiError);
      });
  }, [coursId]);

  async function generer() {
    setErreur(null);
    setEnCours(true);
    try {
      const d = await api<{ glossary: Glossaire }>(`/courses/${coursId}/glossary`, { method: 'POST' });
      setGlossaire(d.glossary);
      source?.definirTermes(d.glossary.payload.termes);
    } catch (e) {
      setErreur(e as ApiError);
    } finally {
      setEnCours(false);
    }
  }

  const classes = useMemo(() => {
    const termes = [...(glossaire?.payload.termes ?? [])].sort((a, b) =>
      a.terme.localeCompare(b.terme, LOCALE[langue], { sensitivity: 'base' }),
    );
    const f = filtre.trim().toLocaleLowerCase();
    return f
      ? termes.filter((x) => x.terme.toLocaleLowerCase().includes(f) || x.definition.toLocaleLowerCase().includes(f))
      : termes;
  }, [glossaire, filtre, langue]);

  if (glossaire === undefined) return <Chargement lignes={3} />;

  return (
    <div className="pile">
      <ErreurApi erreur={erreur} onReessayer={generer} />

      {enCours && (
        <div className="carte pile">
          <Chargement lignes={4} message={t('glossaire.encours')} />
        </div>
      )}

      {!glossaire && !enCours && (
        <EtatVide titre={t('glossaire.vide')} action={<Bouton onClick={generer}>{t('glossaire.action')}</Bouton>}>
          {t('glossaire.vide.corps')}
        </EtatVide>
      )}

      {glossaire && !enCours && (
        <>
          <div className="ligne">
            <div className="champ glossaire-filtre">
              <input
                type="search"
                value={filtre}
                onChange={(e) => setFiltre(e.target.value)}
                placeholder={t('glossaire.filtrer')}
                aria-label={t('glossaire.filtrer')}
              />
            </div>
            <span className="petit discret">{t('glossaire.compte', { n: classes.length })}</span>
          </div>
          <dl className="glossaire">
            {classes.map((x, i) => {
              const initiale = x.terme.charAt(0).toLocaleUpperCase();
              const precedente = i > 0 ? classes[i - 1].terme.charAt(0).toLocaleUpperCase() : '';
              return (
                <div key={x.terme} className="glossaire-entree">
                  {initiale !== precedente && <span className="glossaire-lettre" aria-hidden="true">{initiale}</span>}
                  <dt dir="auto">{x.terme}</dt>
                  <dd>
                    <p dir="auto">{x.definition}</p>
                    <Citation passage={x.citation}>{x.citation}</Citation>
                  </dd>
                </div>
              );
            })}
          </dl>
          <div className="ligne">
            <Bouton secondaire onClick={generer}>
              {t('glossaire.regenerer')}
            </Bouton>
            <span className="petit discret">{t('glossaire.astuce')}</span>
          </div>
        </>
      )}
    </div>
  );
}
