/**
 * Marque StudyAI.
 *
 * Trois lignes de texte decroissantes — le cours qui se resume — et une
 * etincelle pour l'intervention du modele. Volontairement ni cerveau ni
 * robot : la marque dit ce que fait le produit, pas la technologie qu'il
 * emploie.
 *
 * Dessinee en SVG inline plutot qu'en image : nette a toutes les tailles,
 * aucun fichier binaire au depot, et la couleur suit les jetons.
 */

export function Marque({ taille = 28 }: { taille?: number }) {
  return (
    <svg
      width={taille}
      height={taille}
      viewBox="0 0 32 32"
      aria-hidden="true"
      focusable="false"
    >
      <rect width="32" height="32" rx="8" fill="var(--brand)" />
      <g fill="var(--texte-inverse)">
        <rect x="7.5" y="9" width="17" height="2.6" rx="1.3" />
        <rect x="7.5" y="14.2" width="12" height="2.6" rx="1.3" />
        <rect x="7.5" y="19.4" width="7" height="2.6" rx="1.3" />
        <path d="M22.4 17.6 23.6 20.6 26.6 21.8 23.6 23 22.4 26 21.2 23 18.2 21.8 21.2 20.6 Z" />
      </g>
    </svg>
  );
}

/** Marque + nom, utilise dans l'en-tete et sur les ecrans d'authentification. */
export function Logo({
  taille = 28,
  inverse = false,
}: {
  taille?: number;
  inverse?: boolean;
}) {
  return (
    <span className="logo">
      {inverse ? <MarqueInverse taille={taille} /> : <Marque taille={taille} />}
      <span
        className="logo-nom"
        style={{
          fontSize: Math.round(taille * 0.64),
          color: inverse ? 'var(--texte-inverse)' : 'var(--brand)',
        }}
      >
        StudyAI
      </span>
    </span>
  );
}

/** Variante pour fond colore : le carre devient blanc, les lignes rouges. */
function MarqueInverse({ taille }: { taille: number }) {
  return (
    <svg
      width={taille}
      height={taille}
      viewBox="0 0 32 32"
      aria-hidden="true"
      focusable="false"
    >
      <rect width="32" height="32" rx="8" fill="var(--texte-inverse)" />
      <g fill="var(--brand)">
        <rect x="7.5" y="9" width="17" height="2.6" rx="1.3" />
        <rect x="7.5" y="14.2" width="12" height="2.6" rx="1.3" />
        <rect x="7.5" y="19.4" width="7" height="2.6" rx="1.3" />
        <path d="M22.4 17.6 23.6 20.6 26.6 21.8 23.6 23 22.4 26 21.2 23 18.2 21.8 21.2 20.6 Z" />
      </g>
    </svg>
  );
}
