import { Component, type ErrorInfo, type ReactNode } from 'react';

/**
 * Garde-fou contre les erreurs inattendues du front.
 *
 * DEFAUT QU'IL CORRIGE : sans lui, la moindre exception dans un composant
 * React demonte tout l'arbre et laisse une **page blanche**. Aucun message,
 * aucune issue, et rien dans l'interface pour comprendre. C'est le pire des
 * echecs possibles en demonstration.
 *
 * Il ne remplace pas la gestion des erreurs d'API — celle-ci est contextuelle
 * et recuperable (voir lib/erreurs.ts). Il couvre l'autre categorie : le bug
 * de programmation, qu'on ne peut pas anticiper mais qu'on peut cesser de
 * subir.
 *
 * Ecrit en composant de classe parce que React n'expose pas encore
 * `componentDidCatch` aux composants de fonction.
 */

interface Etat {
  erreur: Error | null;
}

export class GardeFou extends Component<{ children: ReactNode }, Etat> {
  state: Etat = { erreur: null };

  static getDerivedStateFromError(erreur: Error): Etat {
    return { erreur };
  }

  componentDidCatch(erreur: Error, infos: ErrorInfo): void {
    // La trace reste dans la console du navigateur : elle sert au
    // developpeur, jamais a l'utilisateur.
    console.error('[front] erreur non rattrapee', erreur, infos.componentStack);
  }

  /**
   * Traduction SANS le contexte i18n, et c'est deliberé.
   *
   * Ce composant est la derniere ligne de defense : il s'affiche quand un
   * rendu s'est effondre. Si c'etait le fournisseur de traduction qui avait
   * echoue, appeler son hook ici releverait la meme exception et laisserait
   * l'utilisateur devant une page blanche. On lit donc la langue directement
   * dans le stockage, et on retombe sur le francais au moindre doute.
   */
  private texte(cle: keyof typeof GardeFou.TEXTES.fr): string {
    let langue: 'fr' | 'en' = 'fr';
    try {
      if (localStorage.getItem('langue') === 'en') langue = 'en';
    } catch {
      // Stockage inaccessible : le francais fait l'affaire.
    }
    return GardeFou.TEXTES[langue][cle];
  }

  private static readonly TEXTES = {
    fr: {
      titre: 'Quelque chose s’est cassé',
      corps:
        'L’affichage a rencontré une erreur inattendue. Vos cours et vos résumés sont intacts : rien n’a été perdu.',
      recharger: 'Recharger la page',
      retour: 'Revenir à mes cours',
      detail: 'Détail technique',
    },
    en: {
      titre: 'Something broke',
      corps:
        'The interface hit an unexpected error. Your courses and summaries are intact: nothing was lost.',
      recharger: 'Reload the page',
      retour: 'Back to my courses',
      detail: 'Technical detail',
    },
  } as const;

  render(): ReactNode {
    if (!this.state.erreur) return this.props.children;

    return (
      <main className="page" style={{ maxWidth: 620 }}>
        <div className="carte pile" style={{ textAlign: 'center', padding: '48px 32px' }}>
          <h1 style={{ fontSize: 20, marginBottom: 0 }}>{this.texte('titre')}</h1>
          <p className="discret" style={{ margin: 0 }}>
            {this.texte('corps')}
          </p>

          <div className="ligne" style={{ justifyContent: 'center', gap: 10 }}>
            <button className="bouton" onClick={() => window.location.reload()}>
              {this.texte('recharger')}
            </button>
            <a className="bouton bouton-secondaire" href="/cours">
              {this.texte('retour')}
            </a>
          </div>

          <details style={{ textAlign: 'left', marginTop: 8 }}>
            <summary className="petit discret" style={{ cursor: 'pointer' }}>
              {this.texte('detail')}
            </summary>
            <div className="bloc-code" style={{ marginTop: 8 }}>
              {this.state.erreur.message}
            </div>
          </details>
        </div>
      </main>
    );
  }
}
