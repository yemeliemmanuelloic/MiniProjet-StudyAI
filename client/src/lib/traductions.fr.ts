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
  // --- Fiche de cours ---
  'onglet.resume': 'Résumé',
  'onglet.quiz': 'Quiz',
  'onglet.tuteur': 'Tuteur',
  'onglet.progression': 'Progression',
  'detail.retour': 'Retour à mes cours',
  'detail.sansMatiere': 'Sans matière',
  'detail.caracteres': '{n} caractères analysés',
  'detail.source': 'Texte du cours tel qu’il est enregistré',
  'detail.source.note':
    'C’est ce texte qui part au modèle, après anonymisation. L’onglet Résumé permet de vérifier ce qui a réellement été transmis.',

  // --- Module 1 : resume ---
  'resume.niveau': 'Niveau de détail',
  'resume.court': 'Court',
  'resume.standard': 'Standard',
  'resume.detaille': 'Détaillé',
  'resume.action': 'Résumer mon cours',
  'resume.regenerer': 'Régénérer',
  'resume.encours': 'Rédaction en cours…',
  'resume.anonymisation':
    'Vos données personnelles sont masquées avant tout envoi au modèle.',
  'resume.vide': 'Aucun résumé pour ce cours',
  'resume.synthese': 'Synthèse',
  'resume.pointsCles': 'Points clés',
  'resume.notions': 'Notions à retenir',
  'resume.avertissements': 'Points d’attention sur le cours',

  // --- Module 2 : quiz ---
  'quiz.nombre': 'Questions',
  'quiz.difficulte': 'Difficulté',
  'quiz.facile': 'Facile',
  'quiz.standard': 'Standard',
  'quiz.difficile': 'Difficile',
  'quiz.action': 'Générer un quiz',
  'quiz.nouveau': 'Nouveau quiz',
  'quiz.encours': 'Rédaction du quiz…',
  'quiz.vide': 'Aucun quiz pour ce cours',
  'quiz.resultat': 'Résultat',
  'quiz.bonne': 'Bonne réponse',
  'quiz.incorrecte': 'Réponse incorrecte',
  'quiz.explication': 'Explication',
  'quiz.question': 'Question {n}',

  // --- Module 3 : tuteur ---
  'chat.horsCours': 'Hors du cours',
  'chat.question': 'Votre question',
  'chat.exemple': 'Posez une question sur ce cours…',
  'chat.envoyer': 'Envoyer',
  'chat.encours': 'Réflexion…',

  // --- Espace revision ---
  'progression.titre': 'Progression',
  'progression.fiche': 'Télécharger ma fiche de révision',
  'progression.fichePreparation': 'Préparation…',
  'progression.evolution': 'Évolution',
  'progression.aRevoir': 'À revoir en priorité',
  'progression.rienARevoir': 'Rien à revoir en priorité',
  'progression.vide': 'Aucune tentative pour ce cours',
  'progression.tentatives': 'tentatives',
  'progression.meilleur': 'meilleur score',
  'progression.derniere': 'dernière tentative',
  'progression.ratees': 'questions ratées au moins deux fois',
  'progression.echecs': '{n} échecs',
  'progression.extrait': 'Extrait du cours : « {texte} »',
  'progression.rienARevoir.corps':
    'Aucune question n’a été ratée deux fois ou plus. Relancez un quiz pour vérifier que cela tient dans le temps.',
  'progression.vide.corps':
    'Répondez à un quiz : vos tentatives, votre progression et les questions ratées apparaîtront ici.',
  'progression.historique': 'Historique des {n} tentative',
  'progression.historique.pluriel': 'Historique des {n} tentatives',
  'resume.vide.corps':
    'StudyAI va lire votre cours et en rédiger une synthèse, avec les points clés et les notions à retenir.',
  'quiz.vide.corps':
    'StudyAI génère des questions à choix multiples tirées de votre cours, avec l’explication de chaque réponse.',
  'chat.intro':
    'Le tuteur répond uniquement à partir de votre cours. S’il n’y trouve pas la réponse, il vous le dit au lieu d’inventer.',
  'chat.vide':
    'Posez votre première question. Le tuteur citera les passages du cours sur lesquels il s’appuie.',
  // --- Recherche transversale ---
  'recherche.titre': 'Chercher dans mes cours',
  'recherche.sous':
    'Une seule recherche sur toute votre bibliothèque, pour retrouver dans quel chapitre une notion a été vue. La recherche n’appelle pas le modèle : elle est instantanée, gratuite, et fonctionne même hors ligne côté serveur.',
  'recherche.champ': 'Que cherchez-vous ?',
  'recherche.exemple': 'exécution symbolique, préemption, Gherkin…',
  'recherche.action': 'Chercher',
  'recherche.encours': 'Recherche…',
  'recherche.aucun': 'Aucun passage',
  'recherche.compte': '{n} passage',
  'recherche.compte.pluriel': '{n} passages',
  'recherche.gratuit': 'Recherche lexicale, aucun appel au modèle',
  'recherche.rien':
    'Aucun de vos cours n’emploie ces mots. La recherche est lexicale : elle compare les mots, pas le sens. Essayez avec les termes employés dans le cours — « préemption » plutôt que « priorité des tâches ».',
  'recherche.passage': 'passage {n} / {total}',
  'recherche.videTitre': 'Cherchez une notion',
  'recherche.videCorps':
    'Tapez un mot du cours. StudyAI parcourt tous vos supports et vous dit dans lequel, et à quel endroit, il apparaît.',
  'recherche.sansCoursTitre': 'Aucun cours à fouiller',
  'recherche.sansCoursCorps':
    'La recherche parcourt vos supports. Importez-en au moins un, et vous pourrez retrouver une notion sans vous souvenir du chapitre.',
  'recherche.importer': 'Importer un cours',
  'tuteur.titre': 'Demander au tuteur',
  'tuteur.action': 'Demander au tuteur',
  'tuteur.encours': 'Le tuteur réfléchit…',
  'tuteur.sansPassage':
    'Aucun passage à lire : le tuteur répondrait sans rien consulter. Reformulez avec les mots du cours.',
  'tuteur.ancree': 'Ancrée dans vos cours',
  'tuteur.nonCouverte': 'Non couverte',
  'tuteur.sansAppel': 'Répondu sans appel au modèle',
  'tuteur.sources': 'Sources citées',
  'tuteur.coursConsultes': 'Cours consultés :',
  'tuteur.masque': 'Données personnelles masquées avant l’envoi : {types}',
  // --- Examen blanc ---
  'examen.titre': 'Examen blanc',
  'examen.sous':
    'Des questions tirées de plusieurs cours à la fois, chronométrées, comme le jour J. Les questions viennent des quiz déjà générés : composer un examen ne consomme aucun appel au modèle.',
  'examen.sansCoursTitre': 'Aucun cours à réviser',
  'examen.sansCoursCorps':
    'Un examen blanc puise dans les quiz de vos cours. Importez-en au moins un, puis générez un quiz dessus.',
  'examen.quelsCours': 'Quels cours ?',
  'examen.quiz': '{n} quiz',
  'examen.aucunQuiz': 'aucun quiz',
  'examen.nbQuestions': 'Questions',
  'examen.duree': 'Durée',
  'examen.duree.defaut': '1 min par question',
  'examen.duree.minutes': '{n} minutes',
  'examen.composer': 'Composer l’examen',
  'examen.composition': 'Composition…',
  'examen.choisir': 'Choisissez au moins un cours.',
  'examen.resume': '{questions} questions sur {cours} cours',
  'examen.sansQuizUn': 'Un cours choisi n’a aucun quiz généré : {liste}. Sans quiz, il ne peut fournir aucune question.',
  'examen.sansQuizPlusieurs':
    '{n} cours choisis n’ont aucun quiz généré : {liste}. Sans quiz, ils ne peuvent fournir aucune question.',
  'examen.completer': 'Générer les questions manquantes',
  'examen.completer.cout': 'consomme un appel au modèle par cours',
  'examen.tempsRestant': 'Temps restant',
  'examen.repondu': 'Répondu',
  'examen.desequilibre': 'L’équilibre entre cours n’a pas pu être tenu.',
  'examen.desequilibre.ligne':
    '{cours} : {obtenu} question(s) au lieu de {attendu}. {raison}',
  'examen.rendre': 'Rendre la copie',
  'examen.remise': 'Remise…',
  'examen.sansReponse': '{n} question sans réponse — vous pouvez rendre quand même.',
  'examen.sansReponse.pluriel': '{n} questions sans réponse — vous pouvez rendre quand même.',
  'examen.toutRepondu': 'Toutes les questions ont une réponse.',
  'examen.horsDelai': 'Copie rendue hors délai — corrigée quand même',
  'examen.bilan': '{cours} cours · {minutes} minutes accordées',
  'examen.parOuReprendre': 'Par où reprendre',
  'examen.parOuReprendre.note':
    'Du cours le moins bien réussi au mieux réussi. C’est l’ordre de révision.',
  'examen.corrige': 'Corrigé',
  'examen.juste': 'Juste',
  'examen.faux': 'Faux',
  'examen.bonneReponse': 'bonne réponse',
  'examen.votreReponse': 'votre réponse',
  'examen.pasRepondu': 'Vous n’avez pas répondu à cette question.',
  'examen.recommencer': 'Composer un autre examen',
  'examen.passes': 'Examens passés',
  'examen.nonRendu': 'Non rendu',
  'examen.lit': 'Le tuteur lit {passages}, tous cours confondus, et répond en citant le cours dont vient chaque source.',
  'examen.unAppel': 'Un seul appel au modèle, quel que soit le nombre de cours.',
  'tuteur.unPassage': 'l’unique passage trouvé',
  'tuteur.nPassages': 'les {n} passages les plus proches',
  // --- Tableau de consommation ---
  'conso.titre': 'Ce que l’IA a coûté',
  'conso.sous':
    'Jetons consommés, appels effectués, latence et coût estimé. Ces mesures sont enregistrées à chaque opération depuis le premier jour. Consulter cette page n’appelle pas le modèle.',
  'conso.videTitre': 'Rien à mesurer pour l’instant',
  'conso.videCorps':
    'Générez un résumé ou un quiz, et cette page vous dira exactement ce qu’il a coûté.',
  'conso.operations': 'opérations',
  'conso.appels': 'appels au modèle',
  'conso.jetonsEntree': 'jetons en entrée',
  'conso.jetonsSortie': 'jetons en sortie',
  'conso.cout': 'coût estimé',
  'conso.tarif':
    'Coût estimé au tarif de {entree} {devise} par million de jetons en entrée et {sortie} {devise} en sortie. Source : {source}. La page officielle du fournisseur fait foi — ce chiffre est un ordre de grandeur, pas une facture.',
  'conso.sansDecompte':
    '{n} opération(s) ne porte(nt) pas de décompte d’appels : elle(s) est/sont antérieure(s) à l’enregistrement de cette donnée. Les jetons, eux, sont comptés. Mieux vaut un trou signalé qu’un total faux.',
  'conso.parModule': 'Par module',
  'conso.col.module': 'Module',
  'conso.col.operations': 'Opérations',
  'conso.col.appels': 'Appels',
  'conso.col.entree': 'Jetons entrée',
  'conso.col.sortie': 'Jetons sortie',
  'conso.col.latence': 'Latence moy.',
  'conso.col.cout': 'Coût',
  'conso.nonMesurees': '({n} non mesurée(s))',
  'conso.noteOperation':
    'Une opération n’est pas un appel. Un cours long est résumé segment par segment, puis agrégé : une seule opération, plusieurs appels.',
  'conso.parCours': 'Par cours',
  'conso.parCours.note': 'Du plus coûteux au moins coûteux.',
  'conso.parCours.ligne': '{n} opération(s) · {jetons} jetons',
  'conso.parModele': 'Par modèle',
  'conso.parModele.note':
    'La bascule entre fournisseurs se fait par une variable d’environnement, et l’historique garde la trace de qui a répondu. C’est ce tableau qui servira le jour d’une comparaison.',
  'conso.parModele.ligne': '{n} opération(s)',
  'conso.gratuitTitre': 'Ce qui n’a rien coûté',
  'conso.examens': 'examens blancs',
  'conso.questions': 'questions servies',
  'conso.appelSupp': 'appel supplémentaire',
  'conso.gratuitCorps':
    'Les examens blancs puisent dans les quiz déjà générés : ces questions n’ont coûté aucun appel supplémentaire. La recherche dans les cours n’en coûte aucun non plus, et n’est pas comptée ici faute d’être enregistrée.',
  'erreur.titre': 'Quelque chose s’est cassé',
  'erreur.corps':
    'L’affichage a rencontré une erreur inattendue. Vos cours et vos résumés sont intacts : rien n’a été perdu.',
  'quiz.coursLong':
    'Cours long : les questions ont été tirées de parties échelonnées sur l’ensemble du cours, et non de son seul début.',
  'quiz.bilan':
    '{score} bonne(s) réponse(s) sur {total}. Les explications ci-dessous citent le passage du cours dont chaque question est tirée.',
  'resume.coursLong':
    'Cours long : il a été découpé en {n} parties, résumées séparément puis fusionnées. Aucune partie n’a été ignorée.',
  'resume.aucuneDonnee': 'Aucune donnée personnelle détectée dans ce cours.',
  'onglet.cartes': 'Cartes',
  'cartes.videTitre': 'Aucune carte pour ce cours',
  'cartes.videCorps':
    'Les cartes se dérivent des questions de quiz déjà en base : l’énoncé au recto, la bonne réponse et son explication au verso. Les fabriquer ne coûte aucun appel au modèle.',
  'cartes.fabriquer': 'Fabriquer les cartes',
  'cartes.fabrication': 'Fabrication…',
  'cartes.fabriquees':
    '{n} carte(s) ajoutée(s), {ignorees} déjà connue(s) ou écartée(s). Appels au modèle : {appels}.',
  'cartes.total': 'cartes',
  'cartes.dues': 'à revoir',
  'cartes.neuves': 'jamais vues',
  'cartes.acquises': 'acquises',
  'cartes.finiTitre': 'Session terminée',
  'cartes.finiCorps':
    '{n} carte(s) revue(s). Chacune revient à sa propre échéance : plus vous la savez, plus elle s’éloigne.',
  'cartes.rienDuJour':
    'Rien à revoir aujourd’hui. Revenez demain : repasser une carte trop tôt n’apprend rien de plus.',
  'cartes.recharger': 'Recharger la liste',
  'cartes.position': 'Carte {i} sur {n}',
  'cartes.neuve': 'jamais vue',
  'cartes.revue': 'revue {n} fois',
  'cartes.retourner': 'Afficher la réponse',
  'cartes.aide':
    'Au clavier : Espace retourne la carte, les touches 1 à 4 la notent.',
  'cartes.note.oublie': 'Oubliée',
  'cartes.note.difficile': 'Difficile',
  'cartes.note.correct': 'Correct',
  'cartes.note.facile': 'Facile',
  'cartes.revientDans': 'Carte précédente : revient dans {n} jour(s).',
  'cartes.revientAujourdhui': 'Carte précédente : revient aujourd’hui.',
  'cartes.completer': 'Compléter depuis les quiz',
  'cartes.completer.note':
    'Reprend les quiz du cours sans toucher à l’avancement des cartes existantes. Zéro appel.',
  'examen.format': 'Format de l’épreuve',
  'quiz.extrait': 'Extrait du cours : « {texte} »',
  'quiz.valider': 'Valider mes réponses',
  'quiz.sansReponse': '{n} question(s) sans réponse',
  'chat.extraits': '{n} extrait(s) du cours',
  'resume.envoye': 'Ce qui a été envoyé au modèle',
  'progression.moyenne': 'Score moyen',
} as const;
