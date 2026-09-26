import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { Discrepancy } from "@/shared/api";
import { buildReviewBreakdown, type CriterionReview } from "./review-breakdown.ts";

function discrepancy(path: string, expected: Discrepancy["expected"], actual: Discrepancy["actual"]) {
  return { path, expected, actual, reason: "value_mismatch" };
}

function criterion(criteria: CriterionReview[], code: CriterionReview["code"]) {
  const found = criteria.find((review) => review.code === code);
  assert.ok(found, `нет критерия ${code}`);
  return found;
}

function findingsOf(review: CriterionReview) {
  assert.equal(review.applicable, true);
  return review.applicable ? review.findings.map((finding) => finding.path) : [];
}

describe("buildReviewBreakdown: критерии", () => {
  it("C1 собирает все пути классификации", () => {
    const { criteria } = buildReviewBreakdown(
      [
        discrepancy("card.classification.feature_2_code", "2.1", "2.3"),
        discrepancy("card.classification.routing_flags.threat_to_people", true, false),
      ],
      "OPERATOR_112",
    );

    assert.deepEqual(findingsOf(criterion(criteria, "C1")), [
      "card.classification.feature_2_code",
      "card.classification.routing_flags.threat_to_people",
    ]);
  });

  it("C2 — перечень служб", () => {
    const { criteria } = buildReviewBreakdown(
      [discrepancy("card.services", ["101", "103"], ["101"])],
      "OPERATOR_112",
    );

    assert.deepEqual(findingsOf(criterion(criteria, "C2")), ["card.services"]);
  });

  it("C3 — описание, опросная карта и пострадавшие", () => {
    const { criteria } = buildReviewBreakdown(
      [
        discrepancy("card.questionnaire.answers", { smoke: "yes" }, { smoke: "no" }),
        discrepancy("card.victims_count", 1, 0),
      ],
      "OPERATOR_112",
    );

    assert.deepEqual(findingsOf(criterion(criteria, "C3")), [
      "card.questionnaire.answers",
      "card.victims_count",
    ]);
  });

  it("C4 — только адрес со слов заявителя, адрес происшествия и АОН уходят в сведения", () => {
    const { criteria, notes } = buildReviewBreakdown(
      [
        discrepancy("card.reported_address", "Ленинский проспект, д. 14", "Ленинский проспект, д. 41"),
        discrepancy("card.incident_address", "Ленинский проспект, д. 14", "Ленинский проспект, д. 41"),
        discrepancy("card.automatic_phone_number", "+74957304512", null),
      ],
      "OPERATOR_112",
    );

    assert.deepEqual(findingsOf(criterion(criteria, "C4")), ["card.reported_address"]);
    assert.deepEqual(findingsOf(criterion(criteria, "C3")), []);
    assert.deepEqual(notes.map((note) => note.path), [
      "card.incident_address",
      "card.automatic_phone_number",
    ]);
  });

  it("C5 — просроченные сроки раскрытия и решения у ДДС", () => {
    const { criteria } = buildReviewBreakdown(
      [
        discrepancy("service_handling.101.open_deadline", "ON_TIME", "MISSED"),
        discrepancy("service_handling.101.decision_deadline", "ON_TIME", "MISSED"),
      ],
      "DDS",
    );

    assert.deepEqual(findingsOf(criterion(criteria, "C5")), [
      "service_handling.101.open_deadline",
      "service_handling.101.decision_deadline",
    ]);
  });

  it("C7 — статусы, история статусов, раскрытие и решение у ДДС", () => {
    const { criteria } = buildReviewBreakdown(
      [
        discrepancy("card.service_statuses.101", "WORK_COMPLETED", "ARRIVED"),
        discrepancy("service_status_history.101.length", 6, 4),
        discrepancy("service_status_history.101.3.status", "ARRIVED", "WORK_REFUSED"),
        discrepancy("service_handling.101.decision", "ACCEPTED_OR_REJECTED", null),
      ],
      "DDS",
    );

    assert.deepEqual(findingsOf(criterion(criteria, "C7")), [
      "card.service_statuses.101",
      "service_status_history.101.length",
      "service_status_history.101.3.status",
      "service_handling.101.decision",
    ]);
  });

  it("C6 всегда не оценивается, неприменимые к роли критерии без значения", () => {
    const { criteria } = buildReviewBreakdown([], "OPERATOR_112");

    assert.deepEqual(
      criteria.map((review) => review.code),
      ["C1", "C2", "C3", "C4", "C5", "C6", "C7"],
    );
    assert.deepEqual(criterion(criteria, "C6"), { code: "C6", applicable: false });
    assert.deepEqual(criterion(criteria, "C5"), { code: "C5", applicable: false });
    assert.deepEqual(criterion(buildReviewBreakdown([], "DDS").criteria, "C6"), {
      code: "C6",
      applicable: false,
    });
  });

  it("расхождение по критерию чужой роли уходит в отдельную группу", () => {
    const { criteria, outsideRole } = buildReviewBreakdown(
      [discrepancy("card.reported_address", "д. 14", "д. 41")],
      "DDS",
    );

    assert.deepEqual(outsideRole.map((finding) => finding.path), ["card.reported_address"]);
    assert.equal(criterion(criteria, "C4").applicable, false);
  });
});

describe("buildReviewBreakdown: отдельные группы", () => {
  it("комментарии ДДС к статусам — отдельная группа буквального сравнения", () => {
    const { literalComments, criteria } = buildReviewBreakdown(
      [discrepancy("service_status_history.101.4.comment", "Возгорание ликвидировано", "Пожар потушен")],
      "DDS",
    );

    assert.deepEqual(literalComments.map((finding) => finding.path), [
      "service_status_history.101.4.comment",
    ]);
    assert.deepEqual(findingsOf(criterion(criteria, "C7")), []);
  });

  it("исходящий звонок — оценка модели вне критериев", () => {
    const { modelEvaluation, unclassified } = buildReviewBreakdown(
      [
        {
          path: "expected_result.outbound_call",
          expected: { minimum_similarity: 0.8 },
          actual: { similarity: 0.62, threshold: 0.8 },
          reason: "semantic_similarity_below_threshold",
        },
      ],
      "DDS",
    );

    assert.deepEqual(modelEvaluation.map((finding) => finding.path), ["expected_result.outbound_call"]);
    assert.deepEqual(unclassified, []);
  });
});

describe("buildReviewBreakdown: значимость", () => {
  it("высокая — адрес со слов заявителя", () => {
    const { criteria } = buildReviewBreakdown(
      [discrepancy("card.reported_address", "Ленинский проспект, д. 14", "Ленинский проспект, д. 41")],
      "OPERATOR_112",
    );
    const review = criterion(criteria, "C4");

    assert.ok(review.applicable);
    assert.equal(review.findings[0]?.significance, "high");
    assert.equal(review.findings[0]?.formattingOnly, false);
  });

  it("средняя — число пострадавших", () => {
    const { criteria } = buildReviewBreakdown(
      [discrepancy("card.victims_count", 1, 0)],
      "OPERATOR_112",
    );
    const review = criterion(criteria, "C3");

    assert.ok(review.applicable);
    assert.equal(review.findings[0]?.significance, "medium");
  });

  it("низкая — описание отличается только регистром, пробелами и пунктуацией", () => {
    const { criteria } = buildReviewBreakdown(
      [
        discrepancy(
          "card.description",
          "Задымление в квартире на 7 этаже, дым из-под двери.",
          "задымление в квартире  на 7 этаже дым из-под двери",
        ),
      ],
      "OPERATOR_112",
    );
    const review = criterion(criteria, "C3");

    assert.ok(review.applicable);
    assert.equal(review.findings[0]?.significance, "low");
    assert.equal(review.findings[0]?.formattingOnly, true);
  });

  it("перестановка цифр в номере дома — не оформление, «14» и «41» различаются", () => {
    const { criteria } = buildReviewBreakdown(
      [
        discrepancy(
          "card.reported_address",
          "г. Москва, Ленинский проспект, д. 14",
          "г. москва ленинский проспект д 41",
        ),
      ],
      "OPERATOR_112",
    );
    const review = criterion(criteria, "C4");

    assert.ok(review.applicable);
    assert.equal(review.findings[0]?.formattingOnly, false);
    assert.equal(review.findings[0]?.significance, "high");
  });
});
