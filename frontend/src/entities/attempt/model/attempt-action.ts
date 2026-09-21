import type { ResponseStatusCode, ServiceAddedReason } from "./incident-card";
import type { SelectedFeature, ServiceRef } from "./references";

interface AttemptActionBase {
  action_id: string;
  occurred_at: string;
}

export interface CardOpenedAction extends AttemptActionBase {
  type: "CARD_OPENED";
  incident_card_id: string;
}

export interface FieldChangedAction extends AttemptActionBase {
  type: "FIELD_CHANGED";
  field: string;
  previous_value: string | null;
  value: string | null;
}

export interface FeatureSelectedAction extends AttemptActionBase {
  type: "FEATURE_SELECTED";
  feature: SelectedFeature;
}

export interface FeatureClearedAction extends AttemptActionBase {
  type: "FEATURE_CLEARED";
  feature: SelectedFeature;
}

export interface AddressEnteredAction extends AttemptActionBase {
  type: "ADDRESS_ENTERED";
  field: string;
  previous_value: string | null;
  value: string | null;
}

export interface ServiceAddedAction extends AttemptActionBase {
  type: "SERVICE_ADDED";
  service: ServiceRef;
  added_reason: ServiceAddedReason;
}

export interface ServiceRemovedAction extends AttemptActionBase {
  type: "SERVICE_REMOVED";
  service: ServiceRef;
}

export interface StatusSetAction extends AttemptActionBase {
  type: "STATUS_SET";
  service: ServiceRef;
  status: ResponseStatusCode;
  previous_status: ResponseStatusCode | null;
  comment: string | null;
}

export interface CallStartedAction extends AttemptActionBase {
  type: "CALL_STARTED";
  phone: string | null;
}

export interface CallEndedAction extends AttemptActionBase {
  type: "CALL_ENDED";
}

export interface CardSavedAction extends AttemptActionBase {
  type: "CARD_SAVED";
  incident_card_id: string;
}

export type AttemptAction =
  | CardOpenedAction
  | FieldChangedAction
  | FeatureSelectedAction
  | FeatureClearedAction
  | AddressEnteredAction
  | ServiceAddedAction
  | ServiceRemovedAction
  | StatusSetAction
  | CallStartedAction
  | CallEndedAction
  | CardSavedAction;

export type AttemptActionType = AttemptAction["type"];
