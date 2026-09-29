import type { ReactNode } from "react";
import { Anchor, Checkbox, Skeleton } from "@mantine/core";
import {
  buildReviewBreakdown,
  discrepancyLabel,
  discrepancyValue,
  OUTBOUND_CALL_PATH,
  outboundVerdictRows,
  reasonLabels,
  reviewCriterionCodes,
  reviewNotices,
  type FindingGroup,
  type ReviewFinding,
  type ReviewNote,
  type Significance,
} from "@/entities/expert-review";
import type { EmergencyService, ParticipantRole } from "@/shared/api";
import { criterionLabels, type CriterionCode } from "@/shared/config";
import { charSpans } from "@/shared/lib";
import { significanceLabels } from "../model/review-labels";
import { formatOffset } from "../model/replay";
import type { FindingLocator } from "./element-review";
import classes from "./session-review.module.scss";

export type RoleState =
  | { status: "pending" }
  | { status: "error"; message: string; retry: () => void }
  | { status: "ready"; role: ParticipantRole };

const findingClass: Record<Significance, string> = {
  high: classes.findingHigh,
  medium: classes.findingMedium,
  low: "",
};

const changedClass: Record<Significance, string> = {
  high: classes.changedHigh,
  medium: classes.changedMedium,
  low: classes.changedLow,
};

function SectionBar({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className={classes.sectionBar}>
      <span className={classes.sectionTitle}>{title}</span>
      {hint && <span className={classes.sectionHint}>{hint}</span>}
    </div>
  );
}

function CompareValue({
  path,
  value,
  reference,
  significance,
  highlight,
}: {
  path: string;
  value: ReviewFinding["expected"];
  reference: ReviewFinding["expected"];
  significance: Significance;
  highlight: boolean;
}) {
  const text = discrepancyValue(path, value);
  const spans =
    highlight && typeof value === "string" && typeof reference === "string"
      ? charSpans(text, discrepancyValue(path, reference))
      : [{ text, changed: false }];

  return (
    <div className={classes.compareValue}>
      {spans.map((span, index) =>
        span.changed ? (
          <span key={index} className={changedClass[significance]}>
            {span.text}
          </span>
        ) : (
          <span key={index}>{span.text}</span>
        ),
      )}
    </div>
  );
}

export interface FindingDismissal {
  isDismissed: (path: string) => boolean;
  onChange: (path: string, dismissed: boolean) => void;
}

export interface ReviewGroup extends FindingGroup {
  evaluated: boolean;
}

/** Куда ведёт клик по расхождению: в журнал выбранного элемента или к другому элементу. */
interface FindingTarget {
  locator: FindingLocator | null;
  onOpen: (path: string) => void;
}

interface FindingRowProps {
  finding: ReviewFinding | ReviewNote;
  significance: Significance | null;
  formattingOnly: boolean;
  services: Map<string, EmergencyService> | undefined;
  target: FindingTarget;
  dismissal: FindingDismissal | null;
}

function Dismissible({ path, dismissal, children }: { path: string; dismissal: FindingDismissal | null; children: ReactNode }) {
  if (dismissal === null) return children;

  return (
    <div className={classes.findingGroup}>
      {children}
      <div className={classes.findingDismiss}>
        <Checkbox
          size="xs"
          label="Не считаю ошибкой"
          checked={dismissal.isDismissed(path)}
          onChange={(event) => dismissal.onChange(path, event.currentTarget.checked)}
        />
      </div>
    </div>
  );
}

function Clickable({
  path,
  className,
  target,
  children,
}: {
  path: string;
  className: string;
  target: FindingTarget;
  children: (footer: string) => ReactNode;
}) {
  if (target.locator === null) {
    return (
      <button type="button" className={className} onClick={() => target.onOpen(path)}>
        {children("показать в журнале элемента")}
      </button>
    );
  }

  const item = target.locator.locate(path);

  if (item === null) return <div className={className}>{children("момент заполнения в журнале не найден")}</div>;

  const { show } = target.locator;

  return (
    <button type="button" className={className} onClick={() => show(item)}>
      {children(`в журнале: ${formatOffset(item.offsetMs)}`)}
    </button>
  );
}

function FindingRow({ finding, significance, formattingOnly, services, target, dismissal }: FindingRowProps) {
  const marker = significance ?? "low";
  const reason = reasonLabels[finding.reason];
  const className = `${classes.finding} ${significance ? findingClass[significance] : ""}`;

  return (
    <Dismissible path={finding.path} dismissal={dismissal}>
      <Clickable path={finding.path} className={className} target={target}>
        {(footer) => (
          <>
            <div className={classes.findingHeader}>
              <span className={classes.findingTitle}>{discrepancyLabel(finding.path, services)}</span>
              {significance && <span className={classes.findingMeta}>{significanceLabels[significance]}</span>}
            </div>
            <div className={classes.compare}>
              <div>
                <div className={classes.cellLabel}>ожидалось</div>
                <CompareValue
                  path={finding.path}
                  value={finding.expected}
                  reference={finding.actual}
                  significance={marker}
                  highlight={!formattingOnly}
                />
              </div>
              <div>
                <div className={classes.cellLabel}>указано</div>
                <CompareValue
                  path={finding.path}
                  value={finding.actual}
                  reference={finding.expected}
                  significance={marker}
                  highlight={!formattingOnly}
                />
              </div>
            </div>
            {formattingOnly && <div className={classes.findingFooter}>{reviewNotices.formattingOnly}</div>}
            {reason && <div className={classes.findingFooter}>{reason}</div>}
            {"explanation" in finding && <div className={classes.findingFooter}>{finding.explanation}</div>}
            <div className={classes.findingFooter}>{footer}</div>
          </>
        )}
      </Clickable>
    </Dismissible>
  );
}

function VerdictBlock({
  group,
  target,
  dismissal,
}: {
  group: ReviewGroup;
  target: FindingTarget;
  dismissal: FindingDismissal | null;
}) {
  const { verdict } = group;

  if (verdict === null) return null;

  const reason = reasonLabels[group.discrepancies.find((item) => item.path === OUTBOUND_CALL_PATH)?.reason ?? ""];

  return (
    <>
      <div className={classes.groupTitle}>Доклад руководителю бригады — проверка моделью</div>
      <div className={classes.note}>{reviewNotices.modelEvaluation}</div>
      <Dismissible path={OUTBOUND_CALL_PATH} dismissal={dismissal}>
        <Clickable path={OUTBOUND_CALL_PATH} className={`${classes.finding} ${classes.findingMedium}`} target={target}>
          {(footer) => (
            <>
              <dl className={classes.verdict}>
                {outboundVerdictRows(verdict).map((row) => (
                  <div key={row.label} className={classes.verdictRow}>
                    <dt className={classes.cellLabel}>{row.label}</dt>
                    <dd className={classes.verdictValue}>{row.value}</dd>
                  </div>
                ))}
              </dl>
              {reason && <div className={classes.findingFooter}>{reason}</div>}
              <div className={classes.findingFooter}>{footer}</div>
            </>
          )}
        </Clickable>
      </Dismissible>
    </>
  );
}

interface GroupBodyProps {
  group: ReviewGroup;
  role: ParticipantRole;
  services: Map<string, EmergencyService> | undefined;
  target: FindingTarget;
  dismissal: FindingDismissal | null;
}

function GroupBody({ group, role, services, target, dismissal }: GroupBodyProps) {
  if (!group.evaluated) {
    return (
      <div className={classes.state}>
        Автоматическая проверка этого элемента не выполнена.
        <div className={classes.stateHint}>Проверка запускается после завершения попытки. Откройте разбор позже.</div>
      </div>
    );
  }

  const breakdown = buildReviewBreakdown(
    group.discrepancies.filter((item) => item.path !== OUTBOUND_CALL_PATH),
    role,
  );
  const criteria = breakdown.criteria.flatMap((review) =>
    review.applicable && review.findings.length > 0 ? [{ code: review.code, findings: review.findings }] : [],
  );
  const unassigned = [...breakdown.outsideRole, ...breakdown.unclassified];
  const rowProps = { services, target, dismissal };
  const empty =
    criteria.length === 0 &&
    group.verdict === null &&
    breakdown.notes.length === 0 &&
    breakdown.literalComments.length === 0 &&
    unassigned.length === 0;

  if (empty) return <div className={classes.note}>Расхождений с эталоном нет.</div>;

  return (
    <>
      {criteria.map((criterion) => (
        <div key={criterion.code}>
          <div className={classes.groupTitle}>
            {criterion.code} {criterionLabels[criterion.code]}
          </div>
          {criterion.findings.map((finding, index) => (
            <FindingRow
              key={`${finding.path}:${index}`}
              finding={finding}
              significance={finding.significance}
              formattingOnly={finding.formattingOnly}
              {...rowProps}
            />
          ))}
        </div>
      ))}
      <VerdictBlock group={group} target={target} dismissal={dismissal} />
      {unassigned.length > 0 && (
        <>
          <div className={classes.groupTitle}>Вне критериев роли — в балл роли не входит</div>
          {unassigned.map((finding, index) => (
            <FindingRow
              key={`${finding.path}:${index}`}
              finding={finding}
              significance={finding.significance}
              formattingOnly={finding.formattingOnly}
              {...rowProps}
            />
          ))}
        </>
      )}
      {breakdown.notes.length > 0 && (
        <>
          <div className={classes.groupTitle}>Сведения — не ошибки</div>
          {breakdown.notes.map((note, index) => (
            <FindingRow key={`${note.path}:${index}`} finding={note} significance={null} formattingOnly={false} {...rowProps} />
          ))}
        </>
      )}
      {breakdown.literalComments.length > 0 && (
        <>
          <div className={classes.groupTitle}>Комментарии — не оцениваются</div>
          <div className={classes.note}>{reviewNotices.literalComments}</div>
          {breakdown.literalComments.map((finding, index) => (
            <FindingRow
              key={`${finding.path}:${index}`}
              finding={finding}
              significance={finding.significance}
              formattingOnly={finding.formattingOnly}
              {...rowProps}
            />
          ))}
        </>
      )}
    </>
  );
}

function criterionCounts(groups: ReviewGroup[], role: ParticipantRole): Map<CriterionCode, number> {
  const counts = new Map<CriterionCode, number>(reviewCriterionCodes.map((code) => [code, 0]));

  for (const group of groups) {
    for (const review of buildReviewBreakdown(group.discrepancies, role).criteria) {
      if (review.applicable) counts.set(review.code, (counts.get(review.code) ?? 0) + review.findings.length);
    }
  }

  return counts;
}

interface ReviewFindingsProps {
  groups: ReviewGroup[];
  selectedKey: string | null;
  roleState: RoleState;
  services: Map<string, EmergencyService> | undefined;
  locator: FindingLocator;
  onOpen: (groupKey: string, path: string) => void;
  scopeNote: string | null;
  limitedNote: string | null;
  dismissalOf: (groupKey: string, title: string) => FindingDismissal | null;
}

export function ReviewFindings({
  groups,
  selectedKey,
  roleState,
  services,
  locator,
  onOpen,
  scopeNote,
  limitedNote,
  dismissalOf,
}: ReviewFindingsProps) {
  if (limitedNote) {
    return (
      <>
        <SectionBar title="Расхождения" />
        <div className={classes.state}>{limitedNote}</div>
      </>
    );
  }

  if (roleState.status === "pending") {
    return (
      <>
        <SectionBar title="Расхождения" />
        <Skeleton height={182} radius={0} />
      </>
    );
  }

  if (roleState.status === "error") {
    return (
      <>
        <SectionBar title="Расхождения" />
        <div className={classes.state}>
          {roleState.message}
          <div className={classes.stateHint}>
            Без роли нельзя определить применимые критерии.{" "}
            <Anchor component="button" size="xs" c="povDark.6" underline="always" onClick={roleState.retry}>
              Повторить запрос
            </Anchor>
          </div>
        </div>
      </>
    );
  }

  const { role } = roleState;
  const counts = criterionCounts(groups, role);
  const applicable = buildReviewBreakdown([], role).criteria;

  return (
    <>
      <SectionBar title="Критерии" hint="расхождений по всем элементам" />
      {scopeNote && <div className={classes.note}>{scopeNote}</div>}
      {applicable.map((review) => (
        <div
          key={review.code}
          className={`${classes.criterion} ${review.applicable ? "" : classes.criterionMuted}`}
          title={review.code === "C6" ? reviewNotices.unscoredCriterion : undefined}
        >
          <span>
            {review.code} {criterionLabels[review.code]}
          </span>
          {review.applicable ? (
            <span className={classes.criterionCount}>{counts.get(review.code) ?? 0}</span>
          ) : (
            <span>{reviewNotices.notApplicable}</span>
          )}
        </div>
      ))}
      <div className={classes.note}>{reviewNotices.significance}</div>

      {groups.length === 0 && <div className={classes.state}>В попытке нет карточек и звонков с эталоном.</div>}
      {groups.map((group) => {
        const selected = group.key === selectedKey;

        return (
          <section key={group.key} className={selected ? classes.groupSelected : undefined} aria-label={group.title}>
            <div className={classes.groupBar}>
              <span>{group.title}</span>
              {selected && <span className={classes.sectionHint}>журнал и диалог открыты</span>}
            </div>
            <GroupBody
              group={group}
              role={role}
              services={services}
              target={{ locator: selected ? locator : null, onOpen: (path) => onOpen(group.key, path) }}
              dismissal={dismissalOf(group.key, group.title)}
            />
          </section>
        );
      })}
    </>
  );
}
