export interface ClassifierRef {
  id: number;
  code: string;
  name: string;
}

export interface ChannelRef {
  channel_id: string;
  name: string;
}

export interface IncidentTypeRef {
  incident_type_id: string;
  name: string;
}

export interface ServiceRef {
  service_id: string;
  name: string;
}

export interface SelectedFeature {
  level: 1 | 2 | 3;
  feature_id: number;
  code: string;
  name: string;
}

export interface QuestionnaireOption {
  feature_id: number;
  code: string;
  name: string;
}

export interface QuestionnaireGroup {
  group: string;
  options: QuestionnaireOption[];
}

export interface EkpFeatureConsequence {
  feature_id: number;
  feature_name: string;
  consequence: string;
}
