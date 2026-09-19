from s112.common.enums import ServiceResponseStatus


SERVICE_STATUS_TRANSITIONS: dict[ServiceResponseStatus, set[ServiceResponseStatus]] = {
    ServiceResponseStatus.ADDED: {
        ServiceResponseStatus.RECEIVED,
        ServiceResponseStatus.ACCEPTED,
        ServiceResponseStatus.REJECTED,
    },
    ServiceResponseStatus.RECEIVED: {
        ServiceResponseStatus.ACCEPTED,
        ServiceResponseStatus.REJECTED,
    },
    ServiceResponseStatus.REJECTED: {ServiceResponseStatus.ACCEPTED},
    ServiceResponseStatus.ACCEPTED: {
        ServiceResponseStatus.RESPONSE_STARTED,
        ServiceResponseStatus.WORK_REFUSED,
    },
    ServiceResponseStatus.RESPONSE_STARTED: {
        ServiceResponseStatus.ARRIVED,
        ServiceResponseStatus.WORK_REFUSED,
    },
    ServiceResponseStatus.ARRIVED: {
        ServiceResponseStatus.WORK_IN_PROGRESS,
        ServiceResponseStatus.WORK_REFUSED,
    },
    ServiceResponseStatus.WORK_IN_PROGRESS: {
        ServiceResponseStatus.WORK_COMPLETED,
        ServiceResponseStatus.WORK_REFUSED,
    },
    ServiceResponseStatus.WORK_COMPLETED: set(),
    ServiceResponseStatus.WORK_REFUSED: set(),
}


def validate_service_status_transition(current: str, target: ServiceResponseStatus) -> None:
    current_status = ServiceResponseStatus(current)
    if target not in SERVICE_STATUS_TRANSITIONS[current_status]:
        raise ValueError(f"Invalid service status transition: {current_status.value} -> {target.value}")


def validate_service_status_comment(status: ServiceResponseStatus, comment: str | None) -> None:
    if status in {ServiceResponseStatus.REJECTED, ServiceResponseStatus.WORK_REFUSED}:
        if not comment or not comment.strip():
            raise ValueError(f"Comment is required for status {status.value}")
