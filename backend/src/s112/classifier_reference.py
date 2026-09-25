"""Read the incident classifier reference shipped with the backend package."""

from __future__ import annotations

import json
from functools import lru_cache
from importlib.resources import files
from typing import Any

from s112.api.schemas import OperatorClassification


CLASSIFICATION_FIELDS = (
    "group_code",
    "feature_1_code",
    "feature_2_code",
    "feature_3_code",
    "final_incident_type",
)


@lru_cache(maxsize=1)
def classifier_records() -> dict[int, dict[str, Any]]:
    resource = files("s112").joinpath("incident_classifier_reference.json")
    document = json.loads(resource.read_text(encoding="utf-8"))
    if document.get("format") != "system-112-incident-classifier":
        raise RuntimeError("Unexpected incident classifier reference format")
    fields = document["record_fields"]
    records = {
        int(row[0]): dict(zip(fields, row, strict=True))
        for row in document["records"]
    }
    if len(records) != len(document["records"]):
        raise RuntimeError("Incident classifier reference has duplicate record IDs")
    return records


def validate_classification(
    classification: OperatorClassification, *, location: str
) -> None:
    record = classifier_records().get(classification.record_id)
    if record is None:
        raise ValueError(
            f"{location}.classification.record_id is absent from the incident classifier"
        )
    mismatches = [
        field
        for field in CLASSIFICATION_FIELDS
        if getattr(classification, field) != record[field]
    ]
    if mismatches:
        raise ValueError(
            f"{location}.classification does not match record "
            f"{classification.record_id}: {', '.join(mismatches)}"
        )
