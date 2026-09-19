from s112.api.main import app as api_app
from s112.realtime_gateway.main import app as realtime_app


def test_openapi_schemas_are_generated_without_runtime_connections() -> None:
    assert "/api/v1/cards" in api_app.openapi()["paths"]
    assert "/api/v1/training-scenarios" in api_app.openapi()["paths"]
    assert "/api/v1/scenario-assignments/{assignment_id}/start" in api_app.openapi()[
        "paths"
    ]
    assert "/events" in realtime_app.openapi()["paths"]
