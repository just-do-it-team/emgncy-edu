import type { OperatorCardDraft } from "./operator-cards";

const CITY_PREFIX = "г. ";

function join(parts: string[]): string {
  return parts
    .map((part) => part.trim())
    .filter(Boolean)
    .join(", ");
}

export interface CardAddresses {
  reported_address: string | null;
  incident_address: string;
}

/**
 * Адреса карточки из формы АРМ. В эталонах «адрес со слов заявителя» — почтовый адрес целиком
 * («г. Москва, ул. Учебная, д. 10, подъезд 2, кв. 8»), а место происшествия — тот же адрес с
 * уточнением места («…, контейнерная площадка»). Поэтому структурированный блок формы уходит
 * в оба поля, а «Объект» и «Описательный адрес» — только в место происшествия. Город пишется с «г.»,
 * район и округ не добавляются: сервер сравнивает адрес строкой, и лишние части дали бы расхождение
 * при правильно названном заявителем адресе.
 */
export function cardAddresses(draft: Pick<OperatorCardDraft, "address">): CardAddresses {
  const { address } = draft;
  const city = address.subject.trim();
  const reported = join([
    city === "" || city.startsWith(CITY_PREFIX.trim()) ? city : `${CITY_PREFIX}${city}`,
    address.settlement,
    address.street,
    address.house && `д. ${address.house}`,
    address.building && `корп. ${address.building}`,
    address.structure && `стр. ${address.structure}`,
    address.entrance && `подъезд ${address.entrance}`,
    address.apartment && `кв. ${address.apartment}`,
  ]);
  const structured = [address.street, address.house].some((part) => part.trim() !== "");

  return {
    reported_address: structured ? reported : null,
    incident_address: join([structured ? reported : "", address.object, address.descriptive]),
  };
}
