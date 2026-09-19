from enum import Enum


class SourceType(str, Enum):
    CALL = "CALL"
    SMS = "SMS"
    VIS = "VIS"
    ERA_GLONASS = "ERA_GLONASS"
    REGIONAL_112 = "REGIONAL_112"
    MANUAL = "MANUAL"


class CardStatus(str, Enum):
    REGISTERED = "REGISTERED"
    PROCESSED = "PROCESSED"
    CHECKED = "CHECKED"
    NOT_NOTIFIED = "NOT_NOTIFIED"
    REFUSAL = "REFUSAL"
    NOT_COMPLETED = "NOT_COMPLETED"
    COMPLETED = "COMPLETED"


class NotificationMethod(str, Enum):
    INTEGRATION = "INTEGRATION"
    ARM_112 = "ARM_112"
    PHONE = "PHONE"
    INTERMEDIARY = "INTERMEDIARY"
    COMBINED = "COMBINED"


class ServiceAddedReason(str, Enum):
    EKP = "EKP"
    MANUAL = "MANUAL"
    VIS_UPDATE = "VIS_UPDATE"


class ServiceResponseStatus(str, Enum):
    ADDED = "ADDED"
    RECEIVED = "RECEIVED"
    ACCEPTED = "ACCEPTED"
    REJECTED = "REJECTED"
    RESPONSE_STARTED = "RESPONSE_STARTED"
    ARRIVED = "ARRIVED"
    WORK_IN_PROGRESS = "WORK_IN_PROGRESS"
    WORK_COMPLETED = "WORK_COMPLETED"
    WORK_REFUSED = "WORK_REFUSED"


class OutboxStatus(str, Enum):
    PENDING = "PENDING"
    PROCESSING = "PROCESSING"
    FAILED = "FAILED"
    PUBLISHED = "PUBLISHED"


class UserRole(str, Enum):
    ADMINISTRATOR = "ADMINISTRATOR"
    TEACHER = "TEACHER"
    STUDENT = "STUDENT"


class ScenarioStatus(str, Enum):
    DRAFT = "DRAFT"
    PUBLISHED = "PUBLISHED"
    ARCHIVED = "ARCHIVED"


class WorkspaceMode(str, Enum):
    INDIVIDUAL = "INDIVIDUAL"
    SHARED = "SHARED"


class LaunchPolicy(str, Enum):
    STUDENT_SELF_START = "STUDENT_SELF_START"
    TEACHER_START = "TEACHER_START"
    ALL_PARTICIPANTS_READY = "ALL_PARTICIPANTS_READY"
    SCHEDULED_START = "SCHEDULED_START"


class AssignmentStatus(str, Enum):
    ASSIGNED = "ASSIGNED"
    RUNNING = "RUNNING"
    COMPLETED = "COMPLETED"
    CANCELLED = "CANCELLED"
    EXPIRED = "EXPIRED"


class ParticipantStatus(str, Enum):
    ASSIGNED = "ASSIGNED"
    READY = "READY"
    RUNNING = "RUNNING"
    COMPLETED = "COMPLETED"


class TrainingSessionStatus(str, Enum):
    CREATED = "CREATED"
    RUNNING = "RUNNING"
    COMPLETED = "COMPLETED"
    ABORTED = "ABORTED"
    TIMED_OUT = "TIMED_OUT"


class WorkspaceStatus(str, Enum):
    PREPARING = "PREPARING"
    ACTIVE = "ACTIVE"
    READ_ONLY = "READ_ONLY"
    CLOSED = "CLOSED"


class WorkspaceMemberRole(str, Enum):
    PARTICIPANT = "PARTICIPANT"
    INSTRUCTOR = "INSTRUCTOR"
    OBSERVER = "OBSERVER"


class ScenarioTriggerType(str, Enum):
    TIME_OFFSET = "TIME_OFFSET"
    AFTER_ACTION = "AFTER_ACTION"
    MANUAL = "MANUAL"


class ScenarioCardSourceType(str, Enum):
    TEMPLATE = "TEMPLATE"
    INLINE = "INLINE"
    SNAPSHOT = "SNAPSHOT"


class ScheduledCardStatus(str, Enum):
    PENDING = "PENDING"
    EMITTED = "EMITTED"
    FAILED = "FAILED"
    CANCELLED = "CANCELLED"


class TrainingActionResult(str, Enum):
    SUCCESS = "SUCCESS"
    REJECTED = "REJECTED"
    ERROR = "ERROR"
