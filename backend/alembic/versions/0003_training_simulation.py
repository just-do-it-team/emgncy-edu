"""Add training scenarios, workspaces and execution history.

Revision ID: 0003
Revises: 0002
"""

from typing import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql


revision: str = "0003"
down_revision: str | None = "0002"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


UUID = postgresql.UUID(as_uuid=True)
JSONB = postgresql.JSONB(astext_type=sa.Text())
SYSTEM_WORKSPACE_ID = "00000000-0000-0000-0000-000000000112"


def upgrade() -> None:
    op.create_table(
        "card_template",
        sa.Column("id", UUID, primary_key=True),
        sa.Column("template_key", UUID, nullable=False),
        sa.Column("version", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("description", sa.Text()),
        sa.Column("difficulty", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("initial_card", JSONB, nullable=False),
        sa.Column("expected_result", JSONB, nullable=False),
        sa.Column("evaluation_rules", JSONB, nullable=False, server_default=sa.text("'{}'::jsonb")),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("created_by", UUID, nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.CheckConstraint("version >= 1", name="ck_card_template_version_positive"),
        sa.CheckConstraint(
            "difficulty BETWEEN 1 AND 5", name="ck_card_template_difficulty_range"
        ),
        sa.ForeignKeyConstraint(["created_by"], ["user_account.id"], ondelete="RESTRICT"),
        sa.UniqueConstraint(
            "template_key", "version", name="uq_card_template_key_version"
        ),
    )
    op.create_index("ix_card_template_active_name", "card_template", ["is_active", "name"])

    op.create_table(
        "training_scenario",
        sa.Column("id", UUID, primary_key=True),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("description", sa.Text()),
        sa.Column("difficulty", sa.Integer(), nullable=False),
        sa.Column("estimated_duration_seconds", sa.Integer(), nullable=False),
        sa.Column("cards_count", sa.Integer(), nullable=False),
        sa.Column("workspace_mode", sa.String(32), nullable=False, server_default="INDIVIDUAL"),
        sa.Column("min_participants", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("max_participants", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("definition", JSONB, nullable=False),
        sa.Column("revision", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("status", sa.String(32), nullable=False, server_default="DRAFT"),
        sa.Column("created_by", UUID, nullable=False),
        sa.Column("updated_by", UUID, nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.CheckConstraint(
            "difficulty BETWEEN 1 AND 5", name="ck_training_scenario_difficulty_range"
        ),
        sa.CheckConstraint(
            "estimated_duration_seconds > 0", name="ck_training_scenario_duration_positive"
        ),
        sa.CheckConstraint(
            "cards_count >= 0", name="ck_training_scenario_cards_count_nonnegative"
        ),
        sa.CheckConstraint(
            "min_participants >= 1", name="ck_training_scenario_min_participants_positive"
        ),
        sa.CheckConstraint(
            "max_participants >= min_participants",
            name="ck_training_scenario_participant_range",
        ),
        sa.CheckConstraint(
            "revision >= 1", name="ck_training_scenario_revision_positive"
        ),
        sa.ForeignKeyConstraint(["created_by"], ["user_account.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["updated_by"], ["user_account.id"], ondelete="RESTRICT"),
    )
    op.create_index(
        "ix_training_scenario_status_difficulty",
        "training_scenario",
        ["status", "difficulty"],
    )

    op.create_table(
        "scenario_assignment",
        sa.Column("id", UUID, primary_key=True),
        sa.Column("scenario_id", UUID, nullable=False),
        sa.Column("scenario_revision", sa.Integer(), nullable=False),
        sa.Column("scenario_snapshot", JSONB, nullable=False),
        sa.Column("assigned_by", UUID, nullable=False),
        sa.Column("workspace_mode", sa.String(32), nullable=False),
        sa.Column(
            "launch_policy", sa.String(40), nullable=False, server_default="STUDENT_SELF_START"
        ),
        sa.Column("max_attempts", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("status", sa.String(32), nullable=False, server_default="ASSIGNED"),
        sa.Column("available_from", sa.DateTime(timezone=True)),
        sa.Column("due_at", sa.DateTime(timezone=True)),
        sa.Column("cancelled_at", sa.DateTime(timezone=True)),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.CheckConstraint(
            "scenario_revision >= 1", name="ck_scenario_assignment_scenario_revision_positive"
        ),
        sa.CheckConstraint(
            "max_attempts >= 1", name="ck_scenario_assignment_max_attempts_positive"
        ),
        sa.ForeignKeyConstraint(["scenario_id"], ["training_scenario.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["assigned_by"], ["user_account.id"], ondelete="RESTRICT"),
    )
    op.create_index(
        "ix_scenario_assignment_status_due", "scenario_assignment", ["status", "due_at"]
    )

    op.create_table(
        "assignment_participant",
        sa.Column("assignment_id", UUID, primary_key=True),
        sa.Column("user_id", UUID, primary_key=True),
        sa.Column("status", sa.String(32), nullable=False, server_default="ASSIGNED"),
        sa.Column("ready_at", sa.DateTime(timezone=True)),
        sa.Column("completed_at", sa.DateTime(timezone=True)),
        sa.ForeignKeyConstraint(
            ["assignment_id"], ["scenario_assignment.id"], ondelete="CASCADE"
        ),
        sa.ForeignKeyConstraint(["user_id"], ["user_account.id"], ondelete="RESTRICT"),
    )
    op.create_index(
        "ix_assignment_participant_user_status",
        "assignment_participant",
        ["user_id", "status"],
    )

    op.create_table(
        "training_session",
        sa.Column("id", UUID, primary_key=True),
        sa.Column("assignment_id", UUID, nullable=False),
        sa.Column("attempt_number", sa.Integer(), nullable=False),
        sa.Column("start_idempotency_key", sa.String(128), nullable=False),
        sa.Column("status", sa.String(32), nullable=False, server_default="CREATED"),
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("completed_at", sa.DateTime(timezone=True)),
        sa.Column("score", sa.Numeric(5, 2)),
        sa.Column("passed", sa.Boolean()),
        sa.Column("result", JSONB, nullable=False, server_default=sa.text("'{}'::jsonb")),
        sa.CheckConstraint(
            "attempt_number >= 1", name="ck_training_session_attempt_number_positive"
        ),
        sa.CheckConstraint(
            "score IS NULL OR (score >= 0 AND score <= 100)",
            name="ck_training_session_score_range",
        ),
        sa.ForeignKeyConstraint(
            ["assignment_id"], ["scenario_assignment.id"], ondelete="RESTRICT"
        ),
        sa.UniqueConstraint(
            "assignment_id",
            "attempt_number",
            name="uq_training_session_assignment_attempt",
        ),
        sa.UniqueConstraint(
            "assignment_id",
            "start_idempotency_key",
            name="uq_training_session_assignment_idempotency",
        ),
    )
    op.create_index(
        "ix_training_session_assignment_status",
        "training_session",
        ["assignment_id", "status"],
    )
    op.create_index(
        "uq_training_session_one_active_assignment",
        "training_session",
        ["assignment_id"],
        unique=True,
        postgresql_where=sa.text("status IN ('CREATED', 'RUNNING')"),
    )

    op.create_table(
        "simulation_workspace",
        sa.Column("id", UUID, primary_key=True),
        sa.Column("training_session_id", UUID, unique=True),
        sa.Column("mode", sa.String(32), nullable=False, server_default="INDIVIDUAL"),
        sa.Column("status", sa.String(32), nullable=False, server_default="PREPARING"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("activated_at", sa.DateTime(timezone=True)),
        sa.Column("closed_at", sa.DateTime(timezone=True)),
        sa.ForeignKeyConstraint(
            ["training_session_id"], ["training_session.id"], ondelete="CASCADE"
        ),
    )
    op.create_index("ix_simulation_workspace_status", "simulation_workspace", ["status"])
    op.execute(
        sa.text(
            "INSERT INTO simulation_workspace (id, mode, status, activated_at) "
            "VALUES (:id, 'INDIVIDUAL', 'ACTIVE', now())"
        ).bindparams(id=SYSTEM_WORKSPACE_ID)
    )

    op.create_table(
        "workspace_member",
        sa.Column("workspace_id", UUID, primary_key=True),
        sa.Column("user_id", UUID, primary_key=True),
        sa.Column("member_role", sa.String(32), nullable=False, server_default="PARTICIPANT"),
        sa.Column("position_code", sa.String(100)),
        sa.Column("joined_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("left_at", sa.DateTime(timezone=True)),
        sa.ForeignKeyConstraint(
            ["workspace_id"], ["simulation_workspace.id"], ondelete="CASCADE"
        ),
        sa.ForeignKeyConstraint(["user_id"], ["user_account.id"], ondelete="RESTRICT"),
    )
    op.create_index("ix_workspace_member_user", "workspace_member", ["user_id", "left_at"])

    op.add_column(
        "incident_card",
        sa.Column(
            "workspace_id",
            UUID,
            nullable=True,
            server_default=sa.text(f"'{SYSTEM_WORKSPACE_ID}'::uuid"),
        ),
    )
    op.create_foreign_key(
        "fk_incident_card_workspace_id_simulation_workspace",
        "incident_card",
        "simulation_workspace",
        ["workspace_id"],
        ["id"],
        ondelete="RESTRICT",
    )
    op.execute(
        sa.text("UPDATE incident_card SET workspace_id = :id WHERE workspace_id IS NULL").bindparams(
            id=SYSTEM_WORKSPACE_ID
        )
    )
    op.alter_column("incident_card", "workspace_id", nullable=False)
    op.drop_constraint("uq_incident_card_card_number", "incident_card", type_="unique")
    op.drop_constraint("uq_incident_card_external_source", "incident_card", type_="unique")
    op.create_unique_constraint(
        "uq_incident_card_workspace_card_number",
        "incident_card",
        ["workspace_id", "card_number"],
    )
    op.create_unique_constraint(
        "uq_incident_card_workspace_external_source",
        "incident_card",
        ["workspace_id", "source_system_id", "external_card_id"],
    )
    op.drop_index("ix_incident_card_status_registered", table_name="incident_card")
    op.drop_index("ix_incident_card_event_registered", table_name="incident_card")
    op.create_index(
        "ix_incident_card_workspace_status_registered",
        "incident_card",
        ["workspace_id", "current_status", "registered_at"],
    )
    op.create_index(
        "ix_incident_card_workspace_event_registered",
        "incident_card",
        ["workspace_id", "event_type_id", "registered_at"],
    )

    op.add_column("card_list_projection", sa.Column("workspace_id", UUID, nullable=True))
    op.create_foreign_key(
        "fk_card_list_projection_workspace_id_simulation_workspace",
        "card_list_projection",
        "simulation_workspace",
        ["workspace_id"],
        ["id"],
        ondelete="CASCADE",
    )
    op.execute(
        "UPDATE card_list_projection p SET workspace_id = c.workspace_id "
        "FROM incident_card c WHERE c.id = p.card_id"
    )
    op.alter_column("card_list_projection", "workspace_id", nullable=False)
    op.drop_index("ix_card_projection_status_registered", table_name="card_list_projection")
    op.drop_index("ix_card_projection_event_registered", table_name="card_list_projection")
    op.create_index(
        "ix_card_projection_workspace_status_registered",
        "card_list_projection",
        ["workspace_id", "current_status", "registered_at"],
    )
    op.create_index(
        "ix_card_projection_workspace_event_registered",
        "card_list_projection",
        ["workspace_id", "event_type_id", "registered_at"],
    )

    op.create_table(
        "session_scheduled_card",
        sa.Column("id", UUID, primary_key=True),
        sa.Column("training_session_id", UUID, nullable=False),
        sa.Column("workspace_id", UUID, nullable=False),
        sa.Column("scenario_card_key", sa.String(100), nullable=False),
        sa.Column("trigger_type", sa.String(32), nullable=False),
        sa.Column("trigger_config", JSONB, nullable=False, server_default=sa.text("'{}'::jsonb")),
        sa.Column("source_type", sa.String(32), nullable=False, server_default="SNAPSHOT"),
        sa.Column("card_payload", JSONB, nullable=False),
        sa.Column("expected_result", JSONB, nullable=False),
        sa.Column("evaluation_rules", JSONB, nullable=False, server_default=sa.text("'{}'::jsonb")),
        sa.Column("scheduled_at", sa.DateTime(timezone=True)),
        sa.Column("status", sa.String(32), nullable=False, server_default="PENDING"),
        sa.Column("incident_card_id", UUID, unique=True),
        sa.Column("emitted_at", sa.DateTime(timezone=True)),
        sa.Column("attempts", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("last_error", sa.Text()),
        sa.ForeignKeyConstraint(
            ["training_session_id"], ["training_session.id"], ondelete="CASCADE"
        ),
        sa.ForeignKeyConstraint(
            ["workspace_id"], ["simulation_workspace.id"], ondelete="CASCADE"
        ),
        sa.ForeignKeyConstraint(["incident_card_id"], ["incident_card.id"], ondelete="SET NULL"),
        sa.UniqueConstraint(
            "training_session_id",
            "scenario_card_key",
            name="uq_session_scheduled_card_session_key",
        ),
    )
    op.create_index(
        "ix_session_scheduled_card_due", "session_scheduled_card", ["status", "scheduled_at"]
    )
    op.create_index(
        "ix_session_scheduled_card_workspace",
        "session_scheduled_card",
        ["workspace_id", "status"],
    )

    op.create_table(
        "training_action",
        sa.Column("id", UUID, primary_key=True),
        sa.Column("training_session_id", UUID, nullable=False),
        sa.Column("workspace_id", UUID, nullable=False),
        sa.Column("actor_user_id", UUID),
        sa.Column("incident_card_id", UUID),
        sa.Column("action_type", sa.String(100), nullable=False),
        sa.Column("entity_type", sa.String(64)),
        sa.Column("entity_id", sa.String(128)),
        sa.Column("occurred_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("request_id", sa.String(128)),
        sa.Column("result", sa.String(20), nullable=False, server_default="SUCCESS"),
        sa.Column("before_state", JSONB),
        sa.Column("after_state", JSONB),
        sa.Column("details", JSONB, nullable=False, server_default=sa.text("'{}'::jsonb")),
        sa.ForeignKeyConstraint(
            ["training_session_id"], ["training_session.id"], ondelete="CASCADE"
        ),
        sa.ForeignKeyConstraint(
            ["workspace_id"], ["simulation_workspace.id"], ondelete="CASCADE"
        ),
        sa.ForeignKeyConstraint(["actor_user_id"], ["user_account.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["incident_card_id"], ["incident_card.id"], ondelete="SET NULL"),
        sa.UniqueConstraint(
            "training_session_id", "request_id", name="uq_training_action_session_request"
        ),
    )
    op.create_index(
        "ix_training_action_session_time", "training_action", ["training_session_id", "occurred_at"]
    )
    op.create_index(
        "ix_training_action_card_time", "training_action", ["incident_card_id", "occurred_at"]
    )
    op.create_index(
        "ix_training_action_actor_time", "training_action", ["actor_user_id", "occurred_at"]
    )

    op.create_table(
        "training_card_result",
        sa.Column("id", UUID, primary_key=True),
        sa.Column("session_scheduled_card_id", UUID, nullable=False, unique=True),
        sa.Column("score", sa.Numeric(5, 2), nullable=False),
        sa.Column("passed", sa.Boolean(), nullable=False),
        sa.Column("discrepancies", JSONB, nullable=False, server_default=sa.text("'[]'::jsonb")),
        sa.Column("evaluated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.CheckConstraint(
            "score >= 0 AND score <= 100", name="ck_training_card_result_score_range"
        ),
        sa.ForeignKeyConstraint(
            ["session_scheduled_card_id"],
            ["session_scheduled_card.id"],
            ondelete="CASCADE",
        ),
    )


def downgrade() -> None:
    op.drop_table("training_card_result")
    op.drop_table("training_action")
    op.drop_table("session_scheduled_card")

    op.drop_index(
        "ix_card_projection_workspace_event_registered", table_name="card_list_projection"
    )
    op.drop_index(
        "ix_card_projection_workspace_status_registered", table_name="card_list_projection"
    )
    op.create_index(
        "ix_card_projection_event_registered",
        "card_list_projection",
        ["event_type_id", "registered_at"],
    )
    op.create_index(
        "ix_card_projection_status_registered",
        "card_list_projection",
        ["current_status", "registered_at"],
    )
    op.drop_constraint(
        "fk_card_list_projection_workspace_id_simulation_workspace",
        "card_list_projection",
        type_="foreignkey",
    )
    op.drop_column("card_list_projection", "workspace_id")

    op.drop_index("ix_incident_card_workspace_event_registered", table_name="incident_card")
    op.drop_index("ix_incident_card_workspace_status_registered", table_name="incident_card")
    op.create_index(
        "ix_incident_card_event_registered", "incident_card", ["event_type_id", "registered_at"]
    )
    op.create_index(
        "ix_incident_card_status_registered", "incident_card", ["current_status", "registered_at"]
    )
    op.drop_constraint(
        "uq_incident_card_workspace_external_source", "incident_card", type_="unique"
    )
    op.drop_constraint(
        "uq_incident_card_workspace_card_number", "incident_card", type_="unique"
    )
    op.create_unique_constraint(
        "uq_incident_card_external_source",
        "incident_card",
        ["source_system_id", "external_card_id"],
    )
    op.create_unique_constraint(
        "uq_incident_card_card_number", "incident_card", ["card_number"]
    )
    op.drop_constraint(
        "fk_incident_card_workspace_id_simulation_workspace",
        "incident_card",
        type_="foreignkey",
    )
    op.drop_column("incident_card", "workspace_id")

    op.drop_table("workspace_member")
    op.drop_table("simulation_workspace")
    op.drop_table("training_session")
    op.drop_table("assignment_participant")
    op.drop_table("scenario_assignment")
    op.drop_table("training_scenario")
    op.drop_table("card_template")
