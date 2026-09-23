"""Persist streamed call responses and wake the outbox publisher after commit."""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0012"
down_revision: str | None = "0011"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("training_call", sa.Column("direction", sa.String(16), nullable=False, server_default="INBOUND"))
    op.add_column("training_call", sa.Column("operator_user_id", sa.Uuid()))
    op.add_column("training_call", sa.Column("interlocutor_role", sa.String(32), nullable=False, server_default="CALLER"))
    op.create_check_constraint("direction_valid", "training_call", "direction IN ('INBOUND', 'OUTBOUND')")
    op.create_foreign_key("fk_training_call_operator", "training_call", "user_account", ["operator_user_id"], ["id"], ondelete="RESTRICT")
    op.execute("""
        UPDATE training_call AS tc
        SET operator_user_id = action.actor_user_id
        FROM training_action AS action
        WHERE action.entity_type = 'training_call'
          AND action.entity_id = CAST(tc.id AS text)
          AND action.action_type = 'INCOMING_CALL_ANSWERED'
          AND action.actor_user_id IS NOT NULL
    """)
    op.add_column("audio_message", sa.Column("speaker_role", sa.String(32), nullable=False, server_default="TRAINEE"))
    op.create_check_constraint("speaker_role_valid", "audio_message", "speaker_role IN ('TRAINEE', 'CALLER', 'COMMANDER')")
    op.add_column("audio_message", sa.Column("reply_to_message_id", sa.Uuid()))
    op.add_column("audio_message", sa.Column("generation_id", sa.Uuid()))
    op.add_column("audio_message", sa.Column("generation_status", sa.String(20)))
    op.add_column("audio_message", sa.Column("final_segment_count", sa.Integer()))
    op.alter_column("audio_message", "object_key", existing_type=sa.String(1024), nullable=True)
    op.create_foreign_key("fk_audio_message_reply", "audio_message", "audio_message", ["reply_to_message_id"], ["id"], ondelete="SET NULL")
    op.execute("""
        UPDATE audio_message AS audio
        SET incident_card_id = tc.incident_card_id
        FROM training_call AS tc
        WHERE audio.training_call_id = tc.id
          AND tc.incident_card_id IS NOT NULL
          AND audio.incident_card_id IS NULL
    """)
    op.create_unique_constraint("uq_audio_message_reply_to", "audio_message", ["reply_to_message_id"])
    op.create_table(
        "tts_segment",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("audio_message_id", sa.Uuid(), sa.ForeignKey("audio_message.id", ondelete="CASCADE"), nullable=False),
        sa.Column("generation_id", sa.Uuid(), nullable=False),
        sa.Column("segment_no", sa.Integer(), nullable=False),
        sa.Column("text", sa.Text(), nullable=False),
        sa.Column("status", sa.String(20), nullable=False),
        sa.Column("object_key", sa.String(1024), nullable=False),
        sa.Column("sha256", sa.String(64)),
        sa.Column("size_bytes", sa.BigInteger()),
        sa.Column("sample_rate", sa.Integer()),
        sa.Column("content_type", sa.String(128)),
        sa.Column("attempts", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("last_error", sa.Text()),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("completed_at", sa.DateTime(timezone=True)),
        sa.UniqueConstraint("audio_message_id", "generation_id", "segment_no", name="uq_tts_segment_order"),
        sa.CheckConstraint("segment_no > 0", name="segment_positive"),
        sa.CheckConstraint("status IN ('QUEUED', 'PROCESSING', 'COMPLETED', 'FAILED', 'CANCELLED')", name="status_valid"),
    )
    op.create_index("ix_tts_segment_message_order", "tts_segment", ["audio_message_id", "segment_no"])
    op.execute("""
        CREATE FUNCTION s112_notify_outbox() RETURNS trigger LANGUAGE plpgsql AS $$
        BEGIN
            PERFORM pg_notify('s112_outbox', 'ready');
            RETURN NEW;
        END; $$
    """)
    op.execute("CREATE TRIGGER trg_s112_notify_outbox AFTER INSERT ON outbox_event FOR EACH ROW EXECUTE FUNCTION s112_notify_outbox()")


def downgrade() -> None:
    connection = op.get_bind()
    if connection.execute(sa.text("SELECT EXISTS (SELECT 1 FROM audio_message WHERE object_key IS NULL)")).scalar():
        raise RuntimeError("Remove streamed response data before downgrading to 0011")
    op.execute("DROP TRIGGER trg_s112_notify_outbox ON outbox_event")
    op.execute("DROP FUNCTION s112_notify_outbox()")
    op.drop_index("ix_tts_segment_message_order", table_name="tts_segment")
    op.drop_table("tts_segment")
    op.drop_constraint("fk_audio_message_reply", "audio_message", type_="foreignkey")
    op.drop_constraint("uq_audio_message_reply_to", "audio_message", type_="unique")
    op.drop_constraint("ck_audio_message_speaker_role_valid", "audio_message", type_="check")
    op.alter_column("audio_message", "object_key", existing_type=sa.String(1024), nullable=False)
    for column in ("final_segment_count", "generation_status", "generation_id", "reply_to_message_id", "speaker_role"):
        op.drop_column("audio_message", column)
    op.drop_constraint("fk_training_call_operator", "training_call", type_="foreignkey")
    op.drop_constraint("ck_training_call_direction_valid", "training_call", type_="check")
    for column in ("interlocutor_role", "operator_user_id", "direction"):
        op.drop_column("training_call", column)
