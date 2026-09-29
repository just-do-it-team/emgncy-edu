import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { cardAddresses } from "./card-addresses.ts";
import type { OperatorCardDraft } from "./operator-cards.ts";

const emptyAddress: OperatorCardDraft["address"] = {
  country: "",
  subject: "Москва",
  settlement: "",
  object: "",
  okrug: "",
  district: "",
  street: "",
  house: "",
  building: "",
  structure: "",
  apartment: "",
  entrance: "",
  floor: "",
  code: "",
  descriptive: "",
};

function draft(address: Partial<OperatorCardDraft["address"]>): Pick<OperatorCardDraft, "address"> {
  return { address: { ...emptyAddress, ...address } };
}

describe("адреса карточки из формы АРМ", () => {
  it("структурированный адрес — в оба поля, с «г.»; описательный и объект — только в место происшествия", () => {
    assert.deepEqual(cardAddresses(draft({ street: "ул. Учебная", house: "10", descriptive: "контейнерная площадка" })), {
      reported_address: "г. Москва, ул. Учебная, д. 10",
      incident_address: "г. Москва, ул. Учебная, д. 10, контейнерная площадка",
    });
  });

  it("подъезд и квартира входят в адрес со слов заявителя; район в адрес не попадает", () => {
    assert.equal(
      cardAddresses(draft({ district: "Хамовники", street: "ул. Безопасная", house: "3", entrance: "2", apartment: "15" })).reported_address,
      "г. Москва, ул. Безопасная, д. 3, подъезд 2, кв. 15",
    );
  });

  it("без улицы и дома адреса со слов заявителя нет, место происшествия — описательный адрес", () => {
    assert.deepEqual(cardAddresses(draft({ subject: "", descriptive: "г. Москва, ул. Лобачевского, д. 4" })), {
      reported_address: null,
      incident_address: "г. Москва, ул. Лобачевского, д. 4",
    });
  });
});
