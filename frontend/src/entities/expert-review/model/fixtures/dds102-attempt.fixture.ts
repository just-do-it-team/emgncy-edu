import type { ExpertReviewContextDto } from "@/shared/api";

/**
 * Ответ GET /training-sessions/{id}/expert-review-context для завершённой попытки занятия
 * «ДДС-102: две карточки с докладом наряду полиции — сложность 2» (29.09.2026). Идентификаторы
 * сохранены; персональных данных заявителя в попытке нет, адреса и реплики — учебные.
 */
export const dds102AttemptContext: ExpertReviewContextDto = {
  "session": {
    "id": "f783ab9d-c5f7-4082-a08c-9b7c94808d3d",
    "assignment_id": "ec76b61b-df91-42d0-b51e-3137faad7ce5",
    "attempt_number": 1,
    "status": "COMPLETED",
    "completion_policy": "STUDENT_CONFIRM",
    "completion_state": {
      "training_session_id": "f783ab9d-c5f7-4082-a08c-9b7c94808d3d",
      "status": "COMPLETED",
      "completion_policy": "STUDENT_CONFIRM",
      "can_complete": false,
      "ready_to_complete_at": "2026-09-29T09:54:30.051435Z",
      "cards_total": 2,
      "cards_pending": 0,
      "cards_emitted": 2,
      "cards_failed": 0,
      "cards_cancelled": 0,
      "calls_total": 2,
      "calls_pending": 0,
      "calls_ringing": 0,
      "calls_active": 0,
      "calls_completed": 2,
      "calls_failed": 0,
      "calls_cancelled": 0,
      "generation_status": null,
      "generated_cards": 0,
      "generation_target": 0,
      "decisions_required": 2,
      "decisions_completed": 2,
      "audio_messages_total": 8,
      "audio_messages_pending": 0,
      "audio_messages_failed": 2,
      "semantic_evaluations_total": 3,
      "semantic_evaluations_pending": 0,
      "semantic_evaluations_failed": 0,
      "pending_card_keys": [],
      "failed_card_keys": [],
      "cancelled_card_keys": [],
      "waiting_for_decision": [],
      "next_scheduled_at": null,
      "blockers": [],
      "revision": 27
    },
    "completion_state_revision": 27,
    "ready_to_complete_at": "2026-09-29T09:54:30.051435Z",
    "completed_automatically": false,
    "started_at": "2026-09-29T09:47:24.899045Z",
    "completed_at": "2026-09-29T09:54:40.153800Z",
    "score": "54.16",
    "passed": false,
    "result": {
      "passing_score": "100.0",
      "cards": [
        {
          "scenario_card_key": "dds102-traffic-accident-1",
          "incident_card_id": "d5b39188-bdd9-4ce5-b0aa-f10e28a32981",
          "score": "62.5",
          "passed": false,
          "discrepancies": [
            {
              "path": "card.victims_count",
              "expected": 0,
              "actual": 1,
              "reason": "value_mismatch"
            },
            {
              "path": "card.current_status",
              "expected": "COMPLETED",
              "actual": "REGISTERED",
              "reason": "value_mismatch"
            },
            {
              "path": "card.service_statuses.102",
              "expected": "WORK_COMPLETED",
              "actual": "ACCEPTED",
              "reason": "value_mismatch"
            },
            {
              "path": "service_status_history.102.length",
              "expected": 6,
              "actual": 2,
              "reason": "value_mismatch"
            },
            {
              "path": "service_status_history.102.2.status",
              "expected": "RESPONSE_STARTED",
              "actual": null,
              "reason": "value_mismatch"
            },
            {
              "path": "service_status_history.102.3.status",
              "expected": "ARRIVED",
              "actual": null,
              "reason": "value_mismatch"
            },
            {
              "path": "service_status_history.102.4.status",
              "expected": "WORK_IN_PROGRESS",
              "actual": null,
              "reason": "value_mismatch"
            },
            {
              "path": "service_status_history.102.5.status",
              "expected": "WORK_COMPLETED",
              "actual": null,
              "reason": "value_mismatch"
            },
            {
              "path": "service_handling.102.open_deadline",
              "expected": "ON_TIME",
              "actual": "MISSED",
              "reason": "card_open_deadline_missed"
            }
          ]
        },
        {
          "scenario_card_key": "dds102-vehicle-theft-1",
          "incident_card_id": "edab67b2-ccfe-445c-8ddc-98abd60d46cc",
          "score": "45.83",
          "passed": false,
          "discrepancies": [
            {
              "path": "card.classification.record_id",
              "expected": 15050300,
              "actual": 15020200,
              "reason": "value_mismatch"
            },
            {
              "path": "card.classification.feature_1_code",
              "expected": 5,
              "actual": 2,
              "reason": "value_mismatch"
            },
            {
              "path": "card.classification.feature_2_code",
              "expected": 3,
              "actual": 2,
              "reason": "value_mismatch"
            },
            {
              "path": "card.classification.final_incident_type",
              "expected": "Кража",
              "actual": "Вскрыта автомашина",
              "reason": "value_mismatch"
            },
            {
              "path": "card.current_status",
              "expected": "COMPLETED",
              "actual": "REGISTERED",
              "reason": "value_mismatch"
            },
            {
              "path": "card.service_statuses.102",
              "expected": "WORK_COMPLETED",
              "actual": "ACCEPTED",
              "reason": "value_mismatch"
            },
            {
              "path": "service_status_history.102.length",
              "expected": 6,
              "actual": 2,
              "reason": "value_mismatch"
            },
            {
              "path": "service_status_history.102.2.status",
              "expected": "RESPONSE_STARTED",
              "actual": null,
              "reason": "value_mismatch"
            },
            {
              "path": "service_status_history.102.3.status",
              "expected": "ARRIVED",
              "actual": null,
              "reason": "value_mismatch"
            },
            {
              "path": "service_status_history.102.4.status",
              "expected": "WORK_IN_PROGRESS",
              "actual": null,
              "reason": "value_mismatch"
            },
            {
              "path": "service_status_history.102.5.status",
              "expected": "WORK_COMPLETED",
              "actual": null,
              "reason": "value_mismatch"
            },
            {
              "path": "expected_result.outbound_call",
              "expected": {
                "minimum_similarity": 0.8
              },
              "actual": {
                "model": "gpt-oss-20b",
                "passed": false,
                "attempts": 1,
                "similarity": 0.6,
                "actual_text": "Здравствуйте. Э-э, по адресу: город Москва, улица Примерная, дом 7. Во дворе у заявителя",
                "explanation": "Адрес совпадает, но отсутствуют ключевые факты о краже сумки и припаркованном автомобиле.",
                "sequence_no": 2,
                "workspace_id": "df8b19a6-6701-48d4-9a03-0584293daf93",
                "actor_user_id": "11ba0c06-3acc-40b5-aca1-0472fe466cc5",
                "expected_text": "Кража сумки из припаркованного автомобиля по адресу: г. Москва, ул. Примерная, д. 7, двор.",
                "missing_facts": [
                  "Кража сумки",
                  "из припаркованного автомобиля"
                ],
                "contradictions": [],
                "audio_message_id": "a522ac66-4714-4384-95bd-4f1702c0c196",
                "incident_card_id": "edab67b2-ccfe-445c-8ddc-98abd60d46cc",
                "minimum_similarity": 0.8,
                "training_session_id": "f783ab9d-c5f7-4082-a08c-9b7c94808d3d"
              },
              "reason": "semantic_similarity_below_threshold"
            },
            {
              "path": "service_handling.102.decision_deadline",
              "expected": "ON_TIME",
              "actual": "MISSED",
              "reason": "card_decision_deadline_missed"
            }
          ]
        }
      ],
      "incoming_calls": [],
      "abort_reason": null
    },
    "expert_score": null,
    "expert_passed": null,
    "expert_comment": null,
    "expert_evaluated_by": null,
    "expert_evaluated_at": null
  },
  "scenario_snapshot": {
    "name": "ДДС-102: две карточки с докладом наряду полиции — сложность 2",
    "definition": {
      "mode": "STATIC",
      "cards": [
        {
          "key": "dds102-vehicle-theft-1",
          "item_type": "INCIDENT_CARD",
          "source_type": "SNAPSHOT",
          "template_id": "3bfde8ff-ff46-55b1-b243-6de8ffb5680c",
          "initial_card": {
            "description": "Заявитель обнаружил пропажу сумки из припаркованного автомобиля. Нападения и пострадавших не было.",
            "source_type": "CALL",
            "victims_count": 0,
            "classification": {
              "record_id": 15020200,
              "group_code": 15,
              "routing_flags": {},
              "feature_1_code": 2,
              "feature_2_code": 2,
              "feature_3_code": 0,
              "final_incident_type": "Вскрыта автомашина",
              "excluded_service_codes": []
            },
            "incident_address": "г. Москва, ул. Примерная, д. 7, двор",
            "reported_address": "г. Москва, ул. Примерная, д. 7"
          },
          "template_key": "e342698d-e3ab-4d15-896c-8041d0f29ba4",
          "trigger_type": "TIME_OFFSET",
          "trigger_config": {
            "offset_seconds": 5
          },
          "expected_result": {
            "card": {
              "services": [
                "102"
              ],
              "description": "Заявитель обнаружил пропажу сумки из припаркованного автомобиля. Нападения и пострадавших не было.",
              "questionnaire": null,
              "victims_count": 0,
              "classification": {
                "record_id": 15050300,
                "group_code": 15,
                "routing_flags": {},
                "feature_1_code": 5,
                "feature_2_code": 3,
                "feature_3_code": 0,
                "final_incident_type": "Кража",
                "excluded_service_codes": []
              },
              "current_status": "COMPLETED",
              "incident_address": "г. Москва, ул. Примерная, д. 7, двор",
              "reported_address": "г. Москва, ул. Примерная, д. 7",
              "service_statuses": {
                "102": "WORK_COMPLETED"
              }
            },
            "outbound_call": {
              "expected_text": "Кража сумки из припаркованного автомобиля по адресу: г. Москва, ул. Примерная, д. 7, двор.",
              "minimum_similarity": 0.8
            },
            "service_status_history": {
              "102": [
                {
                  "status": "RECEIVED",
                  "comment": null,
                  "unit_number": null
                },
                {
                  "status": "ACCEPTED",
                  "comment": "Карточка принята. Наряд полиции направлен к месту происшествия.",
                  "unit_number": null
                },
                {
                  "status": "RESPONSE_STARTED",
                  "comment": "Наряд полиции выехал к месту происшествия.",
                  "unit_number": "АП-321"
                },
                {
                  "status": "ARRIVED",
                  "comment": "Наряд полиции прибыл по указанному адресу.",
                  "unit_number": "АП-321"
                },
                {
                  "status": "WORK_IN_PROGRESS",
                  "comment": "Наряд полиции приступил к работе на месте.",
                  "unit_number": "АП-321"
                },
                {
                  "status": "WORK_COMPLETED",
                  "comment": "Работы службы 102 на месте происшествия завершены.",
                  "unit_number": "АП-321"
                }
              ]
            }
          },
          "template_version": 4
        },
        {
          "key": "dds102-traffic-accident-1",
          "item_type": "INCIDENT_CARD",
          "source_type": "SNAPSHOT",
          "template_id": "d426b5f1-8097-5502-bce9-1318faad59d2",
          "initial_card": {
            "description": "На парковке столкнулись два автомобиля. Пострадавших нет, проезд свободен.",
            "source_type": "CALL",
            "victims_count": 1,
            "classification": {
              "record_id": 2010000,
              "group_code": 2,
              "routing_flags": {},
              "feature_1_code": 1,
              "feature_2_code": 0,
              "feature_3_code": 0,
              "final_incident_type": "ДТП без пострадавших",
              "excluded_service_codes": []
            },
            "incident_address": "г. Москва, ул. Тренировочная, д. 5, парковка",
            "reported_address": "г. Москва, ул. Тренировочная, д. 5"
          },
          "template_key": "a15975c1-3fe8-4135-a8c0-fff448a9f3b6",
          "trigger_type": "TIME_OFFSET",
          "trigger_config": {
            "offset_seconds": 180
          },
          "expected_result": {
            "card": {
              "services": [
                "102"
              ],
              "description": "На парковке столкнулись два автомобиля. Пострадавших нет, проезд свободен.",
              "questionnaire": null,
              "victims_count": 0,
              "classification": {
                "record_id": 2010000,
                "group_code": 2,
                "routing_flags": {},
                "feature_1_code": 1,
                "feature_2_code": 0,
                "feature_3_code": 0,
                "final_incident_type": "ДТП без пострадавших",
                "excluded_service_codes": []
              },
              "current_status": "COMPLETED",
              "incident_address": "г. Москва, ул. Тренировочная, д. 5, парковка",
              "reported_address": "г. Москва, ул. Тренировочная, д. 5",
              "service_statuses": {
                "102": "WORK_COMPLETED"
              }
            },
            "outbound_call": {
              "expected_text": "ДТП двух автомобилей без пострадавших по адресу: г. Москва, ул. Тренировочная, д. 5, парковка.",
              "minimum_similarity": 0.8
            },
            "service_status_history": {
              "102": [
                {
                  "status": "RECEIVED",
                  "comment": null,
                  "unit_number": null
                },
                {
                  "status": "ACCEPTED",
                  "comment": "Карточка принята. Наряд полиции направлен к месту происшествия.",
                  "unit_number": null
                },
                {
                  "status": "RESPONSE_STARTED",
                  "comment": "Наряд полиции выехал к месту происшествия.",
                  "unit_number": "АП-321"
                },
                {
                  "status": "ARRIVED",
                  "comment": "Наряд полиции прибыл по указанному адресу.",
                  "unit_number": "АП-321"
                },
                {
                  "status": "WORK_IN_PROGRESS",
                  "comment": "Наряд полиции приступил к работе на месте.",
                  "unit_number": "АП-321"
                },
                {
                  "status": "WORK_COMPLETED",
                  "comment": "Работы службы 102 на месте происшествия завершены.",
                  "unit_number": "АП-321"
                }
              ]
            }
          },
          "template_version": 4
        }
      ],
      "schema_version": 1,
      "procedural_catalog": [],
      "procedural_generation": null
    },
    "difficulty": 2,
    "description": "Оператор ДДС-102 исправляет одну неточность, сообщает руководителю наряда полиции суть происшествия и адрес, затем завершает карточку.",
    "scenario_id": "9b8ab948-2eda-4c64-a858-3f5ef2653fd1",
    "passing_score": 100.0,
    "workspace_mode": "INDIVIDUAL",
    "max_participants": 1,
    "min_participants": 1,
    "completion_policy": "STUDENT_CONFIRM",
    "scenario_revision": 5,
    "estimated_duration_seconds": 480,
    "required_participant_positions": null
  },
  "participant_ids": [
    "11ba0c06-3acc-40b5-aca1-0472fe466cc5"
  ],
  "cards": [
    {
      "scenario_card_key": "dds102-traffic-accident-1",
      "incident_card_id": "d5b39188-bdd9-4ce5-b0aa-f10e28a32981",
      "expected_result": {
        "card": {
          "services": [
            "102"
          ],
          "description": "На парковке столкнулись два автомобиля. Пострадавших нет, проезд свободен.",
          "questionnaire": null,
          "victims_count": 0,
          "classification": {
            "record_id": 2010000,
            "group_code": 2,
            "routing_flags": {},
            "feature_1_code": 1,
            "feature_2_code": 0,
            "feature_3_code": 0,
            "final_incident_type": "ДТП без пострадавших",
            "excluded_service_codes": []
          },
          "current_status": "COMPLETED",
          "incident_address": "г. Москва, ул. Тренировочная, д. 5, парковка",
          "reported_address": "г. Москва, ул. Тренировочная, д. 5",
          "service_statuses": {
            "102": "WORK_COMPLETED"
          }
        },
        "outbound_call": {
          "expected_text": "ДТП двух автомобилей без пострадавших по адресу: г. Москва, ул. Тренировочная, д. 5, парковка.",
          "minimum_similarity": 0.8
        },
        "service_status_history": {
          "102": [
            {
              "status": "RECEIVED",
              "comment": null,
              "unit_number": null
            },
            {
              "status": "ACCEPTED",
              "comment": "Карточка принята. Наряд полиции направлен к месту происшествия.",
              "unit_number": null
            },
            {
              "status": "RESPONSE_STARTED",
              "comment": "Наряд полиции выехал к месту происшествия.",
              "unit_number": "АП-321"
            },
            {
              "status": "ARRIVED",
              "comment": "Наряд полиции прибыл по указанному адресу.",
              "unit_number": "АП-321"
            },
            {
              "status": "WORK_IN_PROGRESS",
              "comment": "Наряд полиции приступил к работе на месте.",
              "unit_number": "АП-321"
            },
            {
              "status": "WORK_COMPLETED",
              "comment": "Работы службы 102 на месте происшествия завершены.",
              "unit_number": "АП-321"
            }
          ]
        }
      },
      "current_state": {
        "classification": {
          "record_id": 2010000,
          "group_code": 2,
          "routing_flags": {},
          "feature_1_code": 1,
          "feature_2_code": 0,
          "feature_3_code": 0,
          "final_incident_type": "ДТП без пострадавших",
          "excluded_service_codes": []
        },
        "description": "На парковке столкнулись два автомобиля. Пострадавших нет, проезд свободен.",
        "questionnaire": null,
        "applicant_full_name": null,
        "automatic_phone_number": null,
        "provided_phone_number": null,
        "location_phone_number": null,
        "reported_address": "г. Москва, ул. Тренировочная, д. 5",
        "incident_address": "г. Москва, ул. Тренировочная, д. 5, парковка",
        "victims_count": 1,
        "current_status": "REGISTERED",
        "services": [
          "102"
        ],
        "service_statuses": {
          "102": "ACCEPTED"
        }
      },
      "automatic_result": {
        "score": 62.5,
        "passed": false,
        "discrepancies": [
          {
            "path": "card.victims_count",
            "actual": 1,
            "reason": "value_mismatch",
            "expected": 0
          },
          {
            "path": "card.current_status",
            "actual": "REGISTERED",
            "reason": "value_mismatch",
            "expected": "COMPLETED"
          },
          {
            "path": "card.service_statuses.102",
            "actual": "ACCEPTED",
            "reason": "value_mismatch",
            "expected": "WORK_COMPLETED"
          },
          {
            "path": "service_status_history.102.length",
            "actual": 2,
            "reason": "value_mismatch",
            "expected": 6
          },
          {
            "path": "service_status_history.102.2.status",
            "actual": null,
            "reason": "value_mismatch",
            "expected": "RESPONSE_STARTED"
          },
          {
            "path": "service_status_history.102.3.status",
            "actual": null,
            "reason": "value_mismatch",
            "expected": "ARRIVED"
          },
          {
            "path": "service_status_history.102.4.status",
            "actual": null,
            "reason": "value_mismatch",
            "expected": "WORK_IN_PROGRESS"
          },
          {
            "path": "service_status_history.102.5.status",
            "actual": null,
            "reason": "value_mismatch",
            "expected": "WORK_COMPLETED"
          },
          {
            "path": "service_handling.102.open_deadline",
            "actual": "MISSED",
            "reason": "card_open_deadline_missed",
            "expected": "ON_TIME"
          }
        ],
        "evaluated_at": "2026-09-29T09:54:40.072924Z"
      }
    },
    {
      "scenario_card_key": "dds102-vehicle-theft-1",
      "incident_card_id": "edab67b2-ccfe-445c-8ddc-98abd60d46cc",
      "expected_result": {
        "card": {
          "services": [
            "102"
          ],
          "description": "Заявитель обнаружил пропажу сумки из припаркованного автомобиля. Нападения и пострадавших не было.",
          "questionnaire": null,
          "victims_count": 0,
          "classification": {
            "record_id": 15050300,
            "group_code": 15,
            "routing_flags": {},
            "feature_1_code": 5,
            "feature_2_code": 3,
            "feature_3_code": 0,
            "final_incident_type": "Кража",
            "excluded_service_codes": []
          },
          "current_status": "COMPLETED",
          "incident_address": "г. Москва, ул. Примерная, д. 7, двор",
          "reported_address": "г. Москва, ул. Примерная, д. 7",
          "service_statuses": {
            "102": "WORK_COMPLETED"
          }
        },
        "outbound_call": {
          "expected_text": "Кража сумки из припаркованного автомобиля по адресу: г. Москва, ул. Примерная, д. 7, двор.",
          "minimum_similarity": 0.8
        },
        "service_status_history": {
          "102": [
            {
              "status": "RECEIVED",
              "comment": null,
              "unit_number": null
            },
            {
              "status": "ACCEPTED",
              "comment": "Карточка принята. Наряд полиции направлен к месту происшествия.",
              "unit_number": null
            },
            {
              "status": "RESPONSE_STARTED",
              "comment": "Наряд полиции выехал к месту происшествия.",
              "unit_number": "АП-321"
            },
            {
              "status": "ARRIVED",
              "comment": "Наряд полиции прибыл по указанному адресу.",
              "unit_number": "АП-321"
            },
            {
              "status": "WORK_IN_PROGRESS",
              "comment": "Наряд полиции приступил к работе на месте.",
              "unit_number": "АП-321"
            },
            {
              "status": "WORK_COMPLETED",
              "comment": "Работы службы 102 на месте происшествия завершены.",
              "unit_number": "АП-321"
            }
          ]
        }
      },
      "current_state": {
        "classification": {
          "record_id": 15020200,
          "group_code": 15,
          "routing_flags": {},
          "feature_1_code": 2,
          "feature_2_code": 2,
          "feature_3_code": 0,
          "final_incident_type": "Вскрыта автомашина",
          "excluded_service_codes": []
        },
        "description": "Заявитель обнаружил пропажу сумки из припаркованного автомобиля. Нападения и пострадавших не было.",
        "questionnaire": null,
        "applicant_full_name": null,
        "automatic_phone_number": null,
        "provided_phone_number": null,
        "location_phone_number": null,
        "reported_address": "г. Москва, ул. Примерная, д. 7",
        "incident_address": "г. Москва, ул. Примерная, д. 7, двор",
        "victims_count": 0,
        "current_status": "REGISTERED",
        "services": [
          "102"
        ],
        "service_statuses": {
          "102": "ACCEPTED"
        }
      },
      "automatic_result": {
        "score": 45.83,
        "passed": false,
        "discrepancies": [
          {
            "path": "card.classification.record_id",
            "actual": 15020200,
            "reason": "value_mismatch",
            "expected": 15050300
          },
          {
            "path": "card.classification.feature_1_code",
            "actual": 2,
            "reason": "value_mismatch",
            "expected": 5
          },
          {
            "path": "card.classification.feature_2_code",
            "actual": 2,
            "reason": "value_mismatch",
            "expected": 3
          },
          {
            "path": "card.classification.final_incident_type",
            "actual": "Вскрыта автомашина",
            "reason": "value_mismatch",
            "expected": "Кража"
          },
          {
            "path": "card.current_status",
            "actual": "REGISTERED",
            "reason": "value_mismatch",
            "expected": "COMPLETED"
          },
          {
            "path": "card.service_statuses.102",
            "actual": "ACCEPTED",
            "reason": "value_mismatch",
            "expected": "WORK_COMPLETED"
          },
          {
            "path": "service_status_history.102.length",
            "actual": 2,
            "reason": "value_mismatch",
            "expected": 6
          },
          {
            "path": "service_status_history.102.2.status",
            "actual": null,
            "reason": "value_mismatch",
            "expected": "RESPONSE_STARTED"
          },
          {
            "path": "service_status_history.102.3.status",
            "actual": null,
            "reason": "value_mismatch",
            "expected": "ARRIVED"
          },
          {
            "path": "service_status_history.102.4.status",
            "actual": null,
            "reason": "value_mismatch",
            "expected": "WORK_IN_PROGRESS"
          },
          {
            "path": "service_status_history.102.5.status",
            "actual": null,
            "reason": "value_mismatch",
            "expected": "WORK_COMPLETED"
          },
          {
            "path": "expected_result.outbound_call",
            "actual": {
              "model": "gpt-oss-20b",
              "passed": false,
              "attempts": 1,
              "similarity": 0.6,
              "actual_text": "Здравствуйте. Э-э, по адресу: город Москва, улица Примерная, дом 7. Во дворе у заявителя",
              "explanation": "Адрес совпадает, но отсутствуют ключевые факты о краже сумки и припаркованном автомобиле.",
              "sequence_no": 2,
              "workspace_id": "df8b19a6-6701-48d4-9a03-0584293daf93",
              "actor_user_id": "11ba0c06-3acc-40b5-aca1-0472fe466cc5",
              "expected_text": "Кража сумки из припаркованного автомобиля по адресу: г. Москва, ул. Примерная, д. 7, двор.",
              "missing_facts": [
                "Кража сумки",
                "из припаркованного автомобиля"
              ],
              "contradictions": [],
              "audio_message_id": "a522ac66-4714-4384-95bd-4f1702c0c196",
              "incident_card_id": "edab67b2-ccfe-445c-8ddc-98abd60d46cc",
              "minimum_similarity": 0.8,
              "training_session_id": "f783ab9d-c5f7-4082-a08c-9b7c94808d3d"
            },
            "reason": "semantic_similarity_below_threshold",
            "expected": {
              "minimum_similarity": 0.8
            }
          },
          {
            "path": "service_handling.102.decision_deadline",
            "actual": "MISSED",
            "reason": "card_decision_deadline_missed",
            "expected": "ON_TIME"
          }
        ],
        "evaluated_at": "2026-09-29T09:54:40.072924Z"
      }
    }
  ],
  "incoming_calls": [],
  "outgoing_calls": [
    {
      "id": "181ab352-e554-4114-8b9f-c47edc21de25",
      "card_id": "edab67b2-ccfe-445c-8ddc-98abd60d46cc",
      "status": "COMPLETED",
      "started_at": "2026-09-29T09:48:12.340529Z",
      "completed_at": "2026-09-29T09:51:33.664741Z",
      "interlocutor_role": "COMMANDER"
    },
    {
      "id": "236e5504-7ef4-4f72-97cc-3b0162a7c247",
      "card_id": "d5b39188-bdd9-4ce5-b0aa-f10e28a32981",
      "status": "COMPLETED",
      "started_at": "2026-09-29T09:52:30.735848Z",
      "completed_at": "2026-09-29T09:53:25.533215Z",
      "interlocutor_role": "COMMANDER"
    }
  ],
  "call_utterances": [
    {
      "id": "164de1c6-2234-4b46-9244-c6a8433a2f52",
      "call_id": "181ab352-e554-4114-8b9f-c47edc21de25",
      "speaker": "RESPONSE_LEAD",
      "input_mode": "GENERATED",
      "sequence_no": 1,
      "created_at": "2026-09-29T09:48:12.320594Z",
      "text": "Руководитель бригады, слушаю вас."
    },
    {
      "id": "a522ac66-4714-4384-95bd-4f1702c0c196",
      "call_id": "181ab352-e554-4114-8b9f-c47edc21de25",
      "speaker": "OPERATOR",
      "input_mode": "VOICE",
      "sequence_no": 2,
      "created_at": "2026-09-29T09:50:48.097106Z",
      "text": "Здравствуйте. Э-э, по адресу: город Москва, улица Примерная, дом 7. Во дворе у заявителя"
    },
    {
      "id": "8a8d83fa-0cb4-4bc7-80c3-be32d67ad200",
      "call_id": "236e5504-7ef4-4f72-97cc-3b0162a7c247",
      "speaker": "RESPONSE_LEAD",
      "input_mode": "GENERATED",
      "sequence_no": 4,
      "created_at": "2026-09-29T09:52:30.706777Z",
      "text": "Руководитель бригады, слушаю вас."
    },
    {
      "id": "e00d9c04-6cbe-4712-8ba0-c63ffb43e8d3",
      "call_id": "236e5504-7ef4-4f72-97cc-3b0162a7c247",
      "speaker": "OPERATOR",
      "input_mode": "VOICE",
      "sequence_no": 5,
      "created_at": "2026-09-29T09:52:42.973651Z",
      "text": "По адресу: город Москва, улица Тренировочная, дом 5. На парковке столкнулись два автомобиля. Пострадавших нет, проезд свободен."
    },
    {
      "id": "c91d682e-ef2b-484a-a7a0-3e3282132de7",
      "call_id": "236e5504-7ef4-4f72-97cc-3b0162a7c247",
      "speaker": "RESPONSE_LEAD",
      "input_mode": "GENERATED",
      "sequence_no": 6,
      "created_at": "2026-09-29T09:52:43.892200Z",
      "text": "Поступило сообщение о столкновении двух автомобилей на парковке ул. Тренировочная, д. 5, Москва. Нет пострадавших, проезд свободен."
    },
    {
      "id": "f89b23da-1ebf-42a8-9b4f-a9f57db8ce53",
      "call_id": "236e5504-7ef4-4f72-97cc-3b0162a7c247",
      "speaker": "OPERATOR",
      "input_mode": "VOICE",
      "sequence_no": 7,
      "created_at": "2026-09-29T09:53:21.835497Z",
      "text": "Он говорит."
    }
  ],
  "actions": [
    {
      "id": "183e40fa-9445-4d61-be50-b58288f3b476",
      "training_session_id": "f783ab9d-c5f7-4082-a08c-9b7c94808d3d",
      "workspace_id": "df8b19a6-6701-48d4-9a03-0584293daf93",
      "actor_user_id": "11ba0c06-3acc-40b5-aca1-0472fe466cc5",
      "incident_card_id": null,
      "action_type": "SESSION_STARTED",
      "entity_type": "training_session",
      "entity_id": "f783ab9d-c5f7-4082-a08c-9b7c94808d3d",
      "occurred_at": "2026-09-29T09:47:24.899045Z",
      "result": "SUCCESS",
      "before_state": null,
      "after_state": null,
      "details": {
        "attempt_number": 1
      }
    },
    {
      "id": "f031a271-90da-443b-aae9-40e367766259",
      "training_session_id": "f783ab9d-c5f7-4082-a08c-9b7c94808d3d",
      "workspace_id": "df8b19a6-6701-48d4-9a03-0584293daf93",
      "actor_user_id": null,
      "incident_card_id": "edab67b2-ccfe-445c-8ddc-98abd60d46cc",
      "action_type": "CARD_RELEASED",
      "entity_type": "incident_card",
      "entity_id": "edab67b2-ccfe-445c-8ddc-98abd60d46cc",
      "occurred_at": "2026-09-29T09:47:30.407398Z",
      "result": "SUCCESS",
      "before_state": null,
      "after_state": {
        "version": 1,
        "card_number": "112-20260929-F630F4434F",
        "description": "Заявитель обнаружил пропажу сумки из припаркованного автомобиля. Нападения и пострадавших не было.",
        "event_type_id": null,
        "questionnaire": null,
        "victims_count": 0,
        "classification": {
          "record_id": 15020200,
          "group_code": 15,
          "routing_flags": {},
          "feature_1_code": 2,
          "feature_2_code": 2,
          "feature_3_code": 0,
          "final_incident_type": "Вскрыта автомашина",
          "excluded_service_codes": []
        },
        "current_status": "REGISTERED",
        "incident_address": "г. Москва, ул. Примерная, д. 7, двор",
        "reported_address": "г. Москва, ул. Примерная, д. 7",
        "applicant_full_name": null,
        "location_phone_number": null,
        "provided_phone_number": null,
        "automatic_phone_number": null
      },
      "details": {}
    },
    {
      "id": "e991c412-3bd5-4fe4-98a8-d5eb6b234e88",
      "training_session_id": "f783ab9d-c5f7-4082-a08c-9b7c94808d3d",
      "workspace_id": "df8b19a6-6701-48d4-9a03-0584293daf93",
      "actor_user_id": "11ba0c06-3acc-40b5-aca1-0472fe466cc5",
      "incident_card_id": "edab67b2-ccfe-445c-8ddc-98abd60d46cc",
      "action_type": "CARD_OPENED",
      "entity_type": "card_service",
      "entity_id": "43f31c17-5477-4084-8d63-6a87b6ee6d76",
      "occurred_at": "2026-09-29T09:47:40.023559Z",
      "result": "SUCCESS",
      "before_state": {
        "status": "ADDED"
      },
      "after_state": {
        "status": "RECEIVED"
      },
      "details": {
        "service_id": "b72dc844-82c4-53ef-9d45-d9924ba9a845",
        "opened_on_time": true
      }
    },
    {
      "id": "079a8911-cb3d-4161-a365-9cddbc83e9f0",
      "training_session_id": "f783ab9d-c5f7-4082-a08c-9b7c94808d3d",
      "workspace_id": "df8b19a6-6701-48d4-9a03-0584293daf93",
      "actor_user_id": "11ba0c06-3acc-40b5-aca1-0472fe466cc5",
      "incident_card_id": "edab67b2-ccfe-445c-8ddc-98abd60d46cc",
      "action_type": "OUTGOING_CALL_STARTED",
      "entity_type": "training_call",
      "entity_id": "181ab352-e554-4114-8b9f-c47edc21de25",
      "occurred_at": "2026-09-29T09:48:12.340529Z",
      "result": "SUCCESS",
      "before_state": null,
      "after_state": null,
      "details": {
        "scenario_item_key": "outgoing:edab67b2-ccfe-445c-8ddc-98abd60d46cc"
      }
    },
    {
      "id": "49b8ef86-2754-480d-9039-a304fd711356",
      "training_session_id": "f783ab9d-c5f7-4082-a08c-9b7c94808d3d",
      "workspace_id": "df8b19a6-6701-48d4-9a03-0584293daf93",
      "actor_user_id": null,
      "incident_card_id": "d5b39188-bdd9-4ce5-b0aa-f10e28a32981",
      "action_type": "CARD_RELEASED",
      "entity_type": "incident_card",
      "entity_id": "d5b39188-bdd9-4ce5-b0aa-f10e28a32981",
      "occurred_at": "2026-09-29T09:50:25.442328Z",
      "result": "SUCCESS",
      "before_state": null,
      "after_state": {
        "version": 1,
        "card_number": "112-20260929-4B061763CF",
        "description": "На парковке столкнулись два автомобиля. Пострадавших нет, проезд свободен.",
        "event_type_id": null,
        "questionnaire": null,
        "victims_count": 1,
        "classification": {
          "record_id": 2010000,
          "group_code": 2,
          "routing_flags": {},
          "feature_1_code": 1,
          "feature_2_code": 0,
          "feature_3_code": 0,
          "final_incident_type": "ДТП без пострадавших",
          "excluded_service_codes": []
        },
        "current_status": "REGISTERED",
        "incident_address": "г. Москва, ул. Тренировочная, д. 5, парковка",
        "reported_address": "г. Москва, ул. Тренировочная, д. 5",
        "applicant_full_name": null,
        "location_phone_number": null,
        "provided_phone_number": null,
        "automatic_phone_number": null
      },
      "details": {}
    },
    {
      "id": "4c30e19f-7307-470f-95d1-647d23c8d25a",
      "training_session_id": "f783ab9d-c5f7-4082-a08c-9b7c94808d3d",
      "workspace_id": "df8b19a6-6701-48d4-9a03-0584293daf93",
      "actor_user_id": null,
      "incident_card_id": "edab67b2-ccfe-445c-8ddc-98abd60d46cc",
      "action_type": "CARD_DECISION_DEADLINE_MISSED",
      "entity_type": "card_service",
      "entity_id": "43f31c17-5477-4084-8d63-6a87b6ee6d76",
      "occurred_at": "2026-09-29T09:50:40.179765Z",
      "result": "SUCCESS",
      "before_state": null,
      "after_state": null,
      "details": {
        "service_id": "b72dc844-82c4-53ef-9d45-d9924ba9a845",
        "deadline_at": "2026-09-29T09:50:40.004756+00:00"
      }
    },
    {
      "id": "48c94507-cc15-4aea-b90f-e6e41045cc24",
      "training_session_id": "f783ab9d-c5f7-4082-a08c-9b7c94808d3d",
      "workspace_id": "df8b19a6-6701-48d4-9a03-0584293daf93",
      "actor_user_id": "11ba0c06-3acc-40b5-aca1-0472fe466cc5",
      "incident_card_id": "edab67b2-ccfe-445c-8ddc-98abd60d46cc",
      "action_type": "AUDIO_MESSAGE_TRANSCRIBED",
      "entity_type": "audio_message",
      "entity_id": "a522ac66-4714-4384-95bd-4f1702c0c196",
      "occurred_at": "2026-09-29T09:50:48.097106Z",
      "result": "SUCCESS",
      "before_state": null,
      "after_state": null,
      "details": {
        "direction": "OUTBOUND",
        "transcript": "Здравствуйте. Э-э, по адресу: город Москва, улица Примерная, дом 7. Во дворе у заявителя",
        "sequence_no": 2,
        "audio_message_id": "a522ac66-4714-4384-95bd-4f1702c0c196",
        "training_call_id": "181ab352-e554-4114-8b9f-c47edc21de25"
      }
    },
    {
      "id": "25df7be7-28e1-44bd-aa5b-c90b93f5cf11",
      "training_session_id": "f783ab9d-c5f7-4082-a08c-9b7c94808d3d",
      "workspace_id": "df8b19a6-6701-48d4-9a03-0584293daf93",
      "actor_user_id": "11ba0c06-3acc-40b5-aca1-0472fe466cc5",
      "incident_card_id": "edab67b2-ccfe-445c-8ddc-98abd60d46cc",
      "action_type": "OUTBOUND_CALL_EVALUATION_REQUESTED",
      "entity_type": "audio_message",
      "entity_id": "a522ac66-4714-4384-95bd-4f1702c0c196",
      "occurred_at": "2026-09-29T09:50:49.579722Z",
      "result": "SUCCESS",
      "before_state": null,
      "after_state": null,
      "details": {
        "actual_text": "Здравствуйте. Э-э, по адресу: город Москва, улица Примерная, дом 7. Во дворе у заявителя",
        "sequence_no": 2,
        "expected_text": "Кража сумки из припаркованного автомобиля по адресу: г. Москва, ул. Примерная, д. 7, двор.",
        "audio_message_id": "a522ac66-4714-4384-95bd-4f1702c0c196",
        "minimum_similarity": 0.8
      }
    },
    {
      "id": "ebec7370-9199-4592-8398-c4853fca6c3a",
      "training_session_id": "f783ab9d-c5f7-4082-a08c-9b7c94808d3d",
      "workspace_id": "df8b19a6-6701-48d4-9a03-0584293daf93",
      "actor_user_id": null,
      "incident_card_id": "d5b39188-bdd9-4ce5-b0aa-f10e28a32981",
      "action_type": "CARD_OPEN_DEADLINE_MISSED",
      "entity_type": "card_service",
      "entity_id": "234985e7-a9c0-4189-a954-8f923de5e5c6",
      "occurred_at": "2026-09-29T09:50:55.991902Z",
      "result": "SUCCESS",
      "before_state": null,
      "after_state": {
        "status": "NOT_NOTIFIED"
      },
      "details": {
        "service_id": "b72dc844-82c4-53ef-9d45-d9924ba9a845",
        "deadline_at": "2026-09-29T09:50:55.448235+00:00"
      }
    },
    {
      "id": "79d93937-0e93-4def-9951-edd2309466a7",
      "training_session_id": "f783ab9d-c5f7-4082-a08c-9b7c94808d3d",
      "workspace_id": "df8b19a6-6701-48d4-9a03-0584293daf93",
      "actor_user_id": "11ba0c06-3acc-40b5-aca1-0472fe466cc5",
      "incident_card_id": "edab67b2-ccfe-445c-8ddc-98abd60d46cc",
      "action_type": "OUTBOUND_CALL_EVALUATED",
      "entity_type": "audio_message",
      "entity_id": "a522ac66-4714-4384-95bd-4f1702c0c196",
      "occurred_at": "2026-09-29T09:51:11.216602Z",
      "result": "REJECTED",
      "before_state": null,
      "after_state": null,
      "details": {
        "model": "gpt-oss-20b",
        "passed": false,
        "attempts": 1,
        "similarity": 0.6,
        "actual_text": "Здравствуйте. Э-э, по адресу: город Москва, улица Примерная, дом 7. Во дворе у заявителя",
        "explanation": "Адрес совпадает, но отсутствуют ключевые факты о краже сумки и припаркованном автомобиле.",
        "sequence_no": 2,
        "workspace_id": "df8b19a6-6701-48d4-9a03-0584293daf93",
        "actor_user_id": "11ba0c06-3acc-40b5-aca1-0472fe466cc5",
        "expected_text": "Кража сумки из припаркованного автомобиля по адресу: г. Москва, ул. Примерная, д. 7, двор.",
        "missing_facts": [
          "Кража сумки",
          "из припаркованного автомобиля"
        ],
        "contradictions": [],
        "audio_message_id": "a522ac66-4714-4384-95bd-4f1702c0c196",
        "incident_card_id": "edab67b2-ccfe-445c-8ddc-98abd60d46cc",
        "minimum_similarity": 0.8,
        "training_session_id": "f783ab9d-c5f7-4082-a08c-9b7c94808d3d"
      }
    },
    {
      "id": "bff08b81-b1cc-4c24-9c00-6df8f216007c",
      "training_session_id": "f783ab9d-c5f7-4082-a08c-9b7c94808d3d",
      "workspace_id": "df8b19a6-6701-48d4-9a03-0584293daf93",
      "actor_user_id": "11ba0c06-3acc-40b5-aca1-0472fe466cc5",
      "incident_card_id": "edab67b2-ccfe-445c-8ddc-98abd60d46cc",
      "action_type": "OUTGOING_CALL_COMPLETED",
      "entity_type": "training_call",
      "entity_id": "181ab352-e554-4114-8b9f-c47edc21de25",
      "occurred_at": "2026-09-29T09:51:33.664741Z",
      "result": "SUCCESS",
      "before_state": null,
      "after_state": null,
      "details": {
        "scenario_item_key": "outgoing:edab67b2-ccfe-445c-8ddc-98abd60d46cc"
      }
    },
    {
      "id": "d7ddd480-f9df-43e3-8e00-522dabf7bac6",
      "training_session_id": "f783ab9d-c5f7-4082-a08c-9b7c94808d3d",
      "workspace_id": "df8b19a6-6701-48d4-9a03-0584293daf93",
      "actor_user_id": "11ba0c06-3acc-40b5-aca1-0472fe466cc5",
      "incident_card_id": "edab67b2-ccfe-445c-8ddc-98abd60d46cc",
      "action_type": "CARD_ACCEPTED",
      "entity_type": "card_service",
      "entity_id": "43f31c17-5477-4084-8d63-6a87b6ee6d76",
      "occurred_at": "2026-09-29T09:52:06.923618Z",
      "result": "SUCCESS",
      "before_state": {
        "status": "RECEIVED"
      },
      "after_state": {
        "status": "ACCEPTED"
      },
      "details": {
        "comment": "Наряд № 2",
        "decision": "ACCEPTED",
        "service_id": "b72dc844-82c4-53ef-9d45-d9924ba9a845",
        "decided_on_time": false
      }
    },
    {
      "id": "1b8fb5a8-46f1-4e8c-a60f-ad4febc3bba0",
      "training_session_id": "f783ab9d-c5f7-4082-a08c-9b7c94808d3d",
      "workspace_id": "df8b19a6-6701-48d4-9a03-0584293daf93",
      "actor_user_id": "11ba0c06-3acc-40b5-aca1-0472fe466cc5",
      "incident_card_id": "d5b39188-bdd9-4ce5-b0aa-f10e28a32981",
      "action_type": "CARD_OPENED",
      "entity_type": "card_service",
      "entity_id": "234985e7-a9c0-4189-a954-8f923de5e5c6",
      "occurred_at": "2026-09-29T09:52:28.256269Z",
      "result": "SUCCESS",
      "before_state": {
        "status": "NOT_NOTIFIED"
      },
      "after_state": {
        "status": "RECEIVED"
      },
      "details": {
        "service_id": "b72dc844-82c4-53ef-9d45-d9924ba9a845",
        "opened_on_time": false
      }
    },
    {
      "id": "506fcff1-6fab-446a-84a7-50000bde86cc",
      "training_session_id": "f783ab9d-c5f7-4082-a08c-9b7c94808d3d",
      "workspace_id": "df8b19a6-6701-48d4-9a03-0584293daf93",
      "actor_user_id": "11ba0c06-3acc-40b5-aca1-0472fe466cc5",
      "incident_card_id": "d5b39188-bdd9-4ce5-b0aa-f10e28a32981",
      "action_type": "OUTGOING_CALL_STARTED",
      "entity_type": "training_call",
      "entity_id": "236e5504-7ef4-4f72-97cc-3b0162a7c247",
      "occurred_at": "2026-09-29T09:52:30.735848Z",
      "result": "SUCCESS",
      "before_state": null,
      "after_state": null,
      "details": {
        "scenario_item_key": "outgoing:d5b39188-bdd9-4ce5-b0aa-f10e28a32981"
      }
    },
    {
      "id": "313b3b28-2057-4996-b686-ab1dc51fff74",
      "training_session_id": "f783ab9d-c5f7-4082-a08c-9b7c94808d3d",
      "workspace_id": "df8b19a6-6701-48d4-9a03-0584293daf93",
      "actor_user_id": "11ba0c06-3acc-40b5-aca1-0472fe466cc5",
      "incident_card_id": "d5b39188-bdd9-4ce5-b0aa-f10e28a32981",
      "action_type": "AUDIO_MESSAGE_TRANSCRIBED",
      "entity_type": "audio_message",
      "entity_id": "e00d9c04-6cbe-4712-8ba0-c63ffb43e8d3",
      "occurred_at": "2026-09-29T09:52:42.973651Z",
      "result": "SUCCESS",
      "before_state": null,
      "after_state": null,
      "details": {
        "direction": "OUTBOUND",
        "transcript": "По адресу: город Москва, улица Тренировочная, дом 5. На парковке столкнулись два автомобиля. Пострадавших нет, проезд свободен.",
        "sequence_no": 5,
        "audio_message_id": "e00d9c04-6cbe-4712-8ba0-c63ffb43e8d3",
        "training_call_id": "236e5504-7ef4-4f72-97cc-3b0162a7c247"
      }
    },
    {
      "id": "0c8ee035-bc4b-4602-a693-1805abffe5b4",
      "training_session_id": "f783ab9d-c5f7-4082-a08c-9b7c94808d3d",
      "workspace_id": "df8b19a6-6701-48d4-9a03-0584293daf93",
      "actor_user_id": "11ba0c06-3acc-40b5-aca1-0472fe466cc5",
      "incident_card_id": "d5b39188-bdd9-4ce5-b0aa-f10e28a32981",
      "action_type": "OUTBOUND_CALL_EVALUATION_REQUESTED",
      "entity_type": "audio_message",
      "entity_id": "e00d9c04-6cbe-4712-8ba0-c63ffb43e8d3",
      "occurred_at": "2026-09-29T09:52:43.809962Z",
      "result": "SUCCESS",
      "before_state": null,
      "after_state": null,
      "details": {
        "actual_text": "По адресу: город Москва, улица Тренировочная, дом 5. На парковке столкнулись два автомобиля. Пострадавших нет, проезд свободен.",
        "sequence_no": 5,
        "expected_text": "ДТП двух автомобилей без пострадавших по адресу: г. Москва, ул. Тренировочная, д. 5, парковка.",
        "audio_message_id": "e00d9c04-6cbe-4712-8ba0-c63ffb43e8d3",
        "minimum_similarity": 0.8
      }
    },
    {
      "id": "b956d3eb-af05-40fb-8b19-f2c6ae2f31b5",
      "training_session_id": "f783ab9d-c5f7-4082-a08c-9b7c94808d3d",
      "workspace_id": "df8b19a6-6701-48d4-9a03-0584293daf93",
      "actor_user_id": "11ba0c06-3acc-40b5-aca1-0472fe466cc5",
      "incident_card_id": "d5b39188-bdd9-4ce5-b0aa-f10e28a32981",
      "action_type": "OUTBOUND_CALL_EVALUATED",
      "entity_type": "audio_message",
      "entity_id": "e00d9c04-6cbe-4712-8ba0-c63ffb43e8d3",
      "occurred_at": "2026-09-29T09:53:00.216847Z",
      "result": "SUCCESS",
      "before_state": null,
      "after_state": null,
      "details": {
        "model": "gpt-oss-20b",
        "passed": true,
        "attempts": 1,
        "similarity": 1.0,
        "actual_text": "По адресу: город Москва, улица Тренировочная, дом 5. На парковке столкнулись два автомобиля. Пострадавших нет, проезд свободен.",
        "explanation": "Все ключевые факты совпадают.",
        "sequence_no": 5,
        "workspace_id": "df8b19a6-6701-48d4-9a03-0584293daf93",
        "actor_user_id": "11ba0c06-3acc-40b5-aca1-0472fe466cc5",
        "expected_text": "ДТП двух автомобилей без пострадавших по адресу: г. Москва, ул. Тренировочная, д. 5, парковка.",
        "missing_facts": [],
        "contradictions": [],
        "audio_message_id": "e00d9c04-6cbe-4712-8ba0-c63ffb43e8d3",
        "incident_card_id": "d5b39188-bdd9-4ce5-b0aa-f10e28a32981",
        "minimum_similarity": 0.8,
        "training_session_id": "f783ab9d-c5f7-4082-a08c-9b7c94808d3d"
      }
    },
    {
      "id": "9d97ecbb-5d42-4529-9cdb-8fd6467a8511",
      "training_session_id": "f783ab9d-c5f7-4082-a08c-9b7c94808d3d",
      "workspace_id": "df8b19a6-6701-48d4-9a03-0584293daf93",
      "actor_user_id": "11ba0c06-3acc-40b5-aca1-0472fe466cc5",
      "incident_card_id": "d5b39188-bdd9-4ce5-b0aa-f10e28a32981",
      "action_type": "AUDIO_MESSAGE_TRANSCRIBED",
      "entity_type": "audio_message",
      "entity_id": "f89b23da-1ebf-42a8-9b4f-a9f57db8ce53",
      "occurred_at": "2026-09-29T09:53:21.835497Z",
      "result": "SUCCESS",
      "before_state": null,
      "after_state": null,
      "details": {
        "direction": "OUTBOUND",
        "transcript": "Он говорит.",
        "sequence_no": 7,
        "audio_message_id": "f89b23da-1ebf-42a8-9b4f-a9f57db8ce53",
        "training_call_id": "236e5504-7ef4-4f72-97cc-3b0162a7c247"
      }
    },
    {
      "id": "c62459be-b215-485d-80c1-0bfd7e602ef8",
      "training_session_id": "f783ab9d-c5f7-4082-a08c-9b7c94808d3d",
      "workspace_id": "df8b19a6-6701-48d4-9a03-0584293daf93",
      "actor_user_id": "11ba0c06-3acc-40b5-aca1-0472fe466cc5",
      "incident_card_id": "d5b39188-bdd9-4ce5-b0aa-f10e28a32981",
      "action_type": "OUTBOUND_CALL_EVALUATION_REQUESTED",
      "entity_type": "audio_message",
      "entity_id": "f89b23da-1ebf-42a8-9b4f-a9f57db8ce53",
      "occurred_at": "2026-09-29T09:53:22.578907Z",
      "result": "SUCCESS",
      "before_state": null,
      "after_state": null,
      "details": {
        "actual_text": "Он говорит.",
        "sequence_no": 7,
        "expected_text": "ДТП двух автомобилей без пострадавших по адресу: г. Москва, ул. Тренировочная, д. 5, парковка.",
        "audio_message_id": "f89b23da-1ebf-42a8-9b4f-a9f57db8ce53",
        "minimum_similarity": 0.8
      }
    },
    {
      "id": "b246a583-1f19-4e61-928b-142f5838183b",
      "training_session_id": "f783ab9d-c5f7-4082-a08c-9b7c94808d3d",
      "workspace_id": "df8b19a6-6701-48d4-9a03-0584293daf93",
      "actor_user_id": "11ba0c06-3acc-40b5-aca1-0472fe466cc5",
      "incident_card_id": "d5b39188-bdd9-4ce5-b0aa-f10e28a32981",
      "action_type": "OUTGOING_CALL_COMPLETED",
      "entity_type": "training_call",
      "entity_id": "236e5504-7ef4-4f72-97cc-3b0162a7c247",
      "occurred_at": "2026-09-29T09:53:25.533215Z",
      "result": "SUCCESS",
      "before_state": null,
      "after_state": null,
      "details": {
        "scenario_item_key": "outgoing:d5b39188-bdd9-4ce5-b0aa-f10e28a32981"
      }
    },
    {
      "id": "7f7574d6-e3a9-40a1-a57a-40b57a2e4819",
      "training_session_id": "f783ab9d-c5f7-4082-a08c-9b7c94808d3d",
      "workspace_id": "df8b19a6-6701-48d4-9a03-0584293daf93",
      "actor_user_id": "11ba0c06-3acc-40b5-aca1-0472fe466cc5",
      "incident_card_id": "d5b39188-bdd9-4ce5-b0aa-f10e28a32981",
      "action_type": "OUTBOUND_CALL_EVALUATED",
      "entity_type": "audio_message",
      "entity_id": "f89b23da-1ebf-42a8-9b4f-a9f57db8ce53",
      "occurred_at": "2026-09-29T09:53:30.572194Z",
      "result": "REJECTED",
      "before_state": null,
      "after_state": null,
      "details": {
        "model": "gpt-oss-20b",
        "passed": false,
        "attempts": 1,
        "similarity": 0.0,
        "actual_text": "Он говорит.",
        "explanation": "No relevant facts found.",
        "sequence_no": 7,
        "workspace_id": "df8b19a6-6701-48d4-9a03-0584293daf93",
        "actor_user_id": "11ba0c06-3acc-40b5-aca1-0472fe466cc5",
        "expected_text": "ДТП двух автомобилей без пострадавших по адресу: г. Москва, ул. Тренировочная, д. 5, парковка.",
        "missing_facts": [
          "ДТП двух автомобилей",
          "без пострадавших",
          "по адресу: г. Москва, ул. Тренировочная, д. 5, парковка"
        ],
        "contradictions": [],
        "audio_message_id": "f89b23da-1ebf-42a8-9b4f-a9f57db8ce53",
        "incident_card_id": "d5b39188-bdd9-4ce5-b0aa-f10e28a32981",
        "minimum_similarity": 0.8,
        "training_session_id": "f783ab9d-c5f7-4082-a08c-9b7c94808d3d"
      }
    },
    {
      "id": "e29c2c2d-f763-4ea5-9a3f-d2017c124019",
      "training_session_id": "f783ab9d-c5f7-4082-a08c-9b7c94808d3d",
      "workspace_id": "df8b19a6-6701-48d4-9a03-0584293daf93",
      "actor_user_id": "11ba0c06-3acc-40b5-aca1-0472fe466cc5",
      "incident_card_id": "d5b39188-bdd9-4ce5-b0aa-f10e28a32981",
      "action_type": "CARD_ACCEPTED",
      "entity_type": "card_service",
      "entity_id": "234985e7-a9c0-4189-a954-8f923de5e5c6",
      "occurred_at": "2026-09-29T09:54:29.920345Z",
      "result": "SUCCESS",
      "before_state": {
        "status": "RECEIVED"
      },
      "after_state": {
        "status": "ACCEPTED"
      },
      "details": {
        "comment": "Наряд № 7. комментарий 7",
        "decision": "ACCEPTED",
        "service_id": "b72dc844-82c4-53ef-9d45-d9924ba9a845",
        "decided_on_time": true
      }
    },
    {
      "id": "e7ed07b4-4836-4c41-9c72-54f70f758526",
      "training_session_id": "f783ab9d-c5f7-4082-a08c-9b7c94808d3d",
      "workspace_id": "df8b19a6-6701-48d4-9a03-0584293daf93",
      "actor_user_id": "11ba0c06-3acc-40b5-aca1-0472fe466cc5",
      "incident_card_id": null,
      "action_type": "SESSION_COMPLETED",
      "entity_type": "training_session",
      "entity_id": "f783ab9d-c5f7-4082-a08c-9b7c94808d3d",
      "occurred_at": "2026-09-29T09:54:40.153800Z",
      "result": "SUCCESS",
      "before_state": null,
      "after_state": null,
      "details": {
        "score": 54.16,
        "passed": false,
        "completed_automatically": false
      }
    }
  ]
};
