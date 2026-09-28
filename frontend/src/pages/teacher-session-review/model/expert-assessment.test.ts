import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  assessmentBody,
  assessmentComment,
  teacherText,
  validateAssessment,
  type AssessmentValues,
} from "./expert-assessment.ts";

const automatic = { score: 71.43, passed: false };
const values = (fields: Partial<AssessmentValues>): AssessmentValues => ({ score: 71.43, passed: false, comment: "", ...fields });

describe("оценка преподавателя", () => {
  it("совпадает с автоматической — комментарий не обязателен", () => {
    assert.deepEqual(validateAssessment(values({}), automatic, []), {});
  });

  it("изменён балл или зачёт — нужна причина", () => {
    assert.equal(validateAssessment(values({ score: 85.71 }), automatic, []).comment, "Укажите причину изменения оценки");
    assert.equal(validateAssessment(values({ passed: true }), automatic, []).comment, "Укажите причину изменения оценки");
    assert.deepEqual(validateAssessment(values({ passed: true, comment: "Адрес уточнён верно" }), automatic, []), {});
  });

  it("балл вне шкалы", () => {
    assert.ok(validateAssessment(values({ score: 101 }), automatic, []).score);
    assert.ok(validateAssessment(values({ score: "" }), automatic, []).score);
  });

  it("отклонённые расхождения попадают в комментарий отдельным блоком и отделяются при повторной правке", () => {
    const comment = assessmentComment("Адрес уточнён верно", ["Карточка 1: Адрес происшествия", "Карточка 1: Телефон"]);

    assert.equal(
      comment,
      "Адрес уточнён верно\n\nНе считаю ошибками:\n— Карточка 1: Адрес происшествия\n— Карточка 1: Телефон",
    );
    assert.equal(teacherText(comment), "Адрес уточнён верно");
    assert.equal(assessmentComment("  ", []), null);
  });

  it("тело запроса: балл строкой с двумя знаками", () => {
    assert.deepEqual(assessmentBody(values({ score: 85.7, passed: true, comment: "Причина" }), []), {
      score: "85.70",
      passed: true,
      comment: "Причина",
    });
  });
});
