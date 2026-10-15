/**
 * Dictionnaire francais — la reference.
 *
 * ACCENTUE, contrairement aux commentaires et aux identifiants du projet.
 * La convention « sans accents » vise la console Windows de l'equipe ; elle
 * n'a aucune raison de s'appliquer a ce que lit un etudiant. L'interface
 * affichait « Aucun resume pour ce cours » et « 8 caracteres minimum »
 * pendant que les prompts, eux, avaient ete corriges en v3.
 *
 * Les cles de ce fichier definissent le type : une cle absente du
 * dictionnaire anglais est une erreur de compilation.
 */

export const FR = {
  // --- Navigation et coquille ---
  'nav.accueil': 'StudyAI, accueil',
  'nav.cours': 'Mes cours',
  'nav.recherche': 'Rechercher',
  'nav.examen': 'Examen blanc',
  'nav.consommation': 'Consommation',
  'nav.deconnexion': 'Se déconnecter',
  'nav.connexion': 'Se connecter',
  'nav.inscription': 'Créer un compte',
  'nav.langue': 'Langue de l’interface',

  'introuvable.titre': 'Page introuvable',
  'introuvable.corps':
    'Le lien que vous avez suivi ne correspond à aucune page de StudyAI.',
  'introuvable.action': 'Revenir à mes cours',

  // --- Authentification ---
  'auth.accroche': 'Vos cours, résumés, révisés et expliqués.',
  'auth.module.resume': 'Résumé',
  'auth.module.resume.corps':
    'Une synthèse fidèle au cours, avec les points clés et les notions à retenir.',
  'auth.module.quiz': 'Quiz',
  'auth.module.quiz.corps':
    'Un QCM tiré de votre cours. Chaque question cite le passage dont elle vient.',
  'auth.module.tuteur': 'Tuteur',
  'auth.module.tuteur.corps':
    'Des réponses appuyées sur votre cours — et un refus clair quand il n’y répond pas.',

  'auth.connexion.titre': 'Se connecter',
  'auth.connexion.sous': 'Retrouvez vos cours et vos révisions.',
  'auth.connexion.action': 'Se connecter',
  'auth.connexion.encours': 'Connexion…',
  'auth.connexion.versInscription': 'Pas encore de compte ?',

  'auth.inscription.titre': 'Créer un compte',
  'auth.inscription.sous': 'Importez vos cours, StudyAI vous aide à réviser.',
  'auth.inscription.action': 'Créer mon compte',
  'auth.inscription.encours': 'Création…',
  'auth.inscription.versConnexion': 'Déjà inscrit ?',

  'auth.champ.email': 'Adresse électronique',
  'auth.champ.motDePasse': 'Mot de passe',
  'auth.champ.motDePasse.indice': '8 caractères minimum',
  'auth.expiree':
    'Votre session a expiré. Reconnectez-vous : vous reviendrez là où vous étiez.',

  // --- Bibliotheque de cours ---
  'cours.titre': 'Mes cours',
  'cours.sous':
    'Importez un support de cours : StudyAI le résume, vous interroge et répond à vos questions.',
  'cours.ajouter': 'Ajouter un cours',
  'cours.annuler': 'Annuler',
  'cours.vide.titre': 'Aucun cours pour le moment',
  'cours.vide.corps':
    'Collez le texte d’un chapitre, ou importez un PDF, un .docx, un .pptx, un .txt ou un .md. Il faut au moins {min} caractères pour que l’analyse ait un sens.',
  'cours.vide.action': 'Ajouter mon premier cours',
  'cours.caracteres': '{n} caractères',
  'cours.ajouteLe': 'Ajouté le {date}',
  'cours.pasAnalyse': 'Pas encore analysé',
  'cours.resumes': '{n} résumé',
  'cours.resumes.pluriel': '{n} résumés',
  'cours.quiz': '{n} quiz',
  'cours.messages': '{n} message',
  'cours.messages.pluriel': '{n} messages',
  'cours.supprimer': 'Supprimer {titre}',
  'cours.supprimer.confirmation':
    'Supprimer « {titre} » ? Les résumés, quiz et échanges seront perdus.',

  // --- Formulaire d'ajout ---
  'forme.collerTexte': 'Coller le texte',
  'forme.importerFichier': 'Importer un fichier',
  'forme.titre': 'Titre du cours',
  'forme.titre.exemple': 'Chapitre 3 — Ordonnancement',
  'forme.matiere': 'Matière (facultatif)',
  'forme.matiere.exemple': 'Systèmes d’exploitation',
  'forme.contenu': 'Contenu du cours',
  'forme.contenu.exemple': 'Collez ici le texte de votre chapitre…',
  'forme.contenu.compte': '{n} caractères',
  'forme.contenu.troPeu': '{n} caractères — il en faut au moins {min}',
  'forme.fichier': 'Fichier du cours',
  'forme.fichier.formats':
    'PDF, Word (.docx), PowerPoint (.pptx), texte (.txt) ou Markdown (.md) — 25 Mo maximum',
  'forme.fichier.avertissement':
    'Le fichier doit contenir du texte, pas des images de texte : un cours photographié ou scanné n’est pas lisible, il faut alors le coller à la main. Les anciens formats .doc et .ppt ne sont pas lisibles non plus : réenregistrez-les en .docx ou .pptx.',
  'forme.fichier.notes':
    'Sur un diaporama, les notes de l’orateur sont lues elles aussi. C’est souvent là que se trouve l’explication, quand les diapositives ne portent que des puces. Les tableaux d’un document Word sont inclus de la même façon.',
  'forme.enregistrer': 'Enregistrer le cours',
  'forme.enregistrement': 'Enregistrement…',
  'forme.gratuit':
    'Aucun appel au modèle à cette étape : le cours est seulement enregistré.',

  // --- Pastille de cout, partagee ---
  'cout.paye': '1 appel',
  'cout.gratuit': 'gratuit',
  'cout.paye.infobulle': 'Cet onglet peut déclencher un appel au modèle',
  'cout.gratuit.infobulle':
    'Cet onglet ne lit que la base : aucun appel au modèle',

  // --- Chargements ---
  'chargement.resume': 'Lecture du cours, puis rédaction de la synthèse…',
  'chargement.quiz': 'Sélection des passages, puis rédaction des questions…',
  'chargement.tuteur': 'Recherche des passages pertinents, puis réponse…',
} as const;
