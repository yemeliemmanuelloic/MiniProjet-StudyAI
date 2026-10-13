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

  render(): ReactNode {
    if (!this.state.erreur) return this.props.children;

    return (
      <main className="page" style={{ maxWidth: 620 }}>
        <div className="carte pile" style={{ textAlign: 'center', padding: '48px 32px' }}>
          <h1 style={{ fontSize: 20, marginBottom: 0 }}>Quelque chose s'est casse</h1>
          <p className="discret" style={{ margin: 0 }}>
            L'affichage a rencontre une erreur inattendue. Vos cours et vos resumes sont
            intacts : rien n'a ete perdu.
          </p>

          <div className="ligne" style={{ justifyContent: 'center', gap: 10 }}>
            <button className="bouton" onClick={() => window.location.reload()}>
              Recharger la page
            </button>
            <a className="bouton bouton-secondaire" href="/cours">
              Revenir a mes cours
            </a>
          </div>

          <details style={{ textAlign: 'left', marginTop: 8 }}>
            <summary className="petit discret" style={{ cursor: 'pointer' }}>
              Detail technique
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
