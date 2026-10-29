"""
Modele de donnees — transposition fidele de l'ancien schema Prisma.

Sept tables : l'utilisateur, le cours, et une table par module IA, plus la
table des tentatives de quiz et celle du banc d'essai (AA5).

Les colonnes de telemetrie (model, promptVersion, temperature, tokens,
latence) sont presentes sur chaque sortie de modele : sans elles, le chapitre
d'evaluation du rapport ne reposerait sur rien de mesure.
"""

from __future__ import annotations

import uuid
from datetime import date, datetime, timezone

from sqlalchemy import (
    JSON,
    Boolean,
    Date,
    DateTime,
    Float,
    ForeignKey,
    Index,
    Integer,
    LargeBinary,
    Numeric,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship

# JSONB en production, JSON generique ailleurs. Cette variante n'est pas une
# coquetterie : elle permet d'executer la suite de tests de bout en bout sur
# SQLite, sans base distante ni conteneur. Une chaine de traitement qu'on ne
# peut pas executer en test n'est verifiee par personne.
JsonPortable = JSONB().with_variant(JSON(), "sqlite")


def _identifiant() -> str:
    return str(uuid.uuid4())


def _maintenant() -> datetime:
    return datetime.now(timezone.utc)


class Base(DeclarativeBase):
    pass


class Utilisateur(Base):
    __tablename__ = "users"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_identifiant)
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True)
    password_hash: Mapped[str] = mapped_column("passwordHash", String(255))
    created_at: Mapped[datetime] = mapped_column(
        "createdAt", DateTime(timezone=True), default=_maintenant
    )
    #: Connexion en cours, et celle d'avant : c'est la precedente que la page
    #: « Mon compte » affiche (migration 0006).
    derniere_connexion: Mapped[datetime | None] = mapped_column(
        "lastLoginAt", DateTime(timezone=True), nullable=True
    )
    connexion_precedente: Mapped[datetime | None] = mapped_column(
        "previousLoginAt", DateTime(timezone=True), nullable=True
    )
    #: Inscrite dans chaque jeton ; changer de mot de passe l'incremente et
    #: invalide les jetons emis avant. Voir security.utilisateur_courant.
    #: Objectif de jours de revision par semaine (decision 050, migration 0014).
    objectif_hebdo: Mapped[int] = mapped_column(
        "weeklyGoal", Integer, default=5, server_default="5"
    )
    version_session: Mapped[int] = mapped_column(
        "sessionVersion", Integer, default=0, server_default="0"
    )

    cours: Mapped[list["Cours"]] = relationship(
        back_populates="proprietaire", cascade="all, delete-orphan"
    )
    examens: Mapped[list["Examen"]] = relationship(cascade="all, delete-orphan")
    plans: Mapped[list["PlanRevision"]] = relationship(cascade="all, delete-orphan")
    activites: Mapped[list["Activite"]] = relationship(cascade="all, delete-orphan")


class Cours(Base):
    """Un cours importe par l'etudiant : texte colle ou PDF a couche texte."""

    __tablename__ = "courses"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_identifiant)
    owner_id: Mapped[str] = mapped_column(
        "ownerId", String(36), ForeignKey("users.id", ondelete="CASCADE")
    )
    title: Mapped[str] = mapped_column(String(300))
    subject: Mapped[str | None] = mapped_column(String(200), nullable=True)
    # Contenu brut. Traverse le pipeline d'anonymisation avant tout envoi.
    content: Mapped[str] = mapped_column(Text)
    char_count: Mapped[int] = mapped_column("charCount", Integer)
    # Empreinte du contenu : un cours inchange n'est pas reanalyse.
    hash: Mapped[str] = mapped_column(String(64))
    created_at: Mapped[datetime] = mapped_column(
        "createdAt", DateTime(timezone=True), default=_maintenant
    )
    updated_at: Mapped[datetime] = mapped_column(
        "updatedAt", DateTime(timezone=True), default=_maintenant, onupdate=_maintenant
    )

    proprietaire: Mapped[Utilisateur] = relationship(back_populates="cours")
    resumes: Mapped[list["Resume"]] = relationship(
        back_populates="cours", cascade="all, delete-orphan"
    )
    quiz: Mapped[list["Quiz"]] = relationship(
        back_populates="cours", cascade="all, delete-orphan"
    )
    messages: Mapped[list["Message"]] = relationship(
        back_populates="cours", cascade="all, delete-orphan"
    )
    conversations: Mapped[list["Conversation"]] = relationship(
        back_populates="cours", cascade="all, delete-orphan"
    )
    #: La cascade est posee DEUX FOIS, ici et sur la cle etrangere. Ce n'est
    #: pas une redondance inutile : PostgreSQL l'applique en production, et la
    #: cascade ORM la rend observable en test, ou SQLite n'impose pas les cles
    #: etrangeres. Une suppression en cascade qu'aucun test ne peut exercer
    #: n'est verifiee par personne.
    presentations: Mapped[list["Presentation"]] = relationship(
        back_populates="cours", cascade="all, delete-orphan"
    )
    cartes_mentales: Mapped[list["CarteMentale"]] = relationship(
        back_populates="cours", cascade="all, delete-orphan"
    )
    questions_ouvertes: Mapped[list["QuestionsOuvertes"]] = relationship(
        back_populates="cours", cascade="all, delete-orphan"
    )
    glossaires: Mapped[list["Glossaire"]] = relationship(cascade="all, delete-orphan")
    #: Les traductions DONT CE COURS EST LE RESULTAT (decision 052). La table
    #: pointe deux fois vers les cours : il faut dire laquelle porte la cascade.
    traductions: Mapped[list["Traduction"]] = relationship(
        foreign_keys="Traduction.course_id", cascade="all, delete-orphan"
    )
    cartes: Mapped[list["Carte"]] = relationship(
        back_populates="cours", cascade="all, delete-orphan"
    )

    __table_args__ = (Index("ix_courses_owner_created", "ownerId", "createdAt"),)


class Resume(Base):
    """Module 1 — resume automatique."""

    __tablename__ = "summaries"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_identifiant)
    course_id: Mapped[str] = mapped_column(
        "courseId", String(36), ForeignKey("courses.id", ondelete="CASCADE")
    )
    # Sortie validee : { abstract, keyPoints[], keywords[], warnings[] }
    payload: Mapped[dict] = mapped_column(JsonPortable)
    level: Mapped[str] = mapped_column(String(20), default="standard")

    # --- Telemetrie ---
    model: Mapped[str] = mapped_column(String(100))
    prompt_version: Mapped[str] = mapped_column("promptVersion", String(20))
    temperature: Mapped[float] = mapped_column(Numeric(3, 2))
    tokens_in: Mapped[int | None] = mapped_column("tokensIn", Integer, nullable=True)
    tokens_out: Mapped[int | None] = mapped_column("tokensOut", Integer, nullable=True)
    latency_ms: Mapped[int | None] = mapped_column("latencyMs", Integer, nullable=True)
    #: Appels REELLEMENT effectues. Un cours long en demande plusieurs : un par
    #: segment, plus l'agregation pour le resume. Le nombre n'est PAS
    #: reconstructible depuis segmentCount — pour le quiz il depend aussi du
    #: nombre de questions demande et d'un parametre de configuration, qui peut
    #: avoir change depuis. Nul pour les lignes anterieures au 13 octobre : le
    #: tableau de consommation le dit plutot que de l'inventer.
    calls: Mapped[int | None] = mapped_column(Integer, nullable=True)
    sent_payload: Mapped[str] = mapped_column("sentPayload", Text)
    # Nombre de segments traites : 1 = cours court, n = synthese par agregation.
    segment_count: Mapped[int] = mapped_column("segmentCount", Integer, default=1)
    # Types de donnees personnelles masquees dans CE cours. Alimente la vue de
    # transparence : liste vide = aucune donnee personnelle detectee.
    token_types: Mapped[list] = mapped_column("tokenTypes", JsonPortable, default=list)

    created_at: Mapped[datetime] = mapped_column(
        "createdAt", DateTime(timezone=True), default=_maintenant
    )

    cours: Mapped[Cours] = relationship(back_populates="resumes")

    __table_args__ = (Index("ix_summaries_course_created", "courseId", "createdAt"),)


class Quiz(Base):
    """Module 2 — quiz a choix multiples genere depuis le cours."""

    __tablename__ = "quizzes"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_identifiant)
    course_id: Mapped[str] = mapped_column(
        "courseId", String(36), ForeignKey("courses.id", ondelete="CASCADE")
    )
    payload: Mapped[dict] = mapped_column(JsonPortable)
    question_count: Mapped[int] = mapped_column("questionCount", Integer)
    difficulty: Mapped[str] = mapped_column(String(20), default="standard")

    model: Mapped[str] = mapped_column(String(100))
    prompt_version: Mapped[str] = mapped_column("promptVersion", String(20))
    temperature: Mapped[float] = mapped_column(Numeric(3, 2))
    tokens_in: Mapped[int | None] = mapped_column("tokensIn", Integer, nullable=True)
    tokens_out: Mapped[int | None] = mapped_column("tokensOut", Integer, nullable=True)
    latency_ms: Mapped[int | None] = mapped_column("latencyMs", Integer, nullable=True)
    #: Appels REELLEMENT effectues. Un cours long en demande plusieurs : un par
    #: segment, plus l'agregation pour le resume. Le nombre n'est PAS
    #: reconstructible depuis segmentCount — pour le quiz il depend aussi du
    #: nombre de questions demande et d'un parametre de configuration, qui peut
    #: avoir change depuis. Nul pour les lignes anterieures au 13 octobre : le
    #: tableau de consommation le dit plutot que de l'inventer.
    calls: Mapped[int | None] = mapped_column(Integer, nullable=True)
    sent_payload: Mapped[str] = mapped_column("sentPayload", Text)
    segment_count: Mapped[int] = mapped_column("segmentCount", Integer, default=1)

    created_at: Mapped[datetime] = mapped_column(
        "createdAt", DateTime(timezone=True), default=_maintenant
    )

    cours: Mapped[Cours] = relationship(back_populates="quiz")
    tentatives: Mapped[list["Tentative"]] = relationship(
        back_populates="quiz", cascade="all, delete-orphan"
    )

    __table_args__ = (Index("ix_quizzes_course_created", "courseId", "createdAt"),)


class Presentation(Base):
    """
    Presentation narree d'un cours (decision 044, migration 0009).

    Seul le SCRIPT est enregistre (scenes, points, narration, citations) :
    la voix et l'animation sont produites dans le navigateur, gratuitement, a
    chaque lecture. Meme telemetrie que les autres sorties du modele.
    """

    __tablename__ = "presentations"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_identifiant)
    course_id: Mapped[str] = mapped_column(
        "courseId", String(36), ForeignKey("courses.id", ondelete="CASCADE")
    )
    payload: Mapped[dict] = mapped_column(JsonPortable)
    model: Mapped[str] = mapped_column(String(100))
    prompt_version: Mapped[str] = mapped_column("promptVersion", String(20))
    tokens_in: Mapped[int | None] = mapped_column("tokensIn", Integer, nullable=True)
    tokens_out: Mapped[int | None] = mapped_column("tokensOut", Integer, nullable=True)
    latency_ms: Mapped[int | None] = mapped_column("latencyMs", Integer, nullable=True)
    calls: Mapped[int | None] = mapped_column(Integer, nullable=True)
    sent_payload: Mapped[str] = mapped_column("sentPayload", Text)
    created_at: Mapped[datetime] = mapped_column(
        "createdAt", DateTime(timezone=True), default=_maintenant
    )

    cours: Mapped[Cours] = relationship(back_populates="presentations")
    voix: Mapped[list["VoixScene"]] = relationship(cascade="all, delete-orphan")

    __table_args__ = (Index("ix_presentations_course_created", "courseId", "createdAt"),)


class VoixScene(Base):
    """
    Voix naturelle d'une scene de presentation (decision 045, migration 0010).

    Produite a la premiere ecoute, puis relue sans appel. MP3 mono a 48 kbit/s :
    une presentation de six scenes pese environ 600 Ko.
    """

    __tablename__ = "presentation_voices"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_identifiant)
    presentation_id: Mapped[str] = mapped_column(
        "presentationId", String(36), ForeignKey("presentations.id", ondelete="CASCADE")
    )
    scene: Mapped[int] = mapped_column(Integer)
    audio: Mapped[bytes] = mapped_column(LargeBinary)
    model: Mapped[str] = mapped_column(String(100))
    latency_ms: Mapped[int | None] = mapped_column("latencyMs", Integer, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        "createdAt", DateTime(timezone=True), default=_maintenant
    )

    __table_args__ = (UniqueConstraint("presentationId", "scene", name="uq_presentation_voices_scene"),)


class Tentative(Base):
    """Une session de revision : les reponses de l'etudiant et son score."""

    __tablename__ = "quiz_attempts"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_identifiant)
    quiz_id: Mapped[str] = mapped_column(
        "quizId", String(36), ForeignKey("quizzes.id", ondelete="CASCADE")
    )
    answers: Mapped[list] = mapped_column(JsonPortable)
    score: Mapped[int] = mapped_column(Integer)
    total: Mapped[int] = mapped_column(Integer)
    created_at: Mapped[datetime] = mapped_column(
        "createdAt", DateTime(timezone=True), default=_maintenant
    )

    quiz: Mapped[Quiz] = relationship(back_populates="tentatives")

    __table_args__ = (Index("ix_attempts_quiz_created", "quizId", "createdAt"),)


class Conversation(Base):
    """Une conversation avec le tuteur (20 octobre).

    Avant, chaque cours n'avait qu'un fil, qui s'allongeait sans fin : les six
    derniers messages servaient de contexte, si bien qu'une vieille question
    pouvait orienter la reponse a une nouvelle, sans rapport. L'etudiant ne
    pouvait ni repartir de zero, ni retrouver un echange precis.

    Le titre est la premiere question, tronquee. Nul tant qu'aucune question
    n'est posee, et pour les messages anterieurs, regroupes par la migration
    0007 : l'interface affiche alors un libelle traduit.
    """

    __tablename__ = "chat_conversations"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_identifiant)
    course_id: Mapped[str] = mapped_column(
        "courseId", String(36), ForeignKey("courses.id", ondelete="CASCADE")
    )
    title: Mapped[str | None] = mapped_column(String(120), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        "createdAt", DateTime(timezone=True), default=_maintenant
    )
    #: Derniere activite : la liste est triee dessus, la plus recente en tete.
    updated_at: Mapped[datetime] = mapped_column(
        "updatedAt", DateTime(timezone=True), default=_maintenant
    )

    cours: Mapped[Cours] = relationship(back_populates="conversations")
    messages: Mapped[list["Message"]] = relationship(
        back_populates="conversation", cascade="all, delete-orphan"
    )

    __table_args__ = (Index("ix_conversations_course_updated", "courseId", "updatedAt"),)


class Message(Base):
    """Module 3 — chatbot ancre sur le cours."""

    __tablename__ = "chat_messages"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_identifiant)
    course_id: Mapped[str] = mapped_column(
        "courseId", String(36), ForeignKey("courses.id", ondelete="CASCADE")
    )
    role: Mapped[str] = mapped_column(String(20))  # 'user' | 'assistant'
    content: Mapped[str] = mapped_column(Text)
    # Extraits du cours sur lesquels la reponse s'appuie. Vide => hors cours.
    sources: Mapped[list | None] = mapped_column(JsonPortable, nullable=True)
    # Faux quand le modele declare que le cours ne permet pas de repondre.
    grounded: Mapped[bool] = mapped_column(Boolean, default=True)

    model: Mapped[str | None] = mapped_column(String(100), nullable=True)
    prompt_version: Mapped[str | None] = mapped_column(
        "promptVersion", String(20), nullable=True
    )
    tokens_in: Mapped[int | None] = mapped_column("tokensIn", Integer, nullable=True)
    tokens_out: Mapped[int | None] = mapped_column("tokensOut", Integer, nullable=True)
    latency_ms: Mapped[int | None] = mapped_column("latencyMs", Integer, nullable=True)
    #: Appels REELLEMENT effectues. Un cours long en demande plusieurs : un par
    #: segment, plus l'agregation pour le resume. Le nombre n'est PAS
    #: reconstructible depuis segmentCount — pour le quiz il depend aussi du
    #: nombre de questions demande et d'un parametre de configuration, qui peut
    #: avoir change depuis. Nul pour les lignes anterieures au 13 octobre : le
    #: tableau de consommation le dit plutot que de l'inventer.
    calls: Mapped[int | None] = mapped_column(Integer, nullable=True)

    created_at: Mapped[datetime] = mapped_column(
        "createdAt", DateTime(timezone=True), default=_maintenant
    )

    #: Nullable : une ligne ecrite par une version anterieure du code n'en a
    #: pas. Elle est rattachee a une « conversation precedente » a la
    #: premiere lecture (services/study.py, _rattacher_orphelins).
    conversation_id: Mapped[str | None] = mapped_column(
        "conversationId",
        String(36),
        ForeignKey("chat_conversations.id", ondelete="CASCADE"),
        nullable=True,
    )

    cours: Mapped[Cours] = relationship(back_populates="messages")
    conversation: Mapped["Conversation | None"] = relationship(back_populates="messages")

    __table_args__ = (
        Index("ix_messages_course_created", "courseId", "createdAt"),
        Index("ix_messages_conversation_created", "conversationId", "createdAt"),
    )


class Examen(Base):
    """
    Un examen blanc : des questions tirees de PLUSIEURS cours, chronometre.

    POURQUOI UNE TABLE A PART, et pas une simple Tentative multi-quiz. Un
    examen blanc n'appartient a aucun cours : c'est l'etudiant qui en est
    proprietaire, pas un support. Le rattacher a un cours aurait oblige a en
    choisir un arbitrairement, et la suppression de ce cours aurait emporte
    l'examen portant sur les trois autres.

    POURQUOI LES QUESTIONS SONT FIGEES ICI, et non referencees par (quiz, rang).
    C'est une duplication assumee. Un quiz peut etre regenere ou supprime ;
    l'examen passe la semaine derniere doit rester corrigible et relisible tel
    qu'il a ete passe. Un examen dont la correction change apres coup ne vaut
    rien comme trace de revision. La normalisation cede ici devant la
    reproductibilite.

    Chaque question figee porte son cours d'origine (`courseId`, `courseTitle`),
    pour que la correction renvoie l'etudiant au bon support.
    """

    __tablename__ = "exams"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_identifiant)
    owner_id: Mapped[str] = mapped_column(
        "ownerId", String(36), ForeignKey("users.id", ondelete="CASCADE")
    )
    #: Titres des cours au moment de la composition. Conserves pour que
    #: l'historique reste lisible apres la suppression d'un cours.
    courses: Mapped[list] = mapped_column(JsonPortable)
    #: Les questions tirees, avec leur reponse. NE DESCEND JAMAIS en entier
    #: vers le navigateur : voir schemas/api.py.
    questions: Mapped[list] = mapped_column(JsonPortable)
    #: Ce que la composition n'a pas pu faire, et pourquoi.
    warnings: Mapped[list] = mapped_column(JsonPortable, default=list)

    duration_s: Mapped[int] = mapped_column("durationS", Integer)
    started_at: Mapped[datetime] = mapped_column(
        "startedAt", DateTime(timezone=True), default=_maintenant
    )
    submitted_at: Mapped[datetime | None] = mapped_column(
        "submittedAt", DateTime(timezone=True), nullable=True
    )
    answers: Mapped[list | None] = mapped_column(JsonPortable, nullable=True)
    score: Mapped[int | None] = mapped_column(Integer, nullable=True)
    total: Mapped[int] = mapped_column(Integer)
    #: Vrai si la copie est arrivee apres la fin du temps imparti. L'examen est
    #: corrige quand meme : voir services/examen.py.
    late: Mapped[bool] = mapped_column(Boolean, default=False)

    created_at: Mapped[datetime] = mapped_column(
        "createdAt", DateTime(timezone=True), default=_maintenant
    )

    __table_args__ = (Index("ix_exams_owner_created", "ownerId", "createdAt"),)


class Carte(Base):
    """
    Une carte de revision espacee, derivee d'une question de quiz.

    ZERO APPEL AU MODELE. Le recto est la question, le verso son explication
    et la citation du cours — trois champs que le quiz produit deja. Fabriquer
    un jeu de cartes ne coute donc rien, comme l'examen blanc.

    LE CONTENU EST FIGE, pour la meme raison que dans `exams` : un quiz peut
    etre regenere ou supprime, et une carte revisee pendant trois semaines ne
    doit pas disparaitre avec lui.

    MAIS LA CARTE PEND DU COURS, contrairement a l'examen. Ce n'est pas une
    incoherence : un examen blanc porte sur plusieurs cours et survit donc a
    la suppression de l'un d'eux, tandis qu'une carte appartient a un seul
    cours. Supprimer le cours doit emporter ses cartes.

    `cle` est l'enonce normalise — accents, ponctuation et casse retires. Elle
    porte la contrainte d'unicite avec le cours : regenerer un quiz ne doit
    pas creer un doublon de chaque carte deja en cours de revision.
    """

    __tablename__ = "flashcards"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_identifiant)
    course_id: Mapped[str] = mapped_column(
        "courseId", String(36), ForeignKey("courses.id", ondelete="CASCADE")
    )
    cle: Mapped[str] = mapped_column(String(300))

    #: Quatre champs plutot qu'un recto et un verso composes ici. Fabriquer
    #: « Bonne reponse : X. Pourquoi : Y » cote serveur remettrait de la prose
    #: d'interface dans une reponse d'API — le defaut corrige en DECISIONS 016
    #: sur le tableau de consommation. L'interface compose, et peut montrer
    #: l'explication apres la reponse plutot qu'avec elle.
    recto: Mapped[str] = mapped_column(Text)
    verso: Mapped[str] = mapped_column(Text)
    explication: Mapped[str] = mapped_column(Text)
    citation: Mapped[str | None] = mapped_column(Text, nullable=True)

    #: Heritage de SM-2 (jusqu'au 22 octobre). `intervalle` et `repetitions`
    #: restent tenus a jour : ils portent les compteurs « neuves » et
    #: « acquises ». `facilite` n'est plus modifie.
    facilite: Mapped[float] = mapped_column(Numeric(4, 2), default=2.5)
    intervalle: Mapped[int] = mapped_column(Integer, default=0)
    repetitions: Mapped[int] = mapped_column(Integer, default=0)

    #: Memoire FSRS (decision 040, migration 0008). Nulles tant que la carte
    #: n'a jamais ete revue. Voir services/fsrs.py.
    stabilite: Mapped[float | None] = mapped_column(Float, nullable=True)
    difficulte: Mapped[float | None] = mapped_column(Float, nullable=True)
    derniere_revision: Mapped[datetime | None] = mapped_column(
        "derniereRevision", DateTime(timezone=True), nullable=True
    )

    #: Date — et non horodatage. Une carte est due « aujourd'hui », pas a
    #: 14 h 32 : comparer des instants ferait dependre le resultat de l'heure
    #: a laquelle l'etudiant a revise la veille.
    due_le: Mapped[datetime] = mapped_column(
        "dueLe", DateTime(timezone=True), default=_maintenant
    )
    revisions: Mapped[int] = mapped_column(Integer, default=0)
    derniere_note: Mapped[int | None] = mapped_column(
        "derniereNote", Integer, nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        "createdAt", DateTime(timezone=True), default=_maintenant
    )

    cours: Mapped[Cours] = relationship(back_populates="cartes")

    __table_args__ = (
        UniqueConstraint("courseId", "cle", name="uq_flashcards_course_cle"),
        Index("ix_flashcards_course_due", "courseId", "dueLe"),
    )


class EssaiBanc(Base):
    """Support du chapitre d'evaluation (AA5)."""

    __tablename__ = "benchmark_runs"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_identifiant)
    task: Mapped[str] = mapped_column(String(40))  # summarize | quiz | chat
    corpus_version: Mapped[str] = mapped_column("corpusVersion", String(40))
    prompt_version: Mapped[str] = mapped_column("promptVersion", String(20))
    model: Mapped[str] = mapped_column(String(100))
    metrics: Mapped[dict] = mapped_column(JsonPortable)
    created_at: Mapped[datetime] = mapped_column(
        "createdAt", DateTime(timezone=True), default=_maintenant
    )


class PlanRevision(Base):
    """
    Plan de revision jusqu'a un examen (decision 046, migration 0011).

    Seuls les CHOIX de l'etudiant sont enregistres (date, cours, temps par
    jour) et les seances qu'il a cochees : le calendrier lui-meme est
    recalcule a chaque lecture, a partir des scores et des cartes du moment.
    Les cours sont references par identifiant, sans cle etrangere : un cours
    supprime sort simplement du plan.
    """

    __tablename__ = "revision_plans"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_identifiant)
    owner_id: Mapped[str] = mapped_column(
        "ownerId", String(36), ForeignKey("users.id", ondelete="CASCADE")
    )
    title: Mapped[str] = mapped_column(String(120))
    exam_date: Mapped[date] = mapped_column("examDate", Date)
    course_ids: Mapped[list] = mapped_column("courseIds", JsonPortable)
    minutes_per_day: Mapped[int] = mapped_column("minutesPerDay", Integer)
    #: Cles des seances cochees a la main (« 2026-10-24:quiz:<cours> »).
    done: Mapped[list] = mapped_column(JsonPortable, default=list)
    created_at: Mapped[datetime] = mapped_column(
        "createdAt", DateTime(timezone=True), default=_maintenant
    )

    __table_args__ = (Index("ix_revision_plans_owner", "ownerId"),)


class CarteMentale(Base):
    """
    Carte mentale d'un cours (decision 047, migration 0012).

    Le modele rend la STRUCTURE (sujet, branches, idees, citations) ; le
    navigateur la dessine. Meme telemetrie que les autres sorties du modele.
    """

    __tablename__ = "mind_maps"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_identifiant)
    course_id: Mapped[str] = mapped_column(
        "courseId", String(36), ForeignKey("courses.id", ondelete="CASCADE")
    )
    payload: Mapped[dict] = mapped_column(JsonPortable)
    model: Mapped[str] = mapped_column(String(100))
    prompt_version: Mapped[str] = mapped_column("promptVersion", String(20))
    tokens_in: Mapped[int | None] = mapped_column("tokensIn", Integer, nullable=True)
    tokens_out: Mapped[int | None] = mapped_column("tokensOut", Integer, nullable=True)
    latency_ms: Mapped[int | None] = mapped_column("latencyMs", Integer, nullable=True)
    calls: Mapped[int | None] = mapped_column(Integer, nullable=True)
    sent_payload: Mapped[str] = mapped_column("sentPayload", Text)
    created_at: Mapped[datetime] = mapped_column(
        "createdAt", DateTime(timezone=True), default=_maintenant
    )

    cours: Mapped[Cours] = relationship(back_populates="cartes_mentales")

    __table_args__ = (Index("ix_mind_maps_course_created", "courseId", "createdAt"),)


class QuestionsOuvertes(Base):
    """
    Une serie de questions ouvertes sur un cours (decision 049, migration 0013).

    Les points attendus et la reponse modele sont dans `payload` et NE
    DESCENDENT PAS au navigateur avant la correction — meme discipline que le
    quiz.
    """

    __tablename__ = "open_quizzes"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_identifiant)
    course_id: Mapped[str] = mapped_column(
        "courseId", String(36), ForeignKey("courses.id", ondelete="CASCADE")
    )
    payload: Mapped[dict] = mapped_column(JsonPortable)
    model: Mapped[str] = mapped_column(String(100))
    prompt_version: Mapped[str] = mapped_column("promptVersion", String(20))
    tokens_in: Mapped[int | None] = mapped_column("tokensIn", Integer, nullable=True)
    tokens_out: Mapped[int | None] = mapped_column("tokensOut", Integer, nullable=True)
    latency_ms: Mapped[int | None] = mapped_column("latencyMs", Integer, nullable=True)
    calls: Mapped[int | None] = mapped_column(Integer, nullable=True)
    sent_payload: Mapped[str] = mapped_column("sentPayload", Text)
    created_at: Mapped[datetime] = mapped_column(
        "createdAt", DateTime(timezone=True), default=_maintenant
    )

    cours: Mapped[Cours] = relationship(back_populates="questions_ouvertes")
    copies: Mapped[list["CopieOuverte"]] = relationship(cascade="all, delete-orphan")

    __table_args__ = (Index("ix_open_quizzes_course_created", "courseId", "createdAt"),)


class CopieOuverte(Base):
    """
    Une copie rendue a une serie de questions ouvertes, et sa correction.

    `score` est sur 20, CALCULE PAR LE SERVEUR a partir des jugements du
    modele (acquis, partiel, absent) : le modele ne donne pas de note.
    """

    __tablename__ = "open_attempts"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_identifiant)
    open_quiz_id: Mapped[str] = mapped_column(
        "openQuizId", String(36), ForeignKey("open_quizzes.id", ondelete="CASCADE")
    )
    #: Redondant avec la serie, et assume : la page de consommation compte
    #: toutes les sorties du modele par cours, avec la meme requete.
    course_id: Mapped[str] = mapped_column(
        "courseId", String(36), ForeignKey("courses.id", ondelete="CASCADE")
    )
    answers: Mapped[list] = mapped_column(JsonPortable)
    correction: Mapped[list] = mapped_column(JsonPortable)
    score: Mapped[float] = mapped_column(Float)
    model: Mapped[str] = mapped_column(String(100))
    prompt_version: Mapped[str] = mapped_column("promptVersion", String(20))
    tokens_in: Mapped[int | None] = mapped_column("tokensIn", Integer, nullable=True)
    tokens_out: Mapped[int | None] = mapped_column("tokensOut", Integer, nullable=True)
    latency_ms: Mapped[int | None] = mapped_column("latencyMs", Integer, nullable=True)
    calls: Mapped[int | None] = mapped_column(Integer, nullable=True)
    sent_payload: Mapped[str] = mapped_column("sentPayload", Text)
    created_at: Mapped[datetime] = mapped_column(
        "createdAt", DateTime(timezone=True), default=_maintenant
    )


class Activite(Base):
    """
    Journal des gestes de revision (decision 050, migration 0014).

    Une ligne par geste : quiz rendu, carte revisee, examen blanc rendu, copie
    de questions ouvertes, seance du plan cochee. C'est ce qui permet de
    compter les jours de revision : la carte ne garde que sa DERNIERE
    revision, et un jour sans quiz mais avec vingt cartes revisees aurait
    disparu de la serie.

    L'horodatage est stocke tel quel ; le JOUR est calcule dans le navigateur,
    a l'heure locale de l'etudiant.
    """

    __tablename__ = "learning_events"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_identifiant)
    owner_id: Mapped[str] = mapped_column(
        "ownerId", String(36), ForeignKey("users.id", ondelete="CASCADE")
    )
    type: Mapped[str] = mapped_column(String(20))
    at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_maintenant)

    __table_args__ = (Index("ix_learning_events_owner_at", "ownerId", "at"),)


class Traduction(Base):
    """
    Trace d'une traduction de cours (decision 052, migration 0015).

    La traduction cree un NOUVEAU cours ; cette ligne garde la telemetrie des
    appels, pour que la page de consommation les compte comme toutes les
    autres sorties du modele. Rattachee au cours cree (cascade) ; le cours
    d'origine peut etre supprime sans elle.
    """

    __tablename__ = "translations"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_identifiant)
    course_id: Mapped[str] = mapped_column(
        "courseId", String(36), ForeignKey("courses.id", ondelete="CASCADE")
    )
    source_course_id: Mapped[str | None] = mapped_column(
        "sourceCourseId", String(36), ForeignKey("courses.id", ondelete="SET NULL"), nullable=True
    )
    language: Mapped[str] = mapped_column(String(5))
    model: Mapped[str] = mapped_column(String(100))
    prompt_version: Mapped[str] = mapped_column("promptVersion", String(20))
    tokens_in: Mapped[int | None] = mapped_column("tokensIn", Integer, nullable=True)
    tokens_out: Mapped[int | None] = mapped_column("tokensOut", Integer, nullable=True)
    latency_ms: Mapped[int | None] = mapped_column("latencyMs", Integer, nullable=True)
    calls: Mapped[int | None] = mapped_column(Integer, nullable=True)
    sent_payload: Mapped[str] = mapped_column("sentPayload", Text)
    created_at: Mapped[datetime] = mapped_column(
        "createdAt", DateTime(timezone=True), default=_maintenant
    )


class Glossaire(Base):
    """Glossaire d'un cours (decision 054, migration 0016)."""

    __tablename__ = "glossaries"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_identifiant)
    course_id: Mapped[str] = mapped_column(
        "courseId", String(36), ForeignKey("courses.id", ondelete="CASCADE")
    )
    payload: Mapped[dict] = mapped_column(JsonPortable)
    model: Mapped[str] = mapped_column(String(100))
    prompt_version: Mapped[str] = mapped_column("promptVersion", String(20))
    tokens_in: Mapped[int | None] = mapped_column("tokensIn", Integer, nullable=True)
    tokens_out: Mapped[int | None] = mapped_column("tokensOut", Integer, nullable=True)
    latency_ms: Mapped[int | None] = mapped_column("latencyMs", Integer, nullable=True)
    calls: Mapped[int | None] = mapped_column(Integer, nullable=True)
    sent_payload: Mapped[str] = mapped_column("sentPayload", Text)
    created_at: Mapped[datetime] = mapped_column(
        "createdAt", DateTime(timezone=True), default=_maintenant
    )

    __table_args__ = (Index("ix_glossaries_course_created", "courseId", "createdAt"),)
