import { Fragment, useEffect, type ReactNode } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { TeteDePage } from '../components/ui';
import { PAGES, type Bloc, type ClePage } from '../lib/contenus';
import { LOCALE, useI18n } from '../lib/i18n';
import { MAJ_JURIDIQUE } from '../lib/site';

/**
 * Page d'information : mentions legales, confidentialite, conditions,
 * a propos, aide, FAQ. Un seul gabarit pour toutes ; le texte vient de
 * lib/contenus.ts, dans la langue active.
 */

/** Balisage en ligne : **gras**, *italique*, `code`, [libelle](/chemin). */
export function enLigne(texte: string): ReactNode[] {
  const motif = /(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`|\[[^\]]+\]\(\/[^)]*\))/g;
  const morceaux: ReactNode[] = [];
  let debut = 0;
  let m: RegExpExecArray | null;
  let n = 0;
  while ((m = motif.exec(texte))) {
    if (m.index > debut) morceaux.push(texte.slice(debut, m.index));
    const brut = m[0];
    const cle = `m${n++}`;
    if (brut.startsWith('**')) morceaux.push(<strong key={cle}>{brut.slice(2, -2)}</strong>);
    else if (brut.startsWith('`')) morceaux.push(<code key={cle}>{brut.slice(1, -1)}</code>);
    else if (brut.startsWith('[')) {
      const [, libelle, chemin] = /\[([^\]]+)\]\((\/[^)]*)\)/.exec(brut) ?? [];
      morceaux.push(
        <Link key={cle} to={chemin}>
          {libelle}
        </Link>,
      );
    } else morceaux.push(<em key={cle}>{brut.slice(1, -1)}</em>);
    debut = m.index + brut.length;
  }
  if (debut < texte.length) morceaux.push(texte.slice(debut));
  return morceaux;
}

function RenduBloc({ bloc }: { bloc: Bloc }) {
  if (bloc.type === 'p') return <p>{enLigne(bloc.texte)}</p>;
  if (bloc.type === 'liste')
    return (
      <ul>
        {bloc.items.map((item, i) => (
          <li key={i}>{enLigne(item)}</li>
        ))}
      </ul>
    );
  return (
    // Sur mobile le tableau defile a l'horizontale : sans tabIndex, un
    // utilisateur au clavier ne pouvait pas le faire defiler (audit axe,
    // lot H). La region est nommee par ses colonnes, dans la langue affichee.
    <div className="info-tableau" tabIndex={0} role="region" aria-label={bloc.entetes.join(', ')}>
      <table>
        <thead>
          <tr>
            {bloc.entetes.map((e) => (
              <th key={e} scope="col">
                {e}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {bloc.lignes.map((ligne, i) => (
            <tr key={i}>
              {ligne.map((cellule, j) => (
                <td key={j}>{enLigne(cellule)}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Identifiant d'ancre stable a partir d'un titre de section. */
export function ancre(titre: string): string {
  return titre
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

export function PageInfo({ cle }: { cle: ClePage }) {
  const { t, langue } = useI18n();
  const page = PAGES[cle][langue];
  const maj = new Date(MAJ_JURIDIQUE).toLocaleDateString(LOCALE[langue], { dateStyle: 'long' });
  const { hash } = useLocation();
  /* Un lien vers une section (/faq#j-ai-oublie-mon-mot-de-passe) : le
     routeur ne defile pas jusqu'a l'ancre, on s'en charge. */
  useEffect(() => {
    if (hash) document.getElementById(decodeURIComponent(hash.slice(1)))?.scrollIntoView();
  }, [hash, cle]);

  return (
    <main className="page pile">
      <TeteDePage surtitre={page.surtitre} titre={page.titre} sous={<>{enLigne(page.sous)}</>} />
      <div className="info-disposition">
      <article className="carte info">
        {page.datee && <p className="petit discret info-maj">{t('info.maj', { date: maj })}</p>}
        {page.sections.map((section) => (
          <Fragment key={section.titre}>
            <h2 id={ancre(section.titre)}>{section.titre}</h2>
            {section.blocs.map((bloc, i) => (
              <RenduBloc key={i} bloc={bloc} />
            ))}
          </Fragment>
        ))}
      </article>
      {/* SOMMAIRE (refonte « Atelier », 22 octobre) : les pages d'aide et
          juridiques comptent jusqu'a dix sections ; la colonne de droite,
          vide, devient un acces direct a chacune. Masque sur telephone. */}
      {page.sections.length >= 3 && (
        <nav className="info-sommaire" aria-label={t('info.sommaire')}>
          <p>{t('info.sommaire')}</p>
          <ul>
            {page.sections.map((s) => (
              <li key={s.titre}>
                <a href={`#${ancre(s.titre)}`}>{s.titre}</a>
              </li>
            ))}
          </ul>
        </nav>
      )}
      </div>
    </main>
  );
}
