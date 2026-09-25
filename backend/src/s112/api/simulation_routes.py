"""Compatibility router aggregating role- and tab-specific training APIs."""

from fastapi import APIRouter

from s112.api.common.dependencies import simulation_service
from s112.api.common.training.assignments import router as assignments_router
from s112.api.common.training.call_transcript import router as call_transcript_router
from s112.api.common.training.call_recording import router as call_recording_router
from s112.api.common.training.responses import (
    assignment_batch_response as _assignment_batch_response,
    assignment_response as _assignment_response,
    learning_group_response as _learning_group_response,
    teacher_monitoring_response as _teacher_monitoring_response,
)
from s112.api.common.training.session_data import router as session_data_router
from s112.api.student.assigned_scenarios.api import router as assigned_scenarios_router
from s112.api.student.audio_messages.api import router as audio_messages_router
from s112.api.student.incoming_calls.api import router as incoming_calls_router
from s112.api.student.scenario_session.api import router as scenario_session_router
from s112.api.student.training_history.api import router as student_history_router
from s112.api.teacher.active_sessions.api import router as active_sessions_router
from s112.api.teacher.learners.api import router as learners_router
from s112.api.teacher.performance.api import router as performance_router
from s112.api.teacher.training_content.api import router as training_content_router


router = APIRouter()
router.include_router(training_content_router)
router.include_router(learners_router)
router.include_router(assignments_router)
router.include_router(assigned_scenarios_router)
router.include_router(student_history_router)
router.include_router(performance_router)
router.include_router(active_sessions_router)
router.include_router(session_data_router)
router.include_router(call_transcript_router)
router.include_router(call_recording_router)
router.include_router(scenario_session_router)
router.include_router(audio_messages_router)
router.include_router(incoming_calls_router)


__all__ = [
    "_assignment_batch_response",
    "_assignment_response",
    "_learning_group_response",
    "_teacher_monitoring_response",
    "router",
    "simulation_service",
]
