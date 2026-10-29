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
                Réessayer
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

      {/* Le code reste affiche, mais comme une reference a donner au
          support, plus comme une etiquette technique (decision 042). */}
      <span className="erreur-code" title={LIBELLE_FAMILLE[conduite.famille]}>
        Réf. {erreur.code}
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
/**
 * Squelette de chargement.
 *
 * `message` n'est pas decoratif : un appel au modele prend deux a huit
 * secondes, et un squelette muet pendant ce temps laisse croire que rien ne
 * se passe. Dire ce qui est en cours — « Lecture du cours… » — transforme
 * une attente en progression. Il est facultatif : pour un chargement
 * instantane depuis la base, annoncer quoi que ce soit serait du bruit.
 */
export function Chargement({ lignes = 4, message }: { lignes?: number; message?: string }) {
  const largeurs = ['92%', '78%', '85%', '60%', '70%'];
  return (
    <div className="pile" style={{ gap: 10 }} aria-busy="true" aria-live="polite">
      {message && <span className="petit discret chargement-message">{message}</span>}
      {Array.from({ length: lignes }).map((_, i) => (
        <div key={i} className="squelette" style={{ width: largeurs[i % largeurs.length] }} />
      ))}
    </div>
  );
}

/** Etat vide : un ecran blanc passe toujours pour un bug. */
/**
 * L'illustration des etats vides.
 *
 * Dessinee a la main, en aplats, aux couleurs du projet. Une bibliotheque
 * d'illustrations couterait des centaines de kilo-octets et parlerait la
 * langue de quelqu'un d'autre ; quatre formes suffisent a dire « il n'y a
 * rien ici, et voici la forme de ce qui viendra ».
 *
 * `aria-hidden` : elle n'ajoute aucune information que le titre et le
 * paragraphe ne portent deja. Un lecteur d'ecran n'a rien a y lire.
 */
function FeuillesVides() {
  return (
    <svg
      className="illustration-vide"
      viewBox="0 0 120 92"
      width="120"
      height="92"
      aria-hidden="true"
      focusable="false"
    >
      {/* Deux feuilles en retrait, puis celle de devant : la pile suggere ce
          qui s'empilera, sans rien representer de litteral. */}
      <rect x="18" y="10" width="66" height="72" rx="8" fill="var(--brand-100)" />
      <rect x="28" y="6" width="66" height="72" rx="8" fill="var(--brand-200)" />
      <rect
        x="38"
        y="14"
        width="66"
        height="72"
        rx="8"
        fill="var(--neutre-0)"
        stroke="var(--brand-300)"
        strokeWidth="2"
      />
      {/* Les lignes de texte a venir. La derniere est plus courte : une page
          pleine ne finit jamais au bord. */}
      <rect x="52" y="32" width="38" height="5" rx="2.5" fill="var(--brand-200)" />
      <rect x="52" y="45" width="30" height="5" rx="2.5" fill="var(--neutre-200)" />
      <rect x="52" y="58" width="34" height="5" rx="2.5" fill="var(--neutre-200)" />
      {/* Le point de marque : le seul element pleinement sature, pose la ou
          l'oeil arrive en dernier. */}
      <circle cx="96" cy="72" r="11" fill="var(--brand)" />
      <path
        d="M91 72h10M96 67v10"
        stroke="var(--texte-inverse)"
        strokeWidth="2.2"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function EtatVide({
  titre,
  children,
  action,
  illustration = <FeuillesVides />,
}: {
  titre: string;
  children?: ReactNode;
  action?: ReactNode;
  /** `null` retire l'illustration la ou elle ferait doublon. */
  illustration?: ReactNode;
}) {
  return (
    <div className="carte etat-vide">
      {illustration}
      <h2>{titre}</h2>
      {children && <p className="discret">{children}</p>}
      {action}
    </div>
  );
}


/**
 * Tete d'ecran : un APLAT PLEINE COULEUR, texte clair.
 *
 * POURQUOI CE COMPOSANT EXISTE. Le diagnostic de la premiere refonte tenait
 * en une phrase : « les six ecrans restent une colonne de cartes empilees sur
 * fond clair ». La couleur y etait ajoutee en surface — lavis, trame, ombres
 * — par-dessus une composition qui, elle, ne bougeait pas.
 *
 * ET IL DEBLOQUE LE CONTRASTE. Sur fond clair, interdire au texte secondaire
 * de descendre sous 4,5:1 plafonne la saturation : un lavis plus soutenu
 * avait ete mesure a 4,21:1 et annule. Sur un aplat sombre a texte clair, le
 * seuil cesse d'etre une limite — le blanc sur `--brand-700` depasse 9:1. La
 * couleur franche devient possible parce que le sens de lecture est inverse,
 * pas parce qu'on a baisse l'exigence.
 *
 * Le `ton` distingue les ecrans : la marque pour ce qui touche aux cours,
 * l'ardoise pour ce qui mesure — la consommation n'est pas une fonction de
 * revision, et sa tete le dit avant qu'on ait lu un mot.
 */
export function TeteDePage({
  surtitre,
  titre,
  sous,
  ton = 'marque',
  classeCours,
  actions,
  children,
}: {
  surtitre?: ReactNode;
  titre: string;
  sous?: ReactNode;
  ton?: 'marque' | 'ardoise';
  /** Fiche d'un cours : la tete prend la couleur de ce cours (lib/couleurCours). */
  classeCours?: string;
  actions?: ReactNode;
  children?: ReactNode;
}) {
  const classes = classeCours
    ? `tete-page tete-${ton} tete-cours ${classeCours}`
    : `tete-page tete-${ton}`;
  return (
    <header className={classes}>
      <div className="tete-corps">
        <div className="tete-texte">
          {surtitre && <p className="tete-surtitre">{surtitre}</p>}
          <h1 dir="auto">{titre}</h1>
          {sous && <p className="tete-sous">{sous}</p>}
        </div>
        {actions && <div className="tete-actions">{actions}</div>}
      </div>
      {children}
    </header>
  );
}
