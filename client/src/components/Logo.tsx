/**
 * Marque StudyAI — le ruban.
 *
 * Un trait continu qui forme a la fois un S et un signet. Abstrait, sans
 * cadre, sans objet reconnaissable : volontairement ni cerveau ni robot, et
 * rien qui date la marque.
 *
 * DEUX VARIANTES OPTIQUES, et ce n'est pas une coquetterie :
 *   - `libre`   : le trait seul, pour l'en-tete et les grands formats ;
 *   - `encadre` : le trait pose dans un carre plein, pour le favicon.
 * A 16 px, un trait fin se perd dans une barre d'onglets la ou un aplat se
 * repere. C'est le meme dessin, pas deux logos.
 *
 * Les terminaisons sont coupees droit plutot qu'arrondies : les bouts ronds
 * ajoutent du poids optique aux extremites, exactement la ou il en faut le
 * moins quand le signe retrecit.
 */

const CHEMIN = 'M 27 8.4 C 27 5.2 23.6 4 16 4 C 7.6 4 5 6.4 5 9.2 C 5 18.6 27 13.8 27 22 C 27 25.8 23.6 28 15.6 28 C 7.4 28 5 26.2 5 23.4';

export function Marque({
  taille = 28,
  inverse = false,
  encadre = false,
}: {
  taille?: number;
  inverse?: boolean;
  encadre?: boolean;
}) {
  const trait = inverse || encadre ? 'var(--texte-inverse)' : 'var(--brand)';

  return (
    <svg
      width={taille}
      height={taille}
      viewBox="0 0 32 32"
      aria-hidden="true"
      focusable="false"
    >
      {encadre && <rect width="32" height="32" rx="8.5" fill="var(--brand)" />}
      <g transform={encadre ? 'translate(16,16) scale(0.72) translate(-16,-16)' : undefined}>
        <path d={CHEMIN} fill="none" stroke={trait} strokeWidth={5} />
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
      <Marque taille={taille} inverse={inverse} />
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
