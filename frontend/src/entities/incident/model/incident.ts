export interface IncidentService {
  name: string;
  time: string;
  status: string;
  highlighted?: boolean;
  history?: { status: string; time: string; comment: string }[];
}

export interface Incident {
  id: string;
  operator: number;
  workstation: number;
  createdAt: string;
  type: string;
  hasCasualties: boolean;
  address: string;
  serviceStatus: string;
  description: string;
  descriptionCreatedAt: string;
  author: string;
  emergency: boolean;
  details?: {
    applicantName: string;
    automaticNumber: string;
    providedNumber: string;
    locationPhone: string;
    addressTitle: string;
    district: string;
    ambulanceRefused: boolean;
    trapped: boolean;
    urgent: boolean;
    category: string;
    classification: string;
    externalClassification: string;
    services: IncidentService[];
  };
}
