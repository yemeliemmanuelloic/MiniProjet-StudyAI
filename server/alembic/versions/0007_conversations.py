"""Conversations du tuteur

Ajoutee le 20 octobre. Jusqu'ici, un cours n'avait qu'un fil de discussion :
les six derniers messages servaient de contexte, quelle que soit la question,
et l'etudiant ne pouvait ni repartir de zero ni retrouver un echange.

  - table `chat_conversations` : une conversation par sujet, rattachee a un
    cours (suppression en cascade avec lui) ;
  - colonne `chat_messages.conversationId`, NULLABLE : l'ancien code continue
    d'ecrire des messages sans conversation sans echouer ;
  - reprise : les messages existants de chaque cours sont regroupes dans une
    conversation sans titre, que l'interface libelle « Conversation
    precedente ». Aucun historique n'est perdu.

Additive : la version en ligne anterieure ignore la table et la colonne. La
migration peut donc passer AVANT le deploiement du code qui s'en sert ; un
message ecrit entre les deux est rattache a la premiere lecture
(services/study.py, _rattacher_orphelins).

Revision ID: 0007
Revises: 0006
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0007"
down_revision: str | None = "0006"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "chat_conversations",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column(
            "courseId",
            sa.String(36),
            sa.ForeignKey("courses.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("title", sa.String(120), nullable=True),
        sa.Column("createdAt", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updatedAt", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index(
        "ix_conversations_course_updated", "chat_conversations", ["courseId", "updatedAt"]
    )
    op.add_column(
        "chat_messages",
        sa.Column(
            "conversationId",
            sa.String(36),
            sa.ForeignKey("chat_conversations.id", ondelete="CASCADE"),
            nullable=True,
        ),
    )
    op.create_index(
        "ix_messages_conversation_created", "chat_messages", ["conversationId", "createdAt"]
    )

    # Reprise : une conversation sans titre par cours ayant deja des messages.
    # md5(courseId) donne un identifiant deterministe au format UUID, sans
    # dependre d'une extension (gen_random_uuid n'existe pas partout).
    op.execute(
        """
        INSERT INTO chat_conversations (id, "courseId", title, "createdAt", "updatedAt")
        SELECT
            substr(md5('conv-' || "courseId"), 1, 8) || '-' ||
            substr(md5('conv-' || "courseId"), 9, 4) || '-' ||
            substr(md5('conv-' || "courseId"), 13, 4) || '-' ||
            substr(md5('conv-' || "courseId"), 17, 4) || '-' ||
            substr(md5('conv-' || "courseId"), 21, 12),
            "courseId", NULL, MIN("createdAt"), MAX("createdAt")
        FROM chat_messages
        WHERE "conversationId" IS NULL
        GROUP BY "courseId"
        """
    )
    op.execute(
        """
        UPDATE chat_messages AS m
        SET "conversationId" = c.id
        FROM chat_conversations AS c
        WHERE m."conversationId" IS NULL
          AND c."courseId" = m."courseId"
          AND c.title IS NULL
        """
    )


def downgrade() -> None:
    op.drop_index("ix_messages_conversation_created", table_name="chat_messages")
    op.drop_column("chat_messages", "conversationId")
    op.drop_index("ix_conversations_course_updated", table_name="chat_conversations")
    op.drop_table("chat_conversations")
