"""
Formes des requetes et des reponses de l'API.

Les noms sont en minuscules cote Python et en camelCase cote JSON : la
conversion est automatique (`alias_generator=to_camel`). Le front n'a donc
aucune traduction a faire, et ces modeles alimentent la documentation OpenAPI
publiee sur /docs — qui sert de piece au rapport technique.
"""

from __future__ import annotations

from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, EmailStr, Field
from pydantic.alias_generators import to_camel


class ModeleApi(BaseModel):
    model_config = ConfigDict(
        alias_generator=to_camel,
        populate_by_name=True,
        from_attributes=True,
    )


# --- Entrees ------------------------------------------------------------------


class IdentifiantsEntree(ModeleApi):
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)


class CoursEntree(ModeleApi):
    title: str = Field(min_length=3, max_length=300)
    subject: str | None = Field(default=None, max_length=200)
    content: str = Field(
        min_length=200,
        description="Un cours doit faire au moins 200 caracteres pour etre analysable.",
    )


class ResumeEntree(ModeleApi):
    level: Literal["court", "standard", "detaille"] = "standard"


class QuizEntree(ModeleApi):
    question_count: int = Field(default=5, ge=3, le=20)
    difficulty: Literal["facile", "standard", "difficile"] = "standard"


class CorrectionEntree(ModeleApi):
    # -1 signale une question laissee sans reponse. Le front empeche de
    # soumettre un quiz incomplet, mais l'API ne doit pas refuser une entree
    # qu'elle sait interpreter : elle la compte comme fausse.
    answers: list[int] = Field(min_length=1)

    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)


class ChatEntree(ModeleApi):
    question: str = Field(min_length=3, max_length=1000)
    #: Conversation a poursuivre. Absente : la question en ouvre une nouvelle.
    conversation_id: str | None = Field(default=None, max_length=36)


# --- Sorties ------------------------------------------------------------------


class UtilisateurSortie(ModeleApi):
    id: str
    email: str
    created_at: datetime | None = None
    #: La connexion PRECEDENTE, pas celle en cours : c'est elle qui permet de
    #: reperer une connexion que l'etudiant n'a pas faite.
    connexion_precedente: datetime | None = Field(default=None, serialization_alias="previousLoginAt")


class MotDePasseEntree(ModeleApi):
    current_password: str = Field(min_length=1, max_length=128)
    new_password: str = Field(min_length=8, max_length=128)


class SuppressionCompteEntree(ModeleApi):
    password: str = Field(min_length=1, max_length=128)


class SessionSortie(ModeleApi):
    user: UtilisateurSortie
    token: str


class ComptesSortie(ModeleApi):
    summaries: int
    quizzes: int
    messages: int


class CoursResumeSortie(ModeleApi):
    id: str
    title: str
    subject: str | None
    char_count: int
    created_at: datetime
    # Nom impose par le front, herite du `_count` de Prisma.
    compte: ComptesSortie = Field(serialization_alias="_count")


class CoursSortie(ModeleApi):
    id: str
    title: str
    subject: str | None
    content: str
    char_count: int
    created_at: datetime


class ResumeSortie(ModeleApi):
    id: str
    level: str
    payload: dict[str, Any]
    model: str
    prompt_version: str
    latency_ms: int | None
    segment_count: int
    created_at: datetime


class QuestionPoseeSortie(ModeleApi):
    """Ce que le navigateur recoit : PAS de bonne reponse, PAS d'explication."""

    question: str
    options: list[str]


class QuizPoseSortie(ModeleApi):
    id: str
    question_count: int
    segment_count: int
    questions: list[QuestionPoseeSortie]


class TentativeSortie(ModeleApi):
    id: str
    score: int
    total: int
    created_at: datetime


class LigneCorrectionSortie(ModeleApi):
    question: str
    chosen: int | None
    correct_index: int
    correct: bool
    explanation: str
    source_quote: str


class CorrectionSortie(ModeleApi):
    attempt: TentativeSortie
    correction: list[LigneCorrectionSortie]


class MessageSortie(ModeleApi):
    id: str
    role: str
    content: str
    sources: list[str] | None
    grounded: bool
    latency_ms: int | None
    created_at: datetime
    conversation_id: str | None = None


class ConversationSortie(ModeleApi):
    id: str
    #: Nul : conversation sans question, ou regroupant des messages anterieurs.
    title: str | None
    created_at: datetime
    updated_at: datetime
    message_count: int = 0


class ListeConversations(ModeleApi):
    conversations: list[ConversationSortie]


class UneConversation(ModeleApi):
    conversation: ConversationSortie


class TentativeResumeSortie(ModeleApi):
    """Une ligne de l'historique des tentatives."""

    id: str
    quiz_id: str
    score: int
    total: int
    difficulty: str
    created_at: datetime


class QuestionFaibleSortie(ModeleApi):
    """Une question ratee plusieurs fois. Pas de bonne reponse ici non plus."""

    question: str
    wrong_count: int
    source_quote: str


class ProgressionSortie(ModeleApi):
    """Synthese de la progression. Scores en pourcentage, pour que des quiz de
    longueurs differentes restent comparables."""

    attempt_count: int
    average_score: int
    best_score: int
    last_score: int
    trend: list[int]
    weak_questions: list[QuestionFaibleSortie]


class ChargeUtileSortie(ModeleApi):
    """Vue de transparence : ce qui a reellement ete transmis au modele."""

    payload: str
    token_map: list[str]


# --- Examen blanc multi-cours -------------------------------------------------


class ExamenEntree(ModeleApi):
    course_ids: list[str] = Field(min_length=1, max_length=10)
    question_count: int = Field(default=20, ge=5, le=40)
    #: Duree en minutes. Absente, le serveur compte une minute par question.
    duration_min: int | None = Field(default=None, ge=1, le=240)
    #: Autorise la generation d'un quiz pour un cours qui n'en a pas.
    #: COUTE UN APPEL AU MODELE : c'est pourquoi la valeur par defaut est faux.
    completer: bool = False


class ReponsesExamenEntree(ModeleApi):
    #: `null` pour une question laissee sans reponse. Le contrat du quiz
    #: n'acceptait que des entiers ; sur un examen chronometre, laisser une
    #: question vide est le cas NORMAL, pas une anomalie.
    answers: list[int | None] = Field(max_length=40)


class CoursDeLExamenSortie(ModeleApi):
    id: str
    title: str


class AvertissementExamenSortie(ModeleApi):
    """Ce que la composition n'a pas pu faire, et pourquoi."""

    course_id: str
    course_title: str
    attendu: int
    obtenu: int
    raison: str


class ExamenPoseSortie(ModeleApi):
    """
    Ce que le navigateur recoit pendant l'epreuve.

    Meme discipline que le quiz : ni bonne reponse, ni explication, ni
    citation. La correction se fait cote serveur, a la remise.
    """

    id: str
    courses: list[CoursDeLExamenSortie]
    questions: list[QuestionPoseeSortie]
    warnings: list[AvertissementExamenSortie]
    total: int
    duration_s: int
    #: Calcule par le serveur, qui fait foi. Le decompte du navigateur n'est
    #: qu'un affichage.
    remaining_s: int
    started_at: datetime
    submitted_at: datetime | None


class ExamenResumeSortie(ModeleApi):
    """Une ligne de l'historique."""

    id: str
    courses: list[CoursDeLExamenSortie]
    total: int
    score: int | None
    duration_s: int
    late: bool
    created_at: datetime
    submitted_at: datetime | None


class LigneCorrectionExamenSortie(ModeleApi):
    question: str
    options: list[str]
    chosen: int | None
    correct_index: int
    correct: bool
    explanation: str
    source_quote: str
    #: Vers quel cours renvoyer l'etudiant. C'est tout l'interet d'un examen
    #: multi-cours : l'erreur doit pointer son support d'origine.
    course_id: str
    course_title: str


class ScoreParCoursSortie(ModeleApi):
    course_id: str
    course_title: str
    score: int
    total: int


class CorrectionExamenSortie(ModeleApi):
    exam: ExamenResumeSortie
    correction: list[LigneCorrectionExamenSortie]
    #: Trie du cours le moins bien reussi au mieux reussi : c'est l'ordre dans
    #: lequel il faut reprendre ses revisions.
    par_cours: list[ScoreParCoursSortie]


# --- Recherche et tuteur transversaux -----------------------------------------


class PassageSortie(ModeleApi):
    course_id: str
    course_title: str
    #: « passage 3 sur 5 » : le repere que l'etudiant peut retrouver chez lui.
    rang: int
    total: int
    extrait: str
    #: Score BM25. Affiche en relatif seulement : un score absolu n'a de sens
    #: que compare aux autres de la meme recherche.
    score: float


class QuestionBibliothequeEntree(ModeleApi):
    question: str = Field(min_length=3, max_length=1000)


class ReponseBibliothequeSortie(ModeleApi):
    answer: str
    grounded: bool
    #: Chaque source commence par le titre de son cours entre crochets.
    sources: list[str]
    #: Les cours dans lesquels le tuteur a effectivement cherche. Rendus meme
    #: quand la reponse n'est pas ancree : savoir OU il a cherche fait partie
    #: de la reponse.
    courses: list[CoursDeLExamenSortie]
    #: Faux quand aucun passage ne correspondait : la reponse a ete produite
    #: sans appel au modele. Affiche, pour que le cout reste lisible.
    appele_le_modele: bool
    token_types: list[str]
    latency_ms: int | None
    model: str | None


# --- Tableau de consommation --------------------------------------------------


class ConsommationModuleSortie(ModeleApi):
    module: str
    operations: int
    #: Appels CONNUS. Les operations anterieures au decompte sont comptees a
    #: part plutot qu'additionnees comme si elles valaient un appel.
    calls: int
    operations_sans_decompte: int
    tokens_in: int
    tokens_out: int
    latence_moyenne_ms: int | None
    latence_max_ms: int | None
    cout: float


class ConsommationTotalSortie(ModeleApi):
    operations: int
    calls: int
    operations_sans_decompte: int
    tokens_in: int
    tokens_out: int
    cout: float


class ConsommationCoursSortie(ModeleApi):
    course_id: str
    course_title: str
    operations: int
    tokens_in: int
    tokens_out: int
    cout: float


class ConsommationModeleSortie(ModeleApi):
    model: str
    operations: int
    tokens_in: int
    tokens_out: int
    latence_moyenne_ms: int | None
    cout: float


class GratuitSortie(ModeleApi):
    examens: int
    questions_servies: int


class TarifSortie(ModeleApi):
    entree_par_million: float
    sortie_par_million: float
    devise: str
    #: Affichee a cote du montant. Une estimation dont la source n'est pas
    #: visible se lit comme un fait.
    source: str


class ConsommationSortie(ModeleApi):
    par_module: list[ConsommationModuleSortie]
    total: ConsommationTotalSortie
    par_cours: list[ConsommationCoursSortie]
    par_modele: list[ConsommationModeleSortie]
    gratuit: GratuitSortie
    tarif: TarifSortie


# --- Cartes de revision espacee -----------------------------------------------


class RevisionEntree(ModeleApi):
    #: Les quatre boutons de `services/fsrs.py`. Le `Literal` les verrouille
    #: ici aussi : une note inconnue doit etre refusee par la validation
    #: d'entree, avec le detail des valeurs attendues, et non au fond du
    #: service.
    bouton: Literal["oublie", "difficile", "correct", "facile"]


class CarteSortie(ModeleApi):
    """
    Une carte, VERSO COMPRIS.

    Le routeur du quiz fait l'inverse et retire la bonne reponse avant
    l'envoi : un quiz est note, donc la cacher sert a quelque chose. Une carte
    est auto-evaluee — l'etudiant se juge lui-meme — et le verso doit se
    retourner sans aller-retour reseau. Il n'y a rien a proteger ici.
    """

    id: str
    recto: str
    verso: str
    explication: str
    citation: str | None
    due_le: datetime
    intervalle: int
    repetitions: int
    revisions: int
    derniere_note: int | None


class EtatJeuSortie(ModeleApi):
    #: « Dues » et « neuves » se recouvrent : une carte neuve est due. Ce sont
    #: deux lectures du meme jeu, pas une repartition dont la somme ferait le
    #: total.
    total: int
    dues: int
    neuves: int
    acquises: int


class JeuSortie(ModeleApi):
    cards: list[CarteSortie]
    etat: EtatJeuSortie


class RevisionSortie(ModeleApi):
    """
    La carte notee, ET le compte du jeu apres la note.

    Les deux voyagent ensemble pour que le navigateur n'ait pas a recompter.
    Recompter voudrait dire connaitre le seuil au-dela duquel une carte est
    « acquise », et ce nombre vivrait alors des deux cotes de la frontiere :
    le jour ou l'un bougerait, l'ecran afficherait un compte que la base
    contredit.
    """

    card: CarteSortie
    etat: EtatJeuSortie


class MaterialisationSortie(ModeleApi):
    creees: int
    ignorees: int
    #: Toujours zero, et affiche comme tel. C'est la propriete que ce module
    #: revendique ; la taire reviendrait a demander qu'on la croie sur parole.
    appels: int
    etat: EtatJeuSortie



class PresentationSortie(ModeleApi):
    """Presentation narree (decision 044) : le script ; la voix est produite par le navigateur."""

    id: str
    payload: dict[str, Any]
    model: str
    prompt_version: str
    latency_ms: int | None
    created_at: datetime


class UnePresentation(ModeleApi):
    presentation: PresentationSortie | None
