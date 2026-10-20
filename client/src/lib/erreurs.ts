import type { ErrorCode } from './api';

/**
 * Ce que l'utilisateur doit faire face a chaque erreur.
 *
 * Le message de `api.ts` dit ce qui s'est passe. Celui-ci dit quoi faire — et
 * c'est ce qui manquait : « Le quota d'analyses est atteint » laissait
 * l'etudiant devant un bandeau rouge sans issue.
 *
 * `reessayable` reflete exactement la politique de reprise du serveur
 * (voir docs/ARCHITECTURE.md section 7). Proposer « Reessayer » sur un quota
 * epuise ou une clef refusee serait mentir a l'utilisateur : le serveur
 * lui-meme ne reessaie pas, parce que reessayer ne peut pas aider.
 */

export type Famille = 'saisie' | 'acces' | 'service' | 'attente';

export interface Conduite {
  famille: Famille;
  conseil: string;
  reessayable: boolean;
  /** Lien de repli quand il n'y a rien a reessayer. */
  lien?: { libelle: string; vers: string };
}

export const CONDUITES: Record<ErrorCode, Conduite> = {
  VALIDATION_ERROR: {
    famille: 'saisie',
    conseil: 'Corrigez les informations signalées, puis renvoyez le formulaire.',
    reessayable: false,
  },
  UNAUTHORIZED: {
    famille: 'acces',
    conseil: 'Votre session a expiré. Reconnectez-vous pour continuer.',
    reessayable: false,
    lien: { libelle: 'Se reconnecter', vers: '/connexion' },
  },
  FORBIDDEN: {
    famille: 'acces',
    conseil: "Ce contenu appartient à un autre étudiant.",
    reessayable: false,
    lien: { libelle: 'Revenir à mes cours', vers: '/cours' },
  },
  NOT_FOUND: {
    famille: 'acces',
    conseil: "Ce contenu n'existe plus, ou le lien est erroné.",
    reessayable: false,
    lien: { libelle: 'Revenir à mes cours', vers: '/cours' },
  },
  RATE_LIMITED: {
    famille: 'attente',
    conseil: 'Trop de demandes en peu de temps. Patientez quelques instants.',
    reessayable: true,
  },
  LLM_KEY_MISSING: {
    famille: 'service',
    conseil:
      "Le service d'analyse n'est pas configuré. Le reste de l'application reste utilisable : vos cours sont intacts.",
    reessayable: false,
  },
  LLM_TIMEOUT: {
    famille: 'attente',
    conseil: "L'analyse a été trop longue. Un cours plus court aboutit plus vite.",
    reessayable: true,
  },
  LLM_QUOTA_EXCEEDED: {
    famille: 'attente',
    conseil:
      "Le quota du jour est épuisé. Réessayez demain — vos résumés déjà produits restent consultables.",
    reessayable: false,
  },
  LLM_INVALID_OUTPUT: {
    famille: 'service',
    conseil:
      "Le modèle n'a pas produit de réponse exploitable, et elle a donc été refusée plutôt qu'affichée. Relancer aboutit souvent.",
    reessayable: true,
  },
  LLM_UNAVAILABLE: {
    famille: 'service',
    conseil: "Le service du modèle ne répond pas. Réessayez dans un instant.",
    reessayable: true,
  },
  INTERNAL: {
    famille: 'service',
    conseil: "Une erreur inattendue s'est produite de notre côté.",
    reessayable: true,
  },
};

/**
 * Conduite a tenir pour une erreur donnee.
 *
 * Le code seul ne suffit pas toujours : INTERNAL couvre aussi bien un bug du
 * serveur qu'un serveur injoignable, et le conseil n'est pas le meme.
 */
export function conduitePour(code: ErrorCode, details: Record<string, unknown> = {}): Conduite {
  if (details.cause === 'reseau') {
    return {
      famille: 'service',
      conseil:
        "Vérifiez votre connexion. Si elle fonctionne, le serveur de StudyAI est arrêté.",
      reessayable: true,
    };
  }
  if (details.cause === 'indisponible') {
    return {
      famille: 'service',
      conseil:
        "Le serveur redémarre ou est en maintenance. Réessayez dans une minute.",
      reessayable: true,
    };
  }
  return CONDUITES[code] ?? CONDUITES.INTERNAL;
}

/** Libelle lisible de la famille, affiche a cote du code technique. */
export const LIBELLE_FAMILLE: Record<Famille, string> = {
  saisie: 'Données saisies',
  acces: 'Accès',
  service: "Service d'analyse",
  attente: 'Patience requise',
};
