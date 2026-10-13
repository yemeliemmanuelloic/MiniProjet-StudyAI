import type { ReactNode } from 'react';
import { ApiError } from '../lib/api';
import { LIBELLE_FAMILLE, conduitePour, type Famille } from '../lib/erreurs';

/**
 * Composants partages, transposes de la planche Figma « 01 · Composants ».
 * Aucune couleur n'est ecrite ici : tout passe par les classes de index.css.
 */

export function Bouton({
  children,
  secondaire,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { secondaire?: boolean }) {
  return (
    <button {...props} className={`bouton${secondaire ? ' bouton-secondaire' : ''}`}>
      {children}
    </button>
  );
}

export function Champ({
  libelle,
  erreur,
  ...props
}: React.InputHTMLAttributes<HTMLInputElement> & { libelle: string; erreur?: string }) {
  return (
    <div className={`champ${erreur ? ' champ-erreur' : ''}`}>
      <label htmlFor={props.id ?? props.name}>{libelle}</label>
      <input id={props.id ?? props.name} {...props} />
      {erreur && <span className="message-erreur">{erreur}</span>}
    </div>
  );
}

export function Pastille({
  children,
  ton = 'neutre',
}: {
  children: ReactNode;
  ton?: 'neutre' | 'marque' | 'succes' | 'alerte' | 'erreur';
}) {
  const suffixe = ton === 'neutre' ? '' : ` pastille-${ton}`;
  return <span className={`pastille${suffixe}`}>{children}</span>;
}

export function Alerte({
  titre,
  children,
  ton = 'info',
}: {
  titre?: string;
  children: ReactNode;
  ton?: 'info' | 'succes' | 'attention' | 'erreur';
}) {
  const suffixe = ton === 'info' ? '' : ` alerte-${ton}`;
  return (
    <div className={`alerte${suffixe}`} role={ton === 'erreur' ? 'alert' : undefined}>
      {titre && <div className="alerte-titre">{titre}</div>}
      <div>{children}</div>
    </div>
  );
}

/** Icones des quatre familles d'erreur. Trait seul, pour rester lisible petit. */
function IconeFamille({ famille }: { famille: Famille }) {
  const traits: Record<Famille, string> = {
    // crayon : la saisie est a corriger
    saisie: 'M4 16.5 L13 7.5 L16.5 11 L7.5 20 H4 Z',
    // cadenas : l'acces est en cause
    acces: 'M7 11 V8 a5 5 0 0 1 10 0 v3 M5.5 11 h13 v9 h-13 Z',
    // nuage barre : le service distant
    service: 'M6 17 h11 a4 4 0 0 0 0-8 6 6 0 0 0-11.3 2.2 A3.4 3.4 0 0 0 6 17 Z M4 4 L20 20',
    // horloge : il faut attendre
    attente: 'M12 4 a8 8 0 1 0 0 16 8 8 0 0 0 0-16 Z M12 8 v4.4 l3 2',
  };
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path
        d={traits[famille]}
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/**
 * Affichage d'une erreur d'API.
 *
 * Le message vient toujours de lib/api.ts et la conduite a tenir de
 * lib/erreurs.ts : aucune page ne redige les siens. C'est ce qui garantit que
 * les cinq cas LLM_* s'affichent de la meme facon partout.
 *
 * Le bouton « Reessayer » n'apparait que si le code est reellement
 * reessayable — la meme regle que cote serveur. L'afficher sur un quota
 * epuise reviendrait a promettre a l'etudiant quelque chose qui ne peut pas
 * marcher.
 */
export function ErreurApi({
  erreur,
  onReessayer,
}: {
  erreur: ApiError | null;
  onReessayer?: () => void;
}) {
  if (!erreur) return null;
  const conduite = conduitePour(erreur.code, erreur.details);

  return (
    <div className="erreur" role="alert">
      <span className="erreur-icone" aria-hidden="true">
        <IconeFamille famille={conduite.famille} />
      </span>

      <div className="erreur-corps">
        <strong className="erreur-titre">{erreur.message}</strong>
        <p className="erreur-conseil">{conduite.conseil}</p>

        {(conduite.reessayable && onReessayer) || conduite.lien ? (
          <div className="ligne" style={{ gap: 10, marginTop: 4 }}>
            {conduite.reessayable && onReessayer && (
              <Bouton secondaire onClick={onReessayer}>
                Reessayer
              </Bouton>
            )}
            {conduite.lien && (
              <a className="bouton bouton-secondaire" href={conduite.lien.vers}>
                {conduite.lien.libelle}
              </a>
            )}
          </div>
        ) : null}
      </div>

      <span className="erreur-code" title={LIBELLE_FAMILLE[conduite.famille]}>
        {erreur.code}
      </span>
    </div>
  );
}

/**
 * Score d'un quiz, en anneau de progression.
 *
 * Le score n'est jamais affiche seul : il accompagne toujours le detail de la
 * correction, avec l'explication et la citation du cours. Un chiffre sans
 * justification n'apprend rien a l'etudiant.
 */
export function Score({ valeur, taille = 104 }: { valeur: number; taille?: number }) {
  const ton = valeur >= 70 ? 'succes' : valeur >= 45 ? 'alerte' : 'erreur';
  const rayon = (taille - 12) / 2;
  const circonference = 2 * Math.PI * rayon;
  const borne = Math.max(0, Math.min(100, valeur));

  return (
    <div
      className="anneau"
      style={{ width: taille, height: taille }}
      role="img"
      aria-label={`Score : ${borne} sur 100`}
    >
      <svg width={taille} height={taille}>
        <circle
          className="anneau-piste"
          cx={taille / 2}
          cy={taille / 2}
          r={rayon}
          fill="none"
          strokeWidth={10}
        />
        <circle
          className="anneau-valeur"
          cx={taille / 2}
          cy={taille / 2}
          r={rayon}
          fill="none"
          strokeWidth={10}
          strokeLinecap="round"
          stroke={`var(--${ton})`}
          strokeDasharray={circonference}
          strokeDashoffset={circonference * (1 - borne / 100)}
        />
      </svg>
      <span className="anneau-texte">
        <span className="anneau-chiffre" style={{ color: `var(--${ton})` }}>
          {borne}
        </span>
        <span className="anneau-unite">sur 100</span>
      </span>
    </div>
  );
}

/** Barres de chargement : l'appel au modele dure plusieurs secondes. */
export function Chargement({ lignes = 4 }: { lignes?: number }) {
  const largeurs = ['92%', '78%', '85%', '60%', '70%'];
  return (
    <div className="pile" style={{ gap: 10 }} aria-busy="true" aria-live="polite">
      {Array.from({ length: lignes }).map((_, i) => (
        <div key={i} className="squelette" style={{ width: largeurs[i % largeurs.length] }} />
      ))}
    </div>
  );
}

/** Etat vide : un ecran blanc passe toujours pour un bug. */
export function EtatVide({
  titre,
  children,
  action,
}: {
  titre: string;
  children?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="carte" style={{ textAlign: 'center', padding: '56px 24px' }}>
      <h2 style={{ marginBottom: 6 }}>{titre}</h2>
      {children && (
        <p className="discret" style={{ maxWidth: 460, margin: '0 auto 18px' }}>
          {children}
        </p>
      )}
      {action}
    </div>
  );
}
