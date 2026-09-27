export interface AddressDraft {
  subject: string;
  settlement: string;
  object: string;
  district: string;
  street: string;
  house: string;
  building: string;
  structure: string;
  apartment: string;
  descriptive: string;
}

export const DEFAULT_ADDRESS_SUBJECT = "Москва";

export const emptyAddress: AddressDraft = {
  subject: DEFAULT_ADDRESS_SUBJECT,
  settlement: "",
  object: "",
  district: "",
  street: "",
  house: "",
  building: "",
  structure: "",
  apartment: "",
  descriptive: "",
};

export function formatAddress(address: AddressDraft): string {
  const house = address.house.trim();
  const building = address.building.trim();
  const structure = address.structure.trim();
  const apartment = address.apartment.trim();

  return [
    address.subject.trim(),
    address.settlement.trim(),
    address.object.trim(),
    address.district.trim(),
    address.street.trim(),
    house && `д. ${house}`,
    building && `корп. ${building}`,
    structure && `стр. ${structure}`,
    apartment && `кв. ${apartment}`,
    address.descriptive.trim(),
  ]
    .filter(Boolean)
    .join(", ");
}

export function addressFromText(text: string): AddressDraft {
  return { ...emptyAddress, subject: "", descriptive: text };
}
