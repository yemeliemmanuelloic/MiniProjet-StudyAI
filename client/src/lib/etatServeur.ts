/**
 * Etat de joignabilite du serveur, vu du navigateur (20 octobre).
 *
 * POURQUOI. L'API est hebergee sur l'offre gratuite de Render : apres
 * quinze minutes sans visite, le service s'endort et la premiere requete
 * attend son reveil, jusqu'a une minute. Pendant ce temps l'interface
 * affichait un squelette de chargement sans explication : on croyait le
 * site casse. Et quand le serveur ne repondait pas du tout, rien ne le
 * disait non plus.
 *
 * Trois etats suffisent :
 *  - `pret`       : la derniere requete a abouti (quel que soit son statut HTTP) ;
 *  - `reveil`     : une requete attend depuis plus de SEUIL_REVEIL_MS ;
 *  - `injoignable`: la derniere requete a echoue au niveau reseau, ou le
 *                   serveur a repondu 502/503/504 (passerelle sans service).
 *
 * Logique pure, sans React : `api.ts` la nourrit, un composant l'affiche.
 */

export type Etat = 'pret' | 'reveil' | 'injoignable';

/** Au-dela, une requete n'est plus « lente » : le serveur dort. */
export const SEUIL_REVEIL_MS = 2500;

let etat: Etat = 'pret';
let enCours = 0;
/** Requetes encore en vol qui ont deja depasse le seuil. */
let lentes = 0;
const abonnes = new Set<(e: Etat) => void>();

function changer(nouveau: Etat): void {
  if (nouveau === etat) return;
  etat = nouveau;
  abonnes.forEach((f) => f(etat));
}

export function etatActuel(): Etat {
  return etat;
}

export function abonner(f: (e: Etat) => void): () => void {
  abonnes.add(f);
  return () => abonnes.delete(f);
}

/**
 * A appeler au depart de chaque requete. Rend la fonction a appeler a
 * son issue, avec `true` si le serveur a repondu, `false` sinon.
 */
export function suivreRequete(): (repondu: boolean) => void {
  enCours += 1;
  let lente = false;
  const minuteur = setTimeout(() => {
    lente = true;
    lentes += 1;
    if (etat !== 'injoignable') changer('reveil');
  }, SEUIL_REVEIL_MS);
  let fini = false;
  return (repondu) => {
    if (fini) return;
    fini = true;
    clearTimeout(minuteur);
    enCours -= 1;
    if (lente) lentes -= 1;
    if (!repondu) changer('injoignable');
    // Une reponse rapide ne leve pas le bandeau tant qu'une autre requete
    // attend encore le reveil du serveur.
    else changer(lentes > 0 ? 'reveil' : 'pret');
  };
}

/** Une passerelle qui repond sans service derriere : 502, 503, 504. */
export function statutIndisponible(statut: number): boolean {
  return statut === 502 || statut === 503 || statut === 504;
}

/** Pour les tests uniquement. */
export function reinitialiser(): void {
  etat = 'pret';
  enCours = 0;
  lentes = 0;
  abonnes.clear();
}

/** Nombre de requetes en vol : sert aux tests. */
export function requetesEnCours(): number {
  return enCours;
}
