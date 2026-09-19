from s112.domain.classifier import CLASSIFIER


def test_classifier_contains_all_supplied_groups_and_kinds() -> None:
    assert [group[0] for group in CLASSIFIER] == [
        "101",
        "102",
        "103",
        "104",
        "ANTITERROR",
        "EDDS",
    ]
    assert sum(len(group[2]) for group in CLASSIFIER) == 188

