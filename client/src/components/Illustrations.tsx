import type { ReactNode } from 'react';
import { useI18n } from '../lib/i18n';

/**
 * Illustrations de la page d'accueil (22 octobre).
 *
 * POURQUOI PAS DES CAPTURES. Une page entiere de l'application reduite dans
 * une carte de 400 px devenait du texte de 6 px : le visiteur voyait « une
 * capture », pas ce que fait StudyAI. Et chaque retouche de l'interface la
 * perimait. Chaque illustration montre ici UN moment, a taille lisible, avec
 * les composants du site : elle suit le design sans etre refaite.
 *
 * LES TEXTES SONT DE VRAIES SORTIES DE STUDYAI, recopiees mot pour mot des
 * captures du 18 octobre (atelier 5 du module, gemini-3.5-flash-lite) : la
 * question 1 du quiz et sa citation, la reponse du tuteur et deux de ses
 * extraits, son refus sur le prix de Copilot, la synthese et les notions du
 * resume. Rien n'est invente ; si l'on change un texte ici, il doit venir
 * d'une vraie sortie. Ils restent en francais dans les deux langues, comme
 * les sorties du modele dans l'application.
 *
 * Chaque illustration est une image pour les lecteurs d'ecran : une phrase la
 * decrit, et son contenu n'est pas lu deux fois.
 */

const COURS = 'Atelier 5 — Testing avec GitHub Copilot';

function Fenetre({ onglet, children }: { onglet: string; children: ReactNode }) {
  return (
    <div className="ill-fenetre ton-cours-5">
      <div className="ill-tete">
        <span className="ill-pastille" />
        <span className="ill-cours">{COURS}</span>
        <span className="ill-onglet">{onglet}</span>
      </div>
      <div className="ill-corps">{children}</div>
    </div>
  );
}

/** Une question corrigee, avec l'explication et la citation du cours. */
export function IllustrationQuiz() {
  const { t } = useI18n();
  const options = [
    "L'utilisation de GitHub Copilot pour accélérer la création de cas de test pertinents et documentés",
    "L'écriture exclusive de scripts en langage assembleur pour optimiser les performances",
    "La migration complète d'une base de données relationnelle vers le cloud",
  ];
  return (
    <figure className="ill" role="img" aria-label={t('accueil.ill.quiz')}>
      <div aria-hidden="true">
        <Fenetre onglet="Quiz">
          <p className="ill-etat">✓ {t('quiz.bonne')}</p>
          <p className="ill-question">Quel est le principal fil conducteur de l'atelier sur le testing ?</p>
          <ul className="ill-options">
            {options.map((o, i) => (
              <li key={o} className={i === 0 ? 'ill-option-juste' : undefined}>
                <b>{'ABC'[i]}</b>
                {o}
              </li>
            ))}
          </ul>
          <div className="ill-citation">
            Extrait du cours : « Le fil conducteur est l'utilisation de GitHub Copilot pour accélérer la création de cas de test
            pertinents et documentés. »
            <span>{t('source.voir')} →</span>
          </div>
        </Fenetre>
      </div>
    </figure>
  );
}

/** Le refus du tuteur : la carte posee sur l'illustration d'ouverture. */
export function IllustrationRefus() {
  const { t } = useI18n();
  return (
    <figure className="ill ill-refus" role="img" aria-label={t('accueil.ill.refus')}>
      <div aria-hidden="true">
        <p className="ill-bulle-etudiant">Combien coûte un abonnement à GitHub Copilot ?</p>
        <p className="ill-bulle-tuteur">
          Les passages retrouvés ne traitent pas cette question.
          <span className="ill-hors">{t('chat.horsCours')}</span>
        </p>
      </div>
    </figure>
  );
}

/** Une reponse du tuteur avec ses extraits, puis un refus. */
export function IllustrationTuteur() {
  const { t } = useI18n();
  return (
    <figure className="ill" role="img" aria-label={t('accueil.ill.tuteur')}>
      <div aria-hidden="true">
        <Fenetre onglet="Tuteur">
          <p className="ill-bulle-etudiant">Quel outil permet de mesurer la couverture de code ?</p>
          <div className="ill-bulle-tuteur">
            L'outil mentionné pour mesurer la couverture de code est pytest-cov, utilisé via la commande pytest.
            <div className="ill-extraits">
              <code>pytest --cov=booking_engine</code>
            </div>
          </div>
          <p className="ill-bulle-etudiant">Combien coûte un abonnement à GitHub Copilot ?</p>
          <p className="ill-bulle-tuteur">
            Les passages retrouvés ne traitent pas cette question.
            <span className="ill-hors">{t('chat.horsCours')}</span>
          </p>
        </Fenetre>
      </div>
    </figure>
  );
}

/** La synthese et les notions a retenir. */
export function IllustrationResume() {
  const { t } = useI18n();
  const notions = ['GitHub Copilot', 'tests unitaires', 'couverture de code', 'Gherkin', 'tests fonctionnels', 'pytest'];
  return (
    <figure className="ill" role="img" aria-label={t('accueil.ill.resume')}>
      <div aria-hidden="true">
        <Fenetre onglet="Résumé">
          <p className="ill-titre">{t('resume.synthese')}</p>
          <p className="ill-texte">
            Ce cours propose un atelier pratique d'assurance qualité logicielle articulé en deux parties, utilisant GitHub
            Copilot pour accélérer la création de tests. La première partie consiste à développer des tests unitaires en
            Python pour une fonction de réservation hôtelière et à mesurer la couverture de code associée avec pytest-cov.
          </p>
          <p className="ill-sous-titre">{t('resume.pointsCles')}</p>
          <p className="ill-point">
            <b>1</b>L'atelier utilise GitHub Copilot pour accélérer la création de cas de test pertinents et documentés.
          </p>
          <p className="ill-sous-titre">{t('resume.notions')}</p>
          <div className="ill-notions">
            {notions.map((n) => (
              <span key={n}>{n}</span>
            ))}
          </div>
        </Fenetre>
      </div>
    </figure>
  );
}

/** Le score du quiz rendu. */
export function IllustrationScore() {
  const { t } = useI18n();
  return (
    <figure className="ill" role="img" aria-label={t('accueil.ill.score')}>
      <div aria-hidden="true">
        <Fenetre onglet="Quiz">
          <div className="ill-score">
            <span className="ill-anneau">
              <svg viewBox="0 0 72 72" width="72" height="72">
                <circle cx="36" cy="36" r="31" fill="none" stroke="var(--neutre-100)" strokeWidth="7" />
                <circle cx="36" cy="36" r="31" fill="none" stroke="var(--c)" strokeWidth="7" strokeLinecap="round"
                  strokeDasharray={`${0.6 * 2 * Math.PI * 31} ${2 * Math.PI * 31}`} transform="rotate(-90 36 36)" />
              </svg>
              <b>60</b>
              <small>/100</small>
            </span>
            <div>
              <p className="ill-titre">{t('quiz.resultat')}</p>
              <p className="ill-texte">3 bonne(s) réponse(s) sur 5.</p>
            </div>
          </div>
        </Fenetre>
      </div>
    </figure>
  );
}
