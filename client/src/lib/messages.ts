import type { ErrorCode } from './api';

/**
 * Compose le message d'erreur affiche a l'etudiant.
 *
 * DEFAUT CORRIGE LE 16 OCTOBRE, ET IL ETAIT SERIEUX. Le serveur compose des
 * messages precis — « Ce cours fait 475 997 caracteres, soit 275 997 de
 * trop », « Ouvrez le fichier dans PowerPoint et enregistrez-le en .pptx »,
 * « Reessayez dans 12 secondes ». Le client les JETAIT : `api.ts` construisait
 * `new ApiError(code, details)` sans le message, et `ApiError` retombait sur
 * une table de onze phrases generiques. L'etudiant lisait « Certaines
 * informations sont invalides. »
 *
 * Tout le travail de la decision 016 sur la taxonomie d'erreurs n'atteignait
 * donc jamais l'ecran.
 *
 * POURQUOI LE CLIENT RECOMPOSE PLUTOT QUE D'AFFICHER LE MESSAGE DU SERVEUR.
 * Afficher directement la phrase du serveur reglait le probleme en une ligne,
 * mais figeait le francais dans 51 levees d'exception cote serveur — donc
 * rendait la traduction a venir impossible sans les reecrire toutes. Le
 * serveur envoie deja des `details` structures ; le client compose a partir
 * d'eux, dans la langue active.
 *
 * REGLE DE REPLI, dans l'ordre :
 *   1. `details` reconnus  -> message compose ici, traduisible ;
 *   2. message du serveur  -> precis, mais fige en francais ;
 *   3. table par code      -> generique, dernier recours.
 *
 * Quinze des 51 levees portent des `details` ; ce sont les plus utiles.
 */

/** Table de repli : ce qui s'affiche quand rien de plus precis n'existe. */
export const GENERIQUES: Record<ErrorCode, string> = {
  VALIDATION_ERROR: 'Certaines informations sont invalides.',
  UNAUTHORIZED: 'Votre session a expiré. Reconnectez-vous.',
  FORBIDDEN: "Vous n'avez pas accès à cette ressource.",
  NOT_FOUND: 'Ressource introuvable.',
  RATE_LIMITED: "Trop d'analyses demandées. Réessayez plus tard.",
  LLM_KEY_MISSING: "Le service d'analyse est momentanément indisponible.",
  LLM_TIMEOUT: "L'analyse a pris trop de temps. Réessayez.",
  LLM_QUOTA_EXCEEDED: "Le quota d'analyses est atteint pour aujourd'hui.",
  LLM_INVALID_OUTPUT: "L'analyse n'a pas pu être produite. Réessayez.",
  LLM_UNAVAILABLE: "Le service d'analyse est indisponible.",
  INTERNAL: 'Une erreur est survenue.',
};

const nombre = (valeur: unknown): string =>
  typeof valeur === 'number' ? valeur.toLocaleString('fr-FR') : String(valeur);

/**
 * Messages composes a partir des `details` structures.
 *
 * Chaque entree rend `null` quand les details attendus manquent : le
 * composeur passe alors au repli suivant plutot que d'afficher une phrase
 * trouee du genre « soit undefined caracteres de trop ».
 */
const COMPOSEURS: Partial<
  Record<ErrorCode, (d: Record<string, unknown>) => string | null>
> = {
  VALIDATION_ERROR: (d) => {
    if (typeof d.caracteres === 'number' && typeof d.limite === 'number') {
      const trop = d.caracteres - d.limite;
      return (
        `Ce cours fait ${nombre(d.caracteres)} caractères, soit ` +
        `${nombre(trop)} de trop. La limite est de ${nombre(d.limite)}. ` +
        `Découpez-le en plusieurs cours : le resume et le quiz y gagneront ` +
        `en précision.`
      );
    }
    if (typeof d.extension === 'string' && Array.isArray(d.acceptes)) {
      return (
        `Le format ${d.extension} n'est pas reconnu. Formats acceptés : ` +
        `${(d.acceptes as string[]).join(', ')}.`
      );
    }
    if (typeof d.extension === 'string') {
      return `Le format ${d.extension} n'est pas lisible par StudyAI.`;
    }
    return null;
  },

  RATE_LIMITED: (d) => {
    if (typeof d.attente_s !== 'number') return null;
    return (
      `Trop d'analyses en peu de temps. Réessayez dans ` +
      `${d.attente_s} seconde${d.attente_s > 1 ? 's' : ''}.`
    );
  },
};

/**
 * Le message a afficher, le plus precis disponible.
 *
 * @param messageServeur la phrase composee par le serveur, quand il y en a une
 */
export function messagePour(
  code: ErrorCode,
  details: Record<string, unknown> = {},
  messageServeur?: string,
): string {
  // Une panne reseau n'a pas de message serveur, par definition.
  if (details.cause === 'reseau') return 'Le serveur est injoignable.';

  const compose = COMPOSEURS[code]?.(details);
  if (compose) return compose;

  const duServeur = messageServeur?.trim();
  if (duServeur) return duServeur;

  return GENERIQUES[code] ?? GENERIQUES.INTERNAL;
}
