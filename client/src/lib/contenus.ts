/**
 * Textes des pages d'information : juridique, a propos, aide, FAQ.
 *
 * POURQUOI HORS DU DICTIONNAIRE. Le dictionnaire de traduction porte des
 * libelles courts ; ces pages sont des textes longs, structures en sections.
 * Chaque page existe ici en francais ET en anglais, avec les memes sections
 * dans le meme ordre — un test (contenus.test.ts) le verifie.
 *
 * Balisage minimal dans les textes : **gras**, et [libelle](/chemin) pour un
 * lien interne. Rien d'autre : pas de HTML, donc rien a echapper.
 *
 * AVERTISSEMENT. Ces textes ont ete rediges par l'equipe d'un projet
 * etudiant, a partir du fonctionnement reel de l'application. Ils ne sont pas
 * un avis juridique ; ils doivent etre relus avant toute exploitation
 * publique au-dela du cadre du module.
 */
import { ANNEE, EMAIL_CONTACT, ENCADRANT, EQUIPE, ETABLISSEMENT } from './site';

export type Bloc =
  | { type: 'p'; texte: string }
  | { type: 'liste'; items: string[] }
  | { type: 'tableau'; entetes: string[]; lignes: string[][] };

export interface Section {
  titre: string;
  blocs: Bloc[];
}

export interface PageTexte {
  surtitre: string;
  titre: string;
  sous: string;
  sections: Section[];
  /** Affiche la date de mise a jour (pages juridiques). */
  datee?: boolean;
}

export type ClePage = 'mentions' | 'confidentialite' | 'conditions' | 'apropos' | 'aide' | 'faq';

const p = (texte: string): Bloc => ({ type: 'p', texte });
const liste = (...items: string[]): Bloc => ({ type: 'liste', items });

const EQUIPE_TXT = EQUIPE.join(', ');

export const PAGES: Record<ClePage, { fr: PageTexte; en: PageTexte }> = {
  // ------------------------------------------------------------------ mentions
  mentions: {
    fr: {
      surtitre: 'Informations légales',
      titre: 'Mentions légales',
      sous: 'Qui édite StudyAI, qui l’héberge, et comment nous joindre.',
      datee: true,
      sections: [
        {
          titre: 'Éditeur',
          blocs: [
            p(`StudyAI est un **projet étudiant** réalisé dans le cadre du module *IA for Software Engineering* (IASE0001), classe 5SAE9, à ${ETABLISSEMENT}, année universitaire ${ANNEE}-${ANNEE + 1}.`),
            p(`Équipe responsable du projet et de la publication : **${EQUIPE_TXT}**. Encadrement pédagogique : ${ENCADRANT}.`),
            p(`Contact : **${EMAIL_CONTACT}** — voir aussi la page [Contact](/contact).`),
            p('StudyAI n’est pas un service commercial : il est gratuit et sans publicité.'),
          ],
        },
        {
          titre: 'Hébergement',
          blocs: [
            {
              type: 'tableau',
              entetes: ['Rôle', 'Prestataire', 'Localisation'],
              lignes: [
                ['Site et serveur d’application', 'Render Services, Inc.', 'États-Unis'],
                ['Base de données', 'Supabase, Inc. (sur Amazon Web Services)', 'Irlande (Union européenne)'],
                ['Modèle d’intelligence artificielle', 'Google LLC — API Gemini', 'États-Unis'],
              ],
            },
          ],
        },
        {
          titre: 'Propriété intellectuelle',
          blocs: [
            p('Le code, les textes et l’identité visuelle de StudyAI sont la propriété de l’équipe du projet. Les cours que vous importez restent **les vôtres** ou ceux de leurs auteurs : voir les [conditions d’utilisation](/conditions).'),
            p('Les photographies de la page d’accueil sont dans le **domaine public** (CC0 1.0) : Wonderlane (Flickr) et Startup Stock Photos (StockSnap).'),
          ],
        },
        {
          titre: 'Données personnelles',
          blocs: [p('Le traitement de vos données est décrit dans la [politique de confidentialité](/confidentialite).')],
        },
      ],
    },
    en: {
      surtitre: 'Legal information',
      titre: 'Legal notice',
      sous: 'Who publishes StudyAI, who hosts it, and how to reach us.',
      datee: true,
      sections: [
        {
          titre: 'Publisher',
          blocs: [
            p(`StudyAI is a **student project** built for the *AI for Software Engineering* module (IASE0001), class 5SAE9, at ${ETABLISSEMENT}, academic year ${ANNEE}-${ANNEE + 1}.`),
            p(`Team responsible for the project and its publication: **${EQUIPE_TXT}**. Academic supervision: ${ENCADRANT}.`),
            p(`Contact: **${EMAIL_CONTACT}** — see also the [Contact](/contact) page.`),
            p('StudyAI is not a commercial service: it is free and ad-free.'),
          ],
        },
        {
          titre: 'Hosting',
          blocs: [
            {
              type: 'tableau',
              entetes: ['Role', 'Provider', 'Location'],
              lignes: [
                ['Website and application server', 'Render Services, Inc.', 'United States'],
                ['Database', 'Supabase, Inc. (on Amazon Web Services)', 'Ireland (European Union)'],
                ['Artificial intelligence model', 'Google LLC — Gemini API', 'United States'],
              ],
            },
          ],
        },
        {
          titre: 'Intellectual property',
          blocs: [
            p('StudyAI’s code, texts and visual identity belong to the project team. The courses you import remain **yours** or their authors’: see the [terms of use](/conditions).'),
            p('The home page photographs are in the **public domain** (CC0 1.0): Wonderlane (Flickr) and Startup Stock Photos (StockSnap).'),
          ],
        },
        {
          titre: 'Personal data',
          blocs: [p('How your data is handled is described in the [privacy policy](/confidentialite).')],
        },
      ],
    },
  },

  // ----------------------------------------------------------- confidentialite
  confidentialite: {
    fr: {
      surtitre: 'Informations légales',
      titre: 'Politique de confidentialité',
      sous: 'Quelles données StudyAI conserve, pourquoi, combien de temps, et vos droits.',
      datee: true,
      sections: [
        {
          titre: 'En bref',
          blocs: [
            liste(
              'StudyAI ne conserve que ce qui sert à vous faire réviser : votre adresse, vos cours et ce que l’IA en a produit.',
              'Avant tout envoi au modèle d’IA, les **données personnelles reconnaissables** de vos cours sont **remplacées par des jetons** ; vous pouvez voir exactement ce qui a été transmis.',
              'Aucun cookie, aucun traceur, aucune publicité, aucune mesure d’audience.',
              'Vous pouvez **télécharger** ou **supprimer** toutes vos données à tout moment, depuis [Mon compte](/compte).',
            ),
          ],
        },
        {
          titre: 'Les données conservées',
          blocs: [
            {
              type: 'tableau',
              entetes: ['Donnée', 'Pourquoi', 'Durée de conservation'],
              lignes: [
                ['Adresse électronique, mot de passe (sous forme d’empreinte bcrypt, jamais en clair)', 'Vous identifier', 'Jusqu’à la suppression du compte'],
                ['Dates de création du compte et de connexion', 'Vous montrer la connexion précédente, pour repérer un accès suspect', 'Jusqu’à la suppression du compte'],
                ['Vos cours (texte importé)', 'Les résumer, vous interroger, répondre à vos questions', 'Jusqu’à leur suppression ou celle du compte'],
                ['Résumés, quiz, tentatives, conversations, cartes, examens', 'Votre révision et votre progression', 'Jusqu’à leur suppression ou celle du compte'],
                ['Texte envoyé au modèle (déjà pseudonymisé)', 'Vous le montrer : c’est la preuve du masquage', 'Comme le résumé auquel il se rattache'],
                ['Mesures techniques (jetons, latence)', 'Le tableau de consommation', 'Comme la sortie à laquelle elles se rattachent'],
              ],
            },
            p('Le jeton de connexion est conservé dans le **stockage local** de votre navigateur, pas dans un cookie ; il expire au bout de 7 jours et disparaît à la déconnexion.'),
          ],
        },
        {
          titre: 'Ce qui est envoyé au modèle d’IA',
          blocs: [
            p('Pour produire un résumé, un quiz ou une réponse, le texte de votre cours est envoyé à l’**API Gemini de Google**. Avant cet envoi, StudyAI remplace par des jetons (`[EMAIL_1]`, `[TEL_1]`…) les adresses électroniques, numéros de téléphone, adresses postales, liens, dates de naissance, noms d’établissements et clés d’accès qu’il reconnaît. Les vraies valeurs sont remises en place à l’affichage, chez vous seulement.'),
            p('**Limite à connaître** : les **noms de personnes** ne sont pas reconnus automatiquement et partent tels quels. Évitez d’importer des documents contenant des informations personnelles sur des tiers.'),
            p('Sur son offre gratuite, Google indique dans ses conditions pouvoir utiliser les contenus transmis pour améliorer ses services. C’est une raison de plus pour laquelle le masquage a lieu **avant** l’envoi.'),
          ],
        },
        {
          titre: 'Sous-traitants et destinataires',
          blocs: [
            p('Vos données ne sont ni vendues ni partagées à des fins commerciales. Elles transitent par trois prestataires techniques, décrits dans les [mentions légales](/mentions-legales) : Render (serveurs, États-Unis), Supabase (base de données, Irlande) et Google (modèle d’IA, États-Unis).'),
          ],
        },
        {
          titre: 'Sécurité',
          blocs: [
            liste(
              'Connexions chiffrées (HTTPS) ; mots de passe stockés sous forme d’empreinte bcrypt.',
              'Chaque étudiant n’accède qu’à ses propres données ; le serveur le vérifie à chaque requête.',
              'Changer de mot de passe déconnecte vos autres appareils.',
              'Tentatives de connexion répétées et créations de comptes en série sont freinées.',
            ),
          ],
        },
        {
          titre: 'Cookies et traceurs',
          blocs: [p('StudyAI **ne dépose aucun cookie** et n’utilise **aucun traceur**, aucun outil de mesure d’audience ni aucune publicité. Aucun bandeau de consentement n’est donc nécessaire. Seul le jeton de connexion et votre choix de langue sont gardés dans le stockage local de votre navigateur.')],
        },
        {
          titre: 'Vos droits',
          blocs: [
            liste(
              '**Accès et portabilité** : téléchargez toutes vos données au format JSON depuis [Mon compte](/compte).',
              '**Effacement** : supprimez un cours, ou votre compte et toutes vos données, depuis [Mon compte](/compte). La suppression est immédiate et définitive.',
              '**Rectification** : modifiez votre mot de passe depuis [Mon compte](/compte) ; pour toute autre demande, écrivez-nous.',
            ),
            p(`Pour toute question sur vos données : **${EMAIL_CONTACT}**.`),
          ],
        },
      ],
    },
    en: {
      surtitre: 'Legal information',
      titre: 'Privacy policy',
      sous: 'What data StudyAI keeps, why, for how long, and your rights.',
      datee: true,
      sections: [
        {
          titre: 'In short',
          blocs: [
            liste(
              'StudyAI only keeps what helps you revise: your address, your courses and what the AI produced from them.',
              'Before anything is sent to the AI model, **recognisable personal data** in your courses is **replaced with tokens**; you can see exactly what was transmitted.',
              'No cookies, no trackers, no advertising, no audience measurement.',
              'You can **download** or **delete** all your data at any time from [My account](/compte).',
            ),
          ],
        },
        {
          titre: 'Data we keep',
          blocs: [
            {
              type: 'tableau',
              entetes: ['Data', 'Why', 'Retention'],
              lignes: [
                ['Email address, password (as a bcrypt hash, never in clear)', 'Identify you', 'Until the account is deleted'],
                ['Account creation and sign-in dates', 'Show you the previous sign-in, to spot suspicious access', 'Until the account is deleted'],
                ['Your courses (imported text)', 'Summarise them, quiz you, answer your questions', 'Until you delete them or the account'],
                ['Summaries, quizzes, attempts, conversations, cards, exams', 'Your revision and progress', 'Until you delete them or the account'],
                ['Text sent to the model (already pseudonymised)', 'Show it to you: it is the proof of masking', 'As long as the related summary'],
                ['Technical measures (tokens, latency)', 'The usage dashboard', 'As long as the related output'],
              ],
            },
            p('Your sign-in token is kept in your browser’s **local storage**, not in a cookie; it expires after 7 days and is removed when you sign out.'),
          ],
        },
        {
          titre: 'What is sent to the AI model',
          blocs: [
            p('To produce a summary, a quiz or an answer, your course text is sent to **Google’s Gemini API**. Before sending, StudyAI replaces with tokens (`[EMAIL_1]`, `[TEL_1]`…) the email addresses, phone numbers, postal addresses, links, birth dates, institution names and access keys it recognises. Real values are put back on display, on your side only.'),
            p('**Known limit**: **people’s names** are not recognised automatically and are sent as they are. Avoid importing documents with personal information about third parties.'),
            p('On its free tier, Google states in its terms that it may use submitted content to improve its services. That is one more reason masking happens **before** sending.'),
          ],
        },
        {
          titre: 'Processors and recipients',
          blocs: [
            p('Your data is neither sold nor shared for commercial purposes. It passes through three technical providers, listed in the [legal notice](/mentions-legales): Render (servers, United States), Supabase (database, Ireland) and Google (AI model, United States).'),
          ],
        },
        {
          titre: 'Security',
          blocs: [
            liste(
              'Encrypted connections (HTTPS); passwords stored as bcrypt hashes.',
              'Each student can only access their own data; the server checks it on every request.',
              'Changing your password signs out your other devices.',
              'Repeated sign-in attempts and bulk account creation are throttled.',
            ),
          ],
        },
        {
          titre: 'Cookies and trackers',
          blocs: [p('StudyAI **sets no cookies** and uses **no trackers**, no audience measurement and no advertising. No consent banner is therefore needed. Only your sign-in token and language choice are kept in your browser’s local storage.')],
        },
        {
          titre: 'Your rights',
          blocs: [
            liste(
              '**Access and portability**: download all your data as JSON from [My account](/compte).',
              '**Erasure**: delete a course, or your account and all your data, from [My account](/compte). Deletion is immediate and permanent.',
              '**Rectification**: change your password from [My account](/compte); for anything else, write to us.',
            ),
            p(`For any question about your data: **${EMAIL_CONTACT}**.`),
          ],
        },
      ],
    },
  },

  // ---------------------------------------------------------------- conditions
  conditions: {
    fr: {
      surtitre: 'Informations légales',
      titre: 'Conditions d’utilisation',
      sous: 'Les règles d’usage de StudyAI. En créant un compte, vous les acceptez.',
      datee: true,
      sections: [
        {
          titre: 'Le service',
          blocs: [p('StudyAI aide à réviser un cours : résumé, quiz, tuteur, cartes de révision, examen blanc, recherche et suivi de progression. Le service est **gratuit**, fourni dans le cadre d’un projet étudiant, **sans garantie de disponibilité** : il peut être interrompu, modifié ou arrêté à tout moment.')],
        },
        {
          titre: 'Votre compte',
          blocs: [
            liste(
              'Vous êtes responsable de la confidentialité de votre mot de passe.',
              'Un compte est personnel : ne le partagez pas.',
              'Vous pouvez le supprimer à tout moment depuis [Mon compte](/compte).',
            ),
          ],
        },
        {
          titre: 'Les contenus que vous importez',
          blocs: [
            p('Vous restez **propriétaire** de vos documents, ou ils restent la propriété de leurs auteurs. N’importez que des contenus que vous avez le droit d’utiliser pour votre propre révision, typiquement les supports distribués dans vos cours.'),
            p('N’importez pas de documents contenant des informations personnelles sensibles sur des tiers : les noms de personnes ne sont pas masqués avant l’envoi au modèle (voir la [politique de confidentialité](/confidentialite)).'),
          ],
        },
        {
          titre: 'Les réponses de l’intelligence artificielle',
          blocs: [
            p('Les résumés, questions et réponses sont produits par un modèle d’IA. StudyAI les contraint à s’appuyer sur votre cours et à citer leurs sources, mais **l’IA peut se tromper**. Vérifiez les points importants dans votre cours : les citations sont là pour cela.'),
            p('StudyAI est un outil d’aide à la révision ; il ne remplace ni votre cours ni votre enseignant, et ne garantit aucun résultat à un examen.'),
          ],
        },
        {
          titre: 'Usage acceptable',
          blocs: [
            liste(
              'Ne tentez pas de contourner les limites d’usage, ni d’accéder aux données d’autres étudiants.',
              'N’automatisez pas les requêtes, ne créez pas de comptes en série.',
              'N’utilisez pas le service pour traiter des contenus illicites.',
            ),
            p('En cas d’abus, l’équipe peut suspendre ou supprimer un compte.'),
          ],
        },
        {
          titre: 'Responsabilité',
          blocs: [p('Dans les limites permises par la loi, l’équipe du projet ne peut être tenue responsable d’une perte de données, d’une interruption du service ou d’une décision prise sur la base d’une réponse de l’IA. Pensez à [télécharger vos données](/compte) régulièrement.')],
        },
        {
          titre: 'Contact et évolution',
          blocs: [p(`Ces conditions peuvent évoluer ; la date de mise à jour figure en haut de cette page. Pour toute question : **${EMAIL_CONTACT}**.`)],
        },
      ],
    },
    en: {
      surtitre: 'Legal information',
      titre: 'Terms of use',
      sous: 'The rules for using StudyAI. By creating an account, you accept them.',
      datee: true,
      sections: [
        {
          titre: 'The service',
          blocs: [p('StudyAI helps you revise a course: summary, quiz, tutor, revision cards, mock exam, search and progress tracking. The service is **free**, provided as a student project, **with no availability guarantee**: it may be interrupted, changed or stopped at any time.')],
        },
        {
          titre: 'Your account',
          blocs: [
            liste(
              'You are responsible for keeping your password confidential.',
              'An account is personal: do not share it.',
              'You can delete it at any time from [My account](/compte).',
            ),
          ],
        },
        {
          titre: 'Content you import',
          blocs: [
            p('You remain the **owner** of your documents, or they remain their authors’ property. Only import content you are entitled to use for your own revision, typically material handed out in your courses.'),
            p('Do not import documents containing sensitive personal information about third parties: people’s names are not masked before being sent to the model (see the [privacy policy](/confidentialite)).'),
          ],
        },
        {
          titre: 'Artificial intelligence answers',
          blocs: [
            p('Summaries, questions and answers are produced by an AI model. StudyAI constrains them to rely on your course and cite their sources, but **the AI can be wrong**. Check important points in your course: that is what the quotes are for.'),
            p('StudyAI is a revision aid; it replaces neither your course nor your teacher, and guarantees no exam result.'),
          ],
        },
        {
          titre: 'Acceptable use',
          blocs: [
            liste(
              'Do not try to bypass usage limits or access other students’ data.',
              'Do not automate requests or create accounts in bulk.',
              'Do not use the service to process unlawful content.',
            ),
            p('In case of abuse, the team may suspend or delete an account.'),
          ],
        },
        {
          titre: 'Liability',
          blocs: [p('To the extent permitted by law, the project team cannot be held liable for data loss, service interruption, or any decision based on an AI answer. Remember to [download your data](/compte) regularly.')],
        },
        {
          titre: 'Contact and changes',
          blocs: [p(`These terms may change; the update date is shown at the top of this page. For any question: **${EMAIL_CONTACT}**.`)],
        },
      ],
    },
  },

  // ------------------------------------------------------------------- apropos
  apropos: {
    fr: {
      surtitre: 'À propos',
      titre: 'Pourquoi StudyAI',
      sous: 'Une IA qui vous fait réviser votre cours — et qui le prouve.',
      sections: [
        {
          titre: 'Notre mission',
          blocs: [
            p('Les étudiants perdent un temps considérable à résumer leurs cours et à s’auto-évaluer. Les assistants généralistes aident, mais ils répondent à partir de **leurs** connaissances, pas du cours sur lequel vous serez évalué : une réponse exacte mais hors programme, ou plausible mais fausse, trompe précisément celui qui révise.'),
            p('StudyAI part de **votre** cours, et de lui seul. Chaque question cite le passage d’où elle vient ; le tuteur refuse quand votre cours ne traite pas la question ; et vous voyez exactement ce qui a été envoyé à l’IA.'),
          ],
        },
        {
          titre: 'Nos principes',
          blocs: [
            liste(
              '**Ancré** : tout ce que produit l’IA s’appuie sur votre cours, sources à l’appui.',
              '**Honnête** : quand le cours ne répond pas, StudyAI le dit au lieu d’inventer.',
              '**Respectueux de vos données** : masquage avant envoi, aucun cookie, export et suppression en un clic.',
              '**Mesuré** : la qualité des réponses de l’IA est évaluée sur de vrais cours, pas supposée.',
            ),
          ],
        },
        {
          titre: 'L’équipe',
          blocs: [
            p(`StudyAI est un projet étudiant du module *IA for Software Engineering*, classe 5SAE9, à ESPRIT (${ANNEE}-${ANNEE + 1}), encadré par ${ENCADRANT}.`),
            {
              type: 'tableau',
              entetes: ['Membre', 'Contribution principale'],
              lignes: [
                ['Emmanuel Yemeli', 'Architecture, modules d’IA, protection des données, interface'],
                ['Yacoubi Khalil', 'Banc d’essai et évaluation de la qualité des réponses'],
                ['Med Rayen Ben Dhia', 'Espace révision : historique, progression, questions ratées'],
              ],
            },
          ],
        },
        {
          titre: 'Sous le capot',
          blocs: [p('Une application web React et TypeScript, une API Python FastAPI, une base PostgreSQL, et le modèle Gemini de Google. Plus de deux cents tests automatisés, et un banc d’essai sur de vrais supports de cours.')],
        },
      ],
    },
    en: {
      surtitre: 'About',
      titre: 'Why StudyAI',
      sous: 'An AI that helps you revise your course — and proves it.',
      sections: [
        {
          titre: 'Our mission',
          blocs: [
            p('Students spend a lot of time summarising their courses and testing themselves. General assistants help, but they answer from **their** knowledge, not from the course you will be assessed on: an answer that is correct but off-syllabus, or plausible but wrong, misleads precisely the person revising.'),
            p('StudyAI starts from **your** course, and only from it. Every question quotes the passage it comes from; the tutor refuses when your course does not cover the question; and you see exactly what was sent to the AI.'),
          ],
        },
        {
          titre: 'Our principles',
          blocs: [
            liste(
              '**Grounded**: everything the AI produces relies on your course, with sources.',
              '**Honest**: when the course has no answer, StudyAI says so instead of making things up.',
              '**Respectful of your data**: masking before sending, no cookies, one-click export and deletion.',
              '**Measured**: the quality of AI answers is evaluated on real courses, not assumed.',
            ),
          ],
        },
        {
          titre: 'The team',
          blocs: [
            p(`StudyAI is a student project for the *AI for Software Engineering* module, class 5SAE9, at ESPRIT (${ANNEE}-${ANNEE + 1}), supervised by ${ENCADRANT}.`),
            {
              type: 'tableau',
              entetes: ['Member', 'Main contribution'],
              lignes: [
                ['Emmanuel Yemeli', 'Architecture, AI modules, data protection, interface'],
                ['Yacoubi Khalil', 'Test bench and evaluation of answer quality'],
                ['Med Rayen Ben Dhia', 'Revision space: history, progress, missed questions'],
              ],
            },
          ],
        },
        {
          titre: 'Under the hood',
          blocs: [p('A React and TypeScript web app, a Python FastAPI API, a PostgreSQL database, and Google’s Gemini model. Over two hundred automated tests, and a test bench on real course material.')],
        },
      ],
    },
  },

  // ---------------------------------------------------------------------- aide
  aide: {
    fr: {
      surtitre: 'Centre d’aide',
      titre: 'Bien démarrer avec StudyAI',
      sous: 'Le guide, étape par étape. Une question précise ? Voir la [FAQ](/faq).',
      sections: [
        {
          titre: '1. Importer un cours',
          blocs: [
            p('Depuis **Mes cours**, cliquez sur **Ajouter un cours**. Deux possibilités :'),
            liste(
              '**Importer un fichier** : PDF, Word (.docx) ou PowerPoint (.pptx), tel que votre enseignant l’a distribué. Les notes de l’orateur des présentations sont lues aussi.',
              '**Coller le texte** : au moins 200 caractères.',
            ),
            p('Un PDF scanné (image sans texte) ne peut pas être lu : il faut un document dont on peut sélectionner le texte.'),
          ],
        },
        {
          titre: '2. Réviser avec l’IA',
          blocs: [
            p('Ouvrez le cours. Trois onglets font appel à l’IA (ils l’indiquent par « 1 appel ») :'),
            liste(
              '**Résumé** : une synthèse, des points clés et les notions à retenir. Choisissez le niveau de détail.',
              '**Quiz** : un QCM ; chaque question cite le passage du cours dont elle vient. Répondez, puis validez pour voir le corrigé.',
              '**Tuteur** : posez une question sur votre cours. S’il n’y trouve pas la réponse, il vous le dit.',
            ),
            p('Un cours long est découpé en parties, résumées puis fusionnées : aucune partie n’est ignorée.'),
          ],
        },
        {
          titre: '3. Retenir dans la durée',
          blocs: [
            p('Ces outils ne font **aucun appel** à l’IA (ils l’indiquent par « gratuit ») :'),
            liste(
              '**Cartes** : fabriquées à partir de vos quiz, elles reviennent au bon moment selon vos réussites.',
              '**Progression** : votre score moyen, votre courbe, les questions ratées plusieurs fois, et une fiche PDF à imprimer.',
              '**Examen blanc** : des questions de plusieurs cours, chronométrées, corrigées cours par cours.',
              '**Rechercher** : un mot dans tous vos cours à la fois.',
            ),
          ],
        },
        {
          titre: '4. Votre tableau de bord',
          blocs: [p('En haut de **Mes cours**, le tableau **Aujourd’hui** indique les cartes à réviser, votre score moyen, votre dernier examen blanc et le cours à retravailler en priorité.')],
        },
        {
          titre: '5. Vos données',
          blocs: [p('Sous chaque résumé, **Ce qui a été envoyé au modèle** montre le texte exact transmis à l’IA, données personnelles masquées. Depuis [Mon compte](/compte), vous pouvez changer de mot de passe, télécharger vos données ou supprimer votre compte.')],
        },
      ],
    },
    en: {
      surtitre: 'Help centre',
      titre: 'Getting started with StudyAI',
      sous: 'The step-by-step guide. A specific question? See the [FAQ](/faq).',
      sections: [
        {
          titre: '1. Import a course',
          blocs: [
            p('From **My courses**, click **Add a course**. Two options:'),
            liste(
              '**Import a file**: PDF, Word (.docx) or PowerPoint (.pptx), as your teacher handed it out. Presentation speaker notes are read too.',
              '**Paste the text**: at least 200 characters.',
            ),
            p('A scanned PDF (image with no text) cannot be read: you need a document whose text can be selected.'),
          ],
        },
        {
          titre: '2. Revise with AI',
          blocs: [
            p('Open the course. Three tabs use the AI (they show “1 call”):'),
            liste(
              '**Summary**: a synopsis, key points and notions to remember. Choose the level of detail.',
              '**Quiz**: multiple-choice questions, each quoting the course passage it comes from. Answer, then submit to see the correction.',
              '**Tutor**: ask a question about your course. If the answer is not there, it tells you.',
            ),
            p('A long course is split into parts, summarised then merged: no part is ignored.'),
          ],
        },
        {
          titre: '3. Remember it for good',
          blocs: [
            p('These tools make **no AI call** (they show “free”):'),
            liste(
              '**Cards**: built from your quizzes, they come back at the right time based on your answers.',
              '**Progress**: your average score, your curve, questions missed several times, and a printable PDF sheet.',
              '**Mock exam**: questions from several courses, timed, graded course by course.',
              '**Search**: a word across all your courses at once.',
            ),
          ],
        },
        {
          titre: '4. Your dashboard',
          blocs: [p('At the top of **My courses**, the **Today** panel shows cards to review, your average score, your latest mock exam and the course to work on first.')],
        },
        {
          titre: '5. Your data',
          blocs: [p('Under each summary, **What was sent to the model** shows the exact text sent to the AI, with personal data masked. From [My account](/compte), you can change your password, download your data or delete your account.')],
        },
      ],
    },
  },

  // ----------------------------------------------------------------------- faq
  faq: {
    fr: {
      surtitre: 'Questions fréquentes',
      titre: 'FAQ',
      sous: 'Les réponses courtes. Le guide complet est dans le [centre d’aide](/aide).',
      sections: [
        { titre: 'StudyAI est-il gratuit ?', blocs: [p('Oui. Il n’y a ni abonnement, ni publicité. Un plafond d’analyses par minute et par jour protège le service ; les outils sans IA (cartes, examen blanc, recherche, progression) restent toujours disponibles.')] },
        { titre: 'L’IA peut-elle se tromper ?', blocs: [p('Oui, comme toute IA. C’est pourquoi chaque question cite le passage de votre cours et le tuteur montre ses sources : vous pouvez tout vérifier. Quand votre cours ne traite pas une question, le tuteur refuse plutôt que d’inventer.')] },
        { titre: 'Pourquoi le tuteur refuse-t-il de répondre ?', blocs: [p('Parce que les passages de votre cours les plus proches de la question n’y répondent pas. C’est voulu : une réponse venue d’ailleurs ne vous aiderait pas pour votre examen. Reformulez avec les mots du cours, ou vérifiez que la notion y figure.')] },
        { titre: 'Mes cours sont-ils envoyés à l’IA ?', blocs: [p('Oui, quand vous demandez un résumé, un quiz ou une réponse — après masquage des données personnelles reconnaissables. Le bouton **Ce qui a été envoyé au modèle** vous le montre. Les noms de personnes ne sont pas masqués : voir la [politique de confidentialité](/confidentialite).')] },
        { titre: 'Quels formats puis-je importer ?', blocs: [p('PDF avec du texte sélectionnable, Word (.docx), PowerPoint (.pptx), ou du texte collé (200 caractères au moins). Les PDF scannés ne sont pas lus.')] },
        { titre: 'Mon cours est très long. Est-il tronqué ?', blocs: [p('Non. Il est découpé en parties, résumées séparément puis fusionnées ; le résumé l’indique. Seul un cours démesuré est refusé, avec un message qui le dit.')] },
        { titre: 'Pourquoi « plafond atteint » ?', blocs: [p('Pour protéger le service, le nombre d’analyses par l’IA est limité par minute et par jour. Attendez le délai indiqué ; en attendant, les cartes, l’examen blanc et la recherche fonctionnent.')] },
        { titre: 'J’ai oublié mon mot de passe.', blocs: [p(`La réinitialisation par e-mail n’est pas encore disponible. Écrivez-nous à **${EMAIL_CONTACT}** depuis l’adresse de votre compte.`)] },
        { titre: 'Comment supprimer mes données ?', blocs: [p('Depuis [Mon compte](/compte) : téléchargez-les d’abord si vous le souhaitez, puis supprimez le compte. Tout est effacé immédiatement et définitivement.')] },
        { titre: 'Le site met du temps à s’ouvrir.', blocs: [p('Le serveur gratuit s’endort après une période d’inactivité et met une trentaine de secondes à se réveiller. Ensuite, tout est rapide.')] },
      ],
    },
    en: {
      surtitre: 'Frequently asked questions',
      titre: 'FAQ',
      sous: 'The short answers. The full guide is in the [help centre](/aide).',
      sections: [
        { titre: 'Is StudyAI free?', blocs: [p('Yes. No subscription, no advertising. A limit on analyses per minute and per day protects the service; tools without AI (cards, mock exam, search, progress) are always available.')] },
        { titre: 'Can the AI be wrong?', blocs: [p('Yes, like any AI. That is why every question quotes your course and the tutor shows its sources: you can check everything. When your course does not cover a question, the tutor refuses rather than making things up.')] },
        { titre: 'Why does the tutor refuse to answer?', blocs: [p('Because the passages of your course closest to the question do not answer it. That is intended: an answer from elsewhere would not help you in your exam. Rephrase using the course’s words, or check the notion is covered.')] },
        { titre: 'Are my courses sent to the AI?', blocs: [p('Yes, when you ask for a summary, a quiz or an answer — after recognisable personal data is masked. The **What was sent to the model** button shows you. People’s names are not masked: see the [privacy policy](/confidentialite).')] },
        { titre: 'Which formats can I import?', blocs: [p('PDF with selectable text, Word (.docx), PowerPoint (.pptx), or pasted text (at least 200 characters). Scanned PDFs are not read.')] },
        { titre: 'My course is very long. Is it truncated?', blocs: [p('No. It is split into parts, summarised separately then merged; the summary says so. Only an oversized course is refused, with a message saying so.')] },
        { titre: 'Why “limit reached”?', blocs: [p('To protect the service, the number of AI analyses is limited per minute and per day. Wait for the indicated delay; meanwhile, cards, mock exams and search keep working.')] },
        { titre: 'I forgot my password.', blocs: [p(`Email reset is not available yet. Write to us at **${EMAIL_CONTACT}** from your account’s address.`)] },
        { titre: 'How do I delete my data?', blocs: [p('From [My account](/compte): download it first if you wish, then delete the account. Everything is erased immediately and permanently.')] },
        { titre: 'The site is slow to open.', blocs: [p('The free server goes to sleep after a period of inactivity and takes about thirty seconds to wake up. After that, everything is fast.')] },
      ],
    },
  },
};
