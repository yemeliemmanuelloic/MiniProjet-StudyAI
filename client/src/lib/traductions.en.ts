import type { FR } from './traductions.fr';

/**
 * English dictionary.
 *
 * Typed against the French one: a missing key is a compile error, not a
 * blank label discovered by a user. A test also checks both sides have
 * exactly the same keys, which catches a key removed on one side only.
 *
 * Model output stays in French — see the note in i18n.tsx. The tutor is the
 * exception, and it needs nothing: its prompt already says to answer in the
 * language of the question.
 */

export const EN: Record<keyof typeof FR, string> = {
  // --- Navigation and shell ---
  'nav.accueil': 'StudyAI, home',
  'nav.cours': 'My courses',
  'nav.recherche': 'Search',
  'nav.examen': 'Mock exam',
  'nav.consommation': 'Usage',
  'nav.deconnexion': 'Sign out',
  'nav.connexion': 'Sign in',
  'nav.inscription': 'Create an account',
  'nav.langue': 'Interface language',

  'introuvable.titre': 'Page not found',
  'introuvable.corps': 'That link does not match any page in StudyAI.',
  'introuvable.action': 'Back to my courses',

  // --- Authentication ---
  'auth.accroche': 'Your courses, summarised, revised and explained.',
  'auth.module.resume': 'Summary',
  'auth.module.resume.corps':
    'A faithful synthesis of the course, with key points and terms to remember.',
  'auth.module.quiz': 'Quiz',
  'auth.module.quiz.corps':
    'Multiple-choice questions drawn from your course. Each one quotes the passage it comes from.',
  'auth.module.tuteur': 'Tutor',
  'auth.module.tuteur.corps':
    'Answers grounded in your course — and a clear refusal when it does not cover the question.',

  'auth.connexion.titre': 'Sign in',
  'auth.connexion.sous': 'Pick up your courses and revision where you left off.',
  'auth.connexion.action': 'Sign in',
  'auth.connexion.encours': 'Signing in…',
  'auth.connexion.versInscription': 'No account yet?',

  'auth.inscription.titre': 'Create an account',
  'auth.inscription.sous': 'Import your courses and let StudyAI help you revise.',
  'auth.inscription.action': 'Create my account',
  'auth.inscription.encours': 'Creating…',
  'auth.inscription.versConnexion': 'Already registered?',

  'auth.champ.email': 'Email address',
  'auth.champ.motDePasse': 'Password',
  'auth.champ.motDePasse.indice': '8 characters minimum',
  'auth.expiree':
    'Your session has expired. Sign in again and you will return where you were.',

  // --- Course library ---
  'cours.titre': 'My courses',
  'cours.sous':
    'Import course material: StudyAI summarises it, quizzes you on it and answers your questions.',
  'cours.ajouter': 'Add a course',
  'cours.annuler': 'Cancel',
  'cours.vide.titre': 'No courses yet',
  'cours.vide.corps':
    'Paste the text of a chapter, or import a PDF, .docx, .pptx, .txt or .md file. At least {min} characters are needed for the analysis to mean anything.',
  'cours.vide.action': 'Add my first course',
  'cours.caracteres': '{n} characters',
  'cours.ajouteLe': 'Added {date}',
  'cours.pasAnalyse': 'Not analysed yet',
  'cours.resumes': '{n} summary',
  'cours.resumes.pluriel': '{n} summaries',
  'cours.quiz': '{n} quiz',
  'cours.messages': '{n} message',
  'cours.messages.pluriel': '{n} messages',
  'cours.supprimer': 'Delete {titre}',
  'cours.supprimer.confirmation':
    'Delete “{titre}”? Its summaries, quizzes and conversations will be lost.',

  // --- Add form ---
  'forme.collerTexte': 'Paste text',
  'forme.importerFichier': 'Import a file',
  'forme.titre': 'Course title',
  'forme.titre.exemple': 'Chapter 3 — Scheduling',
  'forme.matiere': 'Subject (optional)',
  'forme.matiere.exemple': 'Operating systems',
  'forme.contenu': 'Course content',
  'forme.contenu.exemple': 'Paste the text of your chapter here…',
  'forme.contenu.compte': '{n} characters',
  'forme.contenu.troPeu': '{n} characters — at least {min} are needed',
  'forme.fichier': 'Course file',
  'forme.fichier.formats':
    'PDF, Word (.docx), PowerPoint (.pptx), plain text (.txt) or Markdown (.md) — 25 MB maximum',
  'forme.fichier.avertissement':
    'The file must contain text, not pictures of text: a photographed or scanned course cannot be read, and has to be pasted by hand. The older .doc and .ppt formats cannot be read either: save them as .docx or .pptx.',
  'forme.fichier.notes':
    'In a slide deck, speaker notes are read too. That is often where the explanation lives, when the slides carry only bullet points. Tables in a Word document are included the same way.',
  'forme.enregistrer': 'Save the course',
  'forme.enregistrement': 'Saving…',
  'forme.gratuit':
    'No model call at this stage: the course is only stored.',

  // --- Cost badge, shared ---
  'cout.paye': '1 call',
  'cout.gratuit': 'free',
  'cout.paye.infobulle': 'This tab may trigger a model call',
  'cout.gratuit.infobulle': 'This tab only reads the database: no model call',

  // --- Loading ---
  'chargement.resume': 'Reading the course, then writing the synthesis…',
  'chargement.quiz': 'Selecting passages, then writing the questions…',
  'chargement.tuteur': 'Looking for relevant passages, then answering…',
};
