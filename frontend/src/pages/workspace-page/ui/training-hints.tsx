import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useQuery } from "@tanstack/react-query";
import { resolveClassification } from "@/entities/incident";
import {
  trainingApi,
  trainingKeys,
  type CardListItem,
  type EmergencyService,
  type IncomingCall,
  type LaunchContext,
} from "@/entities/training";
import type { OperatorCardEntry } from "../model/operator-cards";
import classes from "./training-hints.module.scss";

type HintTarget = { selector: string; message: string };
type Hint = { key: string; targets: HintTarget[]; delay: number };

function singleHint(
  key: string,
  selector: string,
  message: string,
  delay: number,
): Hint {
  return { key, targets: [{ selector, message }], delay };
}

function visibleRect(element: HTMLElement): DOMRect | null {
  const rect = element.getBoundingClientRect();
  let left = Math.max(0, rect.left);
  let right = Math.min(window.innerWidth, rect.right);
  let top = Math.max(0, rect.top);
  let bottom = Math.min(window.innerHeight, rect.bottom);
  for (
    let parent = element.parentElement;
    parent;
    parent = parent.parentElement
  ) {
    const style = window.getComputedStyle(parent);
    const bounds = parent.getBoundingClientRect();
    if (/(auto|scroll|hidden)/.test(style.overflowX)) {
      left = Math.max(left, bounds.left);
      right = Math.min(right, bounds.right);
    }
    if (/(auto|scroll|hidden)/.test(style.overflowY)) {
      top = Math.max(top, bounds.top);
      bottom = Math.min(bottom, bounds.bottom);
    }
  }
  return right > left && bottom > top
    ? new DOMRect(left, top, right - left, bottom - top)
    : null;
}

function operatorHint(
  calls: IncomingCall[],
  draft: OperatorCardEntry | null,
  cardOpen: boolean,
): Hint | null {
  const ringing = calls.find((call) => call.status === "RINGING");
  if (ringing && !cardOpen)
    return singleHint(
      `answer:${ringing.id}`,
      '[data-guidance="answer-call"]',
      "Поступил звонок. Нажмите «Принять», чтобы узнать о происшествии.",
      10000,
    );
  const call = calls.find(
    (item) =>
      (item.status === "ACTIVE" || item.status === "COMPLETED") &&
      !item.incident_card_id,
  );
  if (!call) return null;
  if (!cardOpen)
    return singleHint(
      `create:${call.id}`,
      '[data-tour="create-card"]',
      "Создайте карточку происшествия и записывайте ответы заявителя во время разговора.",
      15000,
    );
  if (!draft) return null;
  const values = draft.draft;
  const classified = resolveClassification(
    values.group,
    values.features,
    values.recordId,
  );
  const targets: HintTarget[] = [];
  if (!classified) {
    if (values.group) {
      targets.push({
        selector: '[data-guidance="incident-features"]',
        message:
          "Уточните у заявителя определяющие признаки и выберите их здесь.",
      });
    } else {
      targets.push(
        {
          selector: '[data-guidance="incident-type-block"]',
          message: "Спросите, что произошло, и выберите тип происшествия.",
        },
        {
          selector: '[data-guidance="quick-types"]',
          message: "Подходящий тип также можно выбрать из этих тегов.",
        },
      );
    }
  }
  if (!values.applicant.trim())
    targets.push({
      selector: '[data-guidance="applicant-input"]',
      message: "Спросите и укажите ФИО заявителя.",
    });
  if (
    !values.address.descriptive.trim() &&
    !(values.address.street.trim() && values.address.house.trim())
  ) {
    const addressTarget = values.address.street.trim()
      ? "address-house"
      : values.address.house.trim()
        ? "address-street"
        : "address-descriptive";
    targets.push({
      selector: `[data-guidance="${addressTarget}"]`,
      message: "Уточните адрес: улицу и дом либо описательный адрес.",
    });
  }
  if (!values.description.trim())
    targets.push({
      selector: '[data-guidance="description-input"]',
      message:
        "Расспросите о происшествии и запишите описание со слов заявителя.",
    });
  if (targets.length)
    return { key: `card-fields:${call.id}`, targets, delay: 30000 };
  if (call.status === "ACTIVE")
    return singleHint(
      `hang-up:${call.id}`,
      '[data-guidance="hang-up"]',
      "Все необходимые сведения получены. Завершите разговор, чтобы сохранить карточку.",
      30000,
    );
  return singleHint(
    `save:${call.id}`,
    '[data-tour="card-save"]',
    "Карточка заполнена, разговор завершён. Нажмите «Сохранить», чтобы перейти к следующему вызову.",
    30000,
  );
}

export function TrainingHints({
  ctx,
  enabled,
  active,
  calls,
  cards,
  selectedId,
  cardOpen,
  draft,
  directory,
}: {
  ctx: LaunchContext;
  enabled: boolean;
  active: boolean;
  calls: IncomingCall[];
  cards: CardListItem[];
  selectedId: string | null;
  cardOpen: boolean;
  draft: OperatorCardEntry | null;
  directory: EmergencyService[];
}) {
  const selectedCard = useQuery({
    queryKey: trainingKeys.card(ctx, selectedId ?? ""),
    queryFn: ({ signal }) => trainingApi.card(ctx, selectedId!, signal),
    enabled: enabled && active && ctx.mode === "DDS" && !!selectedId,
    staleTime: 5000,
    refetchOnWindowFocus: false,
    meta: { showGlobalError: false },
  });
  const outgoing = useQuery({
    queryKey: trainingKeys.outgoingCall(ctx, selectedId),
    queryFn: ({ signal }) => trainingApi.outgoingCall(ctx, selectedId!, signal),
    enabled: enabled && active && ctx.mode === "DDS" && !!selectedId,
    staleTime: 5000,
    refetchOnWindowFocus: false,
    meta: { showGlobalError: false },
  });
  let hint: Hint | null = null;
  if (enabled && active) {
    if (ctx.mode === "ARM112") hint = operatorHint(calls, draft, cardOpen);
    else if (!selectedId) {
      const next = cards.find((card) =>
        card.services_summary.some(
          (service) =>
            service.service_code === ctx.positionCode &&
            service.status !== "WORK_COMPLETED" &&
            service.status !== "WORK_REFUSED",
        ),
      );
      if (next)
        hint = singleHint(
          `open:${next.card_id}`,
          `[data-guidance-card="${next.card_id}"]`,
          "Поступила карточка. Откройте её, чтобы изучить сведения о происшествии.",
          20000,
        );
    } else if (
      selectedCard.data &&
      !selectedCard.isError &&
      !outgoing.isError
    ) {
      const call = outgoing.data;
      const own = selectedCard.data.services.find(
        (service) =>
          directory.some(
            (item) =>
              item.id === service.service_id && item.code === ctx.positionCode,
          ) && service.is_active,
      );
      if (!call) {
        hint = singleHint(
          `brigade:${selectedId}`,
          '[data-guidance="call-brigade"]',
          "Изучите адрес и описание карточки, затем позвоните бригаде. Сообщите тип происшествия, адрес и известные обстоятельства.",
          60000,
        );
      } else if (call.status === "COMPLETED" && own) {
        hint =
          own.current_status === "WORK_COMPLETED" ||
          own.current_status === "WORK_REFUSED"
            ? singleHint(
                `close:${selectedId}`,
                '[data-tour="card-close"]',
                "Работа с этой карточкой завершена. Закройте просмотр и переходите к следующей.",
                30000,
              )
            : ["ADDED", "NOT_NOTIFIED"].includes(own.current_status)
              ? null
              : singleHint(
                  `status:${selectedId}:${own.current_status}`,
                  '[data-guidance="service-status"]',
                  "После разговора отметьте статус службы. Обновляйте его по мере реагирования до «Работы завершены».",
                  30000,
                );
      }
    }
  }

  const [shown, setShown] = useState(false);
  const [positions, setPositions] = useState<
    (HintTarget & { rect: DOMRect })[]
  >([]);
  const key = hint?.key;
  const delay = hint?.delay;
  const targetsJson = JSON.stringify(hint?.targets ?? []);
  useEffect(() => {
    setShown(false);
    if (!key || !delay) return;
    let timeout: number;
    const schedule = () => {
      setShown(false);
      window.clearTimeout(timeout);
      timeout = window.setTimeout(() => setShown(true), delay);
    };
    const activity = (event: Event) => {
      if (event.type === "keydown" && (event as KeyboardEvent).key === "Tab")
        return;
      schedule();
    };
    schedule();
    document.addEventListener("pointerdown", activity, true);
    document.addEventListener("keydown", activity, true);
    document.addEventListener("input", activity, true);
    return () => {
      window.clearTimeout(timeout);
      document.removeEventListener("pointerdown", activity, true);
      document.removeEventListener("keydown", activity, true);
      document.removeEventListener("input", activity, true);
    };
  }, [key, delay]);
  useEffect(() => {
    if (!shown) return;
    const targets = (JSON.parse(targetsJson) as HintTarget[])
      .map((item) => ({
        ...item,
        element: key?.startsWith("status:")
          ? (document.querySelector<HTMLElement>(
              '[data-guidance="status-save"]:not(:disabled)',
            ) ??
            document.querySelector<HTMLElement>(
              '[data-guidance="status-select"]',
            ) ??
            document.querySelector<HTMLElement>(item.selector))
          : document.querySelector<HTMLElement>(item.selector),
      }))
      .filter(
        (item): item is HintTarget & { element: HTMLElement } =>
          !!item.element && !item.element.matches(":disabled"),
      );
    if (!targets.length) return;
    targets[0].element.scrollIntoView({ behavior: "smooth", block: "start" });
    const firstLeftField = targets.find(({ selector }) =>
      [
        '[data-guidance="applicant-input"]',
        '[data-guidance="address-street"]',
        '[data-guidance="address-house"]',
        '[data-guidance="address-descriptive"]',
        '[data-guidance="description-input"]',
      ].includes(selector),
    );
    if (firstLeftField && firstLeftField !== targets[0])
      firstLeftField.element.scrollIntoView({
        behavior: "smooth",
        block: "nearest",
      });
    const update = () =>
      setPositions(
        targets.flatMap(({ selector, message, element }) => {
          const rect = visibleRect(element);
          return rect ? [{ selector, message, rect }] : [];
        }),
      );
    update();
    window.addEventListener("scroll", update, true);
    window.addEventListener("resize", update);
    const interval = window.setInterval(update, 250);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener("scroll", update, true);
      window.removeEventListener("resize", update);
      setPositions([]);
    };
  }, [shown, targetsJson, key]);
  if (!shown || !hint || !positions.length) return null;
  const multiple = hint.targets.length > 1;
  return createPortal(
    <>
      {positions.map(({ selector, rect }) => (
        <div
          key={`highlight:${selector}`}
          className={classes.highlight}
          style={{
            top: rect.top,
            left: rect.left,
            width: rect.width,
            height: rect.height,
          }}
        />
      ))}
      {positions.map(({ selector, message, rect }) => {
        const above = multiple
          ? rect.top > 135
          : rect.bottom + 170 > window.innerHeight && rect.top > 170;
        return (
          <div
            key={selector}
            className={classes.bubble}
            data-multiple={multiple || undefined}
            role="status"
            style={{
              top: above ? rect.top - 10 : rect.bottom + 10,
              left: Math.max(
                8,
                Math.min(rect.left, window.innerWidth - (multiple ? 258 : 330)),
              ),
              transform: above ? "translateY(-100%)" : undefined,
            }}
          >
            {!multiple && <strong>Подсказка</strong>}
            <span>{message}</span>
          </div>
        );
      })}
    </>,
    document.body,
  );
}
