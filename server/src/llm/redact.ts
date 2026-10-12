/**
 * Anonymisation — le coeur technique du projet.
 *
 * L'enonce impose que jamais de donnees personnelles brutes ne soient envoyees
 * telles quelles au LLM. Ce module remplace ces donnees par des jetons avant
 * l'appel, et restaure les valeurs reelles a l'affichage.
 *
 * ATTENTION, honnetete methodologique : il s'agit d'une PSEUDONYMISATION, pas
 * d'une anonymisation au sens du RGPD. Un faisceau d'informations residuelles
 * (parcours, dates, secteur) pourrait theoriquement permettre une
 * reidentification. Le rapport doit le dire, pas le masquer.
 */

export type TokenType =
  | 'NOM'
  | 'EMAIL'
  | 'TEL'
  | 'ADRESSE'
  | 'URL'
  | 'ETABLISSEMENT'
  | 'DATE_NAISSANCE'
  | 'SECRET';

/** jeton -> valeur reelle. Vit en memoire le temps d'une requete, jamais persiste. */
export type RedactionMap = Map<string, string>;

export interface KnownValues {
  fullName?: string | null;
  phone?: string | null;
  city?: string | null;
}

/** Etablissements frequents ; a completer selon le corpus. */
const INSTITUTIONS = [
  'ESPRIT',
  'INSAT',
  'ENIT',
  'ENSI',
  'ISET',
  'FST',
  'Universite',
  'University',
];

/**
 * Secrets. Un CV contient parfois une clef oubliee dans une note interne — cas
 * constate le 1er octobre lors de la premiere verification reelle : la fausse
 * clef AWS du jeu de donnees partait vers le fournisseur.
 *
 * Masquer un secret ne protege pas une donnee personnelle : ca evite de
 * divulguer un identifiant appartenant a un tiers, souvent l'ancien employeur
 * du candidat. C'est une obligation distincte, et plus grave.
 */
const SECRETS: ReadonlyArray<RegExp> = [
  /\bAKIA[0-9A-Z]{16}\b/g, // AWS
  /\bsk-[A-Za-z0-9_-]{20,}\b/g, // OpenAI
  /\bsk-ant-[A-Za-z0-9_-]{20,}\b/g, // Anthropic
  /\bhf_[A-Za-z0-9]{20,}\b/g, // Hugging Face
  /\bAIza[0-9A-Za-z_-]{35}\b/g, // Google
  /\bgh[pousr]_[A-Za-z0-9]{30,}\b/g, // GitHub
  /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/g, // Slack
  /\b(?:postgres(?:ql)?|mysql|mongodb(?:\+srv)?):\/\/[^\s]+/gi, // chaines de connexion
  // Lignes du type « mot de passe : xxx », « password=xxx », « token: xxx »
  /\b(?:mot de passe|password|passwd|secret|token|api[_ -]?key|cle)\s*[:=]\s*\S{6,}/gi,
];

/** Une plage d'annees n'est pas un numero de telephone. */
const PLAGE_ANNEES = /^(?:19|20)\d{2}\s*[-–/]\s*(?:19|20)\d{2}$/;

const PATTERNS: ReadonlyArray<[TokenType, RegExp]> = [
  ['EMAIL', /[\w.+-]+@[\w-]+\.[\w.-]+/g],
  ['URL', /\bhttps?:\/\/\S+|\b(?:www\.|linkedin\.com|github\.com)\/\S+/gi],
  ['DATE_NAISSANCE', /\b(?:0?[1-9]|[12]\d|3[01])[/.-](?:0?[1-9]|1[0-2])[/.-](?:19|20)\d{2}\b/g],
  // Formats nationaux et internationaux, separateurs varies. Le garde-fou
  // PLAGE_ANNEES evite d'avaler « 2022-2026 », qui est une periode de formation
  // utile au scoring et non une donnee de contact.
  ['TEL', /(?:\+\d{1,3}[\s.-]?)?(?:\(\d{1,4}\)[\s.-]?)?\d{2}(?:[\s.-]?\d{2}){3,4}\b/g],
  ['ADRESSE', /\b\d{1,4}[,\s]+(?:rue|avenue|av\.|boulevard|bd|impasse|route)\s+[^\n,]{2,40}/gi],
];

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Remplace les donnees personnelles par des jetons numerotes et stables :
 * une meme valeur reçoit toujours le meme jeton dans un meme appel.
 */
export function redact(text: string, known: KnownValues = {}): {
  redacted: string;
  map: RedactionMap;
} {
  const map: RedactionMap = new Map();
  const counters = new Map<TokenType, number>();
  const seen = new Map<string, string>();

  const tokenFor = (type: TokenType, value: string): string => {
    const cached = seen.get(value);
    if (cached) return cached;

    const next = (counters.get(type) ?? 0) + 1;
    counters.set(type, next);
    const token = `[${type}_${next}]`;
    seen.set(value, token);
    map.set(token, value);
    return token;
  };

  let out = text;

  // 1. Valeurs connues du profil : detection exacte plutot que probabiliste.
  //    C'est ce qui rend le masquage du nom fiable, la ou une heuristique
  //    echouerait sur un nom rare ou homonyme d'un mot commun.
  if (known.fullName) {
    for (const part of known.fullName.split(/\s+/).filter((p) => p.length > 1)) {
      out = out.replace(
        new RegExp(`\\b${escapeRegExp(part)}\\b`, 'gi'),
        () => tokenFor('NOM', known.fullName!),
      );
    }
  }
  if (known.phone) {
    out = out.replace(
      new RegExp(escapeRegExp(known.phone), 'g'),
      () => tokenFor('TEL', known.phone!),
    );
  }
  if (known.city) {
    out = out.replace(
      new RegExp(`\\b${escapeRegExp(known.city)}\\b`, 'gi'),
      () => tokenFor('ADRESSE', known.city!),
    );
  }

  // 2. Secrets d'abord : une chaine de connexion contient une adresse et un
  //    mot de passe, il faut la neutraliser avant que d'autres motifs la
  //    decoupent en morceaux.
  for (const pattern of SECRETS) {
    out = out.replace(pattern, (match) => tokenFor('SECRET', match));
  }

  // 3. Motifs generiques.
  for (const [type, pattern] of PATTERNS) {
    out = out.replace(pattern, (match) => {
      if (type === 'TEL' && PLAGE_ANNEES.test(match.trim())) return match;
      return tokenFor(type, match);
    });
  }

  // 4. Etablissements de formation.
  for (const name of INSTITUTIONS) {
    out = out.replace(
      new RegExp(`\\b${escapeRegExp(name)}\\b[^\\n,.;]{0,30}`, 'gi'),
      (match) => tokenFor('ETABLISSEMENT', match.trim()),
    );
  }

  return { redacted: out, map };
}

/** Restaure les valeurs reelles dans une sortie validee, recursivement. */
export function rehydrate<T>(value: T, map: RedactionMap): T {
  if (typeof value === 'string') {
    let out: string = value;
    for (const [token, real] of map) out = out.split(token).join(real);
    return out as unknown as T;
  }
  if (Array.isArray(value)) {
    return value.map((item) => rehydrate(item, map)) as unknown as T;
  }
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value)) out[key] = rehydrate(item, map);
    return out as T;
  }
  return value;
}

/**
 * Taux de fuite : proportion de valeurs personnelles connues encore presentes
 * dans la charge utile. Metrique du banc d'essai (AA5), et garde-fou en test.
 */
export function leakRate(redacted: string, known: KnownValues): number {
  const values = [known.fullName, known.phone, known.city].filter(
    (v): v is string => Boolean(v),
  );
  if (values.length === 0) return 0;
  const leaked = values.filter((v) =>
    redacted.toLowerCase().includes(v.toLowerCase()),
  );
  return leaked.length / values.length;
}
