import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { LaunchContext } from "@/entities/training";
import classes from "./arm-onboarding.module.scss";

type Surface = "list" | "card";
type TourStep = { target: string; title: string; description: string };
type Spotlight = { top: number; left: number; right: number; bottom: number };

function tourSteps(mode: LaunchContext["mode"], surface: Surface): TourStep[] {
  const common = [
    {
      target: "finish-training",
      title: "Завершение занятия",
      description:
        "Здесь заканчивается учебная попытка. Если условия занятия ещё не выполнены, система предложит подтвердить досрочное завершение.",
    },
    {
      target: "connection-status",
      title: "Состояние связи",
      description:
        "Метка показывает, доступна ли связь с занятием и потоком событий. При потере связи она становится красной.",
    },
  ];

  if (surface === "list") {
    return [
      ...common,
      {
        target: "call-controls",
        title: mode === "DDS" ? "Звонок бригаде" : "Входящий звонок",
        description:
          mode === "DDS"
            ? "После открытия карточки здесь можно позвонить бригаде и следить за состоянием разговора."
            : "При входящем звонке здесь показываются его состояние, длительность и кнопка завершения разговора.",
      },
      ...(mode === "ARM112"
        ? [
            {
              target: "create-card",
              title: "Новая карточка",
              description:
                "После принятия звонка эта кнопка открывает карточку для записи сведений о происшествии.",
            },
          ]
        : []),
      {
        target: "incident-list",
        title: "Список карточек",
        description:
          "Здесь отображаются карточки происшествий занятия. В строках видны время, адрес и текущее состояние.",
      },
      {
        target: "open-card",
        title: "Просмотр карточки",
        description:
          "Нажмите значок карточки в строке, чтобы открыть подробности. После открытия можно снова запустить обучение для элементов карточки.",
      },
    ];
  }

  return [
    ...common,
    {
      target: "call-controls",
      title: mode === "DDS" ? "Связь с бригадой" : "Управление звонком",
      description:
        mode === "DDS"
          ? "Здесь запускается исходящий звонок бригаде и отображается ход разговора. После разговора отметьте результат в статусе службы."
          : "Во время входящего звонка здесь видны его состояние и действия для завершения разговора.",
    },
    {
      target: "card-header",
      title: "Данные карточки",
      description:
        "В верхней части показаны номер происшествия, время создания и сведения о рабочем месте.",
    },
    ...(mode === "ARM112"
      ? [
          {
            target: "card-applicant",
            title: "Заявитель",
            description:
              "Здесь записываются данные заявителя и сведения, которые он сообщил во время звонка.",
          },
        ]
      : []),
    {
      target: "card-description",
      title: "Описание происшествия",
      description:
        mode === "DDS"
          ? "Здесь служба читает адрес, сведения о заявителе и описание происшествия, переданное оператором."
          : "Опишите ситуацию со слов заявителя. Эти сведения сохранятся в карточке происшествия.",
    },
    {
      target: "card-classification",
      title: "Тип происшествия",
      description:
        mode === "DDS"
          ? "Здесь показан определённый тип происшествия и его классификация."
          : "Выберите тип происшествия и определяющие признаки. Они используются при сохранении карточки.",
    },
    {
      target: "card-services",
      title: "Службы реагирования",
      description:
        mode === "DDS"
          ? "Здесь видны назначенные службы и их статусы. Служба может открыть историю статусов и изменить свой статус через значок карандаша."
          : "Внизу показаны службы, назначенные карточке, и состояние их реагирования.",
    },
    ...(mode === "ARM112"
      ? [
          {
            target: "card-save",
            title: "Сохранение карточки",
            description:
              "После заполнения карточки нажмите «Сохранить». Кнопка доступна, когда обязательные сведения указаны.",
          },
        ]
      : []),
    {
      target: "card-close",
      title: "Вернуться к списку",
      description:
        "Эта кнопка закрывает просмотр карточки и возвращает к списку происшествий.",
    },
  ];
}

function findTarget(target: string) {
  return document.querySelector<HTMLElement>(`[data-tour="${target}"]`);
}

function spotlightFor(element: HTMLElement): Spotlight {
  const bounds = element.getBoundingClientRect();
  const padding = 8;
  const left = Math.max(
    8,
    Math.min(window.innerWidth - 8, bounds.left - padding),
  );
  const top = Math.max(
    8,
    Math.min(window.innerHeight - 8, bounds.top - padding),
  );
  return {
    left,
    top,
    right: Math.max(
      left,
      Math.min(window.innerWidth - 8, bounds.right + padding),
    ),
    bottom: Math.max(
      top,
      Math.min(
        window.innerHeight - 8,
        top + Math.min(bounds.height + padding * 2, window.innerHeight * 0.38),
      ),
    ),
  };
}

function tooltipPosition(spotlight: Spotlight | null, height: number) {
  const width = Math.min(360, window.innerWidth - 32);
  if (!spotlight)
    return {
      left: Math.max(16, (window.innerWidth - width) / 2),
      top: Math.max(16, (window.innerHeight - height) / 2),
    };

  const left = Math.min(
    Math.max(16, spotlight.left),
    window.innerWidth - width - 16,
  );
  if (spotlight.bottom + height + 12 < window.innerHeight)
    return { left, top: spotlight.bottom + 12 };
  if (spotlight.top - height - 12 > 0)
    return { left, top: spotlight.top - height - 12 };
  if (spotlight.right + width + 12 < window.innerWidth)
    return {
      left: spotlight.right + 12,
      top: Math.max(
        16,
        Math.min(spotlight.top, window.innerHeight - height - 16),
      ),
    };
  if (spotlight.left - width - 12 > 0)
    return {
      left: spotlight.left - width - 12,
      top: Math.max(
        16,
        Math.min(spotlight.top, window.innerHeight - height - 16),
      ),
    };
  return {
    left: window.innerWidth - width - 16,
    top: Math.max(16, window.innerHeight - height - 16),
  };
}

export function ArmOnboarding({
  mode,
  surface,
  onClose,
}: {
  mode: LaunchContext["mode"];
  surface: Surface;
  onClose: () => void;
}) {
  const steps = useMemo(
    () =>
      tourSteps(mode, surface).filter((step) => {
        const element = findTarget(step.target);
        if (!element) return false;
        const bounds = element.getBoundingClientRect();
        return bounds.width > 0 && bounds.height > 0;
      }),
    [mode, surface],
  );
  const [index, setIndex] = useState(0);
  const [spotlight, setSpotlight] = useState<Spotlight | null>(null);
  const [cardHeight, setCardHeight] = useState(250);
  const dialogRef = useRef<HTMLDivElement>(null);
  const step = steps[index];

  useLayoutEffect(() => {
    if (!step) return;
    const element = findTarget(step.target);
    if (!element) return;
    element.scrollIntoView({ block: "nearest", inline: "nearest" });
    const update = () => setSpotlight(spotlightFor(element));
    update();
    const observer = new ResizeObserver(update);
    observer.observe(element);
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
    };
  }, [step]);

  useLayoutEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    const update = () => setCardHeight(dialog.getBoundingClientRect().height);
    const observer = new ResizeObserver(update);
    observer.observe(dialog);
    update();
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const buttons = Array.from(
      dialogRef.current?.querySelectorAll("button") ?? [],
    );
    buttons[0]?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
      } else if (event.key === "ArrowRight") {
        event.preventDefault();
        if (index === steps.length - 1) onClose();
        else setIndex(index + 1);
      } else if (event.key === "ArrowLeft") {
        event.preventDefault();
        setIndex(Math.max(0, index - 1));
      } else if (event.key === "Tab" && buttons.length) {
        const first = buttons[0];
        const last = buttons[buttons.length - 1];
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener("keydown", onKeyDown, true);
    return () => document.removeEventListener("keydown", onKeyDown, true);
  }, [index, onClose, steps.length]);

  if (!step) return null;
  const position = tooltipPosition(spotlight, cardHeight);
  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;

  return createPortal(
    <div className={classes.root}>
      {spotlight ? (
        <>
          <div
            className={classes.shade}
            style={{
              left: 0,
              top: 0,
              width: viewportWidth,
              height: spotlight.top,
            }}
          />
          <div
            className={classes.shade}
            style={{
              left: 0,
              top: spotlight.top,
              width: spotlight.left,
              height: spotlight.bottom - spotlight.top,
            }}
          />
          <div
            className={classes.shade}
            style={{
              left: spotlight.right,
              top: spotlight.top,
              width: viewportWidth - spotlight.right,
              height: spotlight.bottom - spotlight.top,
            }}
          />
          <div
            className={classes.shade}
            style={{
              left: 0,
              top: spotlight.bottom,
              width: viewportWidth,
              height: viewportHeight - spotlight.bottom,
            }}
          />
          <div
            className={classes.spotlight}
            style={{
              left: spotlight.left,
              top: spotlight.top,
              width: spotlight.right - spotlight.left,
              height: spotlight.bottom - spotlight.top,
            }}
            aria-hidden="true"
          />
        </>
      ) : (
        <div className={classes.shade} style={{ inset: 0 }} />
      )}
      <div
        id="arm-onboarding-dialog"
        ref={dialogRef}
        className={classes.card}
        style={position}
        role="dialog"
        aria-modal="true"
        aria-labelledby="arm-onboarding-title"
        aria-describedby="arm-onboarding-description"
      >
        <div className={classes.topline}>
          <span>Обучение АРМ</span>
          <button type="button" className={classes.skip} onClick={onClose}>
            Пропустить
          </button>
        </div>
        <div className={classes.progressLabel}>
          Шаг {index + 1} из {steps.length}
        </div>
        <div className={classes.progress} aria-hidden="true">
          <span style={{ width: `${((index + 1) / steps.length) * 100}%` }} />
        </div>
        <h2 id="arm-onboarding-title">{step.title}</h2>
        <p id="arm-onboarding-description">{step.description}</p>
        <div className={classes.actions}>
          <button
            type="button"
            className={classes.back}
            disabled={index === 0}
            onClick={() => setIndex(index - 1)}
          >
            Назад
          </button>
          <button
            type="button"
            className={classes.next}
            onClick={() => {
              if (index === steps.length - 1) onClose();
              else setIndex(index + 1);
            }}
          >
            {index === steps.length - 1 ? "Готово" : "Далее"}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
