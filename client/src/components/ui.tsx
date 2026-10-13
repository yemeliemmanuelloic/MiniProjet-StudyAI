import type { ReactNode } from 'react';
import { ApiError } from '../lib/api';

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

/**
 * Affichage d'une erreur d'API. Le message vient toujours de lib/api.ts :
 * aucune page ne redige le sien, ce qui garantit que les quatre cas LLM_*
 * s'affichent de la meme facon partout.
 */
export function ErreurApi({ erreur }: { erreur: ApiError | null }) {
  if (!erreur) return null;
  return (
    <Alerte ton="erreur" titre={erreur.message}>
      <span className="petit">
        Code technique : <code>{erreur.code}</code>
      </span>
    </Alerte>
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
