import { Anchor, Checkbox, Skeleton } from "@mantine/core";
import {
  buildReviewBreakdown,
  discrepancyLabel,
  discrepancyValue,
  reasonLabels,
  reviewNotices,
  type ReviewFinding,
  type ReviewNote,
  type Significance,
} from "@/entities/expert-review";
import type { AutomaticResult, EmergencyService, ParticipantRole } from "@/shared/api";
import { criterionLabels } from "@/shared/config";
import { charSpans } from "@/shared/lib";
import { significanceLabels } from "../model/review-labels";
import { formatOffset, type StreamItem } from "../model/replay";
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

interface FindingRowProps {
  finding: ReviewFinding | ReviewNote;
  significance: Significance | null;
  formattingOnly: boolean;
  services: Map<string, EmergencyService> | undefined;
  locate: (path: string) => StreamItem | null;
  onLocate: (item: StreamItem) => void;
  dismissal: FindingDismissal | null;
}

function FindingRow({
  finding,
  significance,
  formattingOnly,
  services,
  locate,
  onLocate,
  dismissal,
}: FindingRowProps) {
  const target = locate(finding.path);
  const marker = significance ?? "low";
  const reason = reasonLabels[finding.reason];
  const content = (
    <>
      <div className={classes.findingHeader}>
        <span className={classes.findingTitle} title={finding.path}>
          {discrepancyLabel(finding.path, services)}
        </span>
        {significance && (
          <span className={classes.findingMeta}>{significanceLabels[significance]}</span>
        )}
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
          <div className={classes.cellLabel}>получено</div>
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
      {"explanation" in finding && (
        <div className={classes.findingFooter}>{finding.explanation}</div>
      )}
      <div className={classes.findingFooter}>
        {target
          ? `в журнале: ${formatOffset(target.offsetMs)}`
          : "момент заполнения в журнале не найден"}
      </div>
    </>
  );
  const className = `${classes.finding} ${significance ? findingClass[significance] : ""}`;
  const row = target ? (
    <button type="button" className={className} onClick={() => onLocate(target)}>
      {content}
    </button>
  ) : (
    <div className={className}>{content}</div>
  );

  if (dismissal === null) return row;

  return (
    <div className={classes.findingGroup}>
      {row}
      <div className={classes.findingDismiss}>
        <Checkbox
          size="xs"
          label="Не считаю ошибкой"
          checked={dismissal.isDismissed(finding.path)}
          onChange={(event) => dismissal.onChange(finding.path, event.currentTarget.checked)}
        />
      </div>
    </div>
  );
}

interface ReviewFindingsProps {
  result: AutomaticResult | null;
  roleState: RoleState;
  services: Map<string, EmergencyService> | undefined;
  locate: (path: string) => StreamItem | null;
  onLocate: (item: StreamItem) => void;
  scopeNote: string | null;
  limitedNote: string | null;
  dismissal: FindingDismissal | null;
}

export function ReviewFindings({
  result,
  roleState,
  services,
  locate,
  onLocate,
  scopeNote,
  limitedNote,
  dismissal,
}: ReviewFindingsProps) {
  if (limitedNote) {
    return (
      <>
        <SectionBar title="Критерии" />
        <div className={classes.state}>{limitedNote}</div>
      </>
    );
  }

  if (result === null) {
    return (
      <>
        <SectionBar title="Критерии" />
        <div className={classes.state}>
          Автоматическая проверка этого элемента ещё не выполнена.
          <div className={classes.stateHint}>
            Проверка запускается после завершения попытки. Откройте разбор позже.
          </div>
        </div>
      </>
    );
  }

  if (roleState.status === "pending") {
    return (
      <>
        <SectionBar title="Критерии" />
        <Skeleton height={182} radius={0} />
      </>
    );
  }

  if (roleState.status === "error") {
    return (
      <>
        <SectionBar title="Критерии" />
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

  const breakdown = buildReviewBreakdown(result.discrepancies, roleState.role);
  const groups = breakdown.criteria.flatMap((review) =>
    review.applicable && review.findings.length > 0
      ? [{ code: review.code, findings: review.findings }]
      : [],
  );
  const unassigned = [...breakdown.outsideRole, ...breakdown.unclassified];
  const rowProps = { services, locate, onLocate, dismissal };

  return (
    <>
      <SectionBar title="Критерии" hint="найдено расхождений" />
      {scopeNote && <div className={classes.note}>{scopeNote}</div>}
      {breakdown.criteria.map((review) => (
        <div
          key={review.code}
          className={`${classes.criterion} ${review.applicable ? "" : classes.criterionMuted}`}
          title={review.code === "C6" ? reviewNotices.unscoredCriterion : undefined}
        >
          <span>
            {review.code} {criterionLabels[review.code]}
          </span>
          {review.applicable ? (
            <span className={classes.criterionCount}>{review.findings.length}</span>
          ) : (
            <span>{reviewNotices.notApplicable}</span>
          )}
        </div>
      ))}

      <SectionBar title="Расхождения" hint="по критериям" />
      <div className={classes.note}>{reviewNotices.significance}</div>
      {groups.length === 0 ? (
        <div className={classes.state}>
          По применимым критериям расхождений с эталоном нет.
          <div className={classes.stateHint}>Отдельные блоки ниже проверьте отдельно.</div>
        </div>
      ) : (
        groups.map((group) => (
          <div key={group.code}>
            <div className={classes.groupTitle}>
              {group.code} {criterionLabels[group.code]}
            </div>
            {group.findings.map((finding, index) => (
              <FindingRow
                key={`${finding.path}:${index}`}
                finding={finding}
                significance={finding.significance}
                formattingOnly={finding.formattingOnly}
                {...rowProps}
              />
            ))}
          </div>
        ))
      )}

      <SectionBar title="Сведения" hint="не ошибки" />
      {breakdown.notes.length === 0 ? (
        <div className={classes.note}>Расхождений в адресе происшествия, АОН и описании нет.</div>
      ) : (
        breakdown.notes.map((note, index) => (
          <FindingRow
            key={`${note.path}:${index}`}
            finding={note}
            significance={null}
            formattingOnly={false}
            {...rowProps}
          />
        ))
      )}

      <SectionBar title="Комментарии" hint="не оцениваются" />
      <div className={classes.note}>{reviewNotices.literalComments}</div>
      {breakdown.literalComments.length === 0 ? (
        <div className={classes.note}>Расхождений в комментариях нет.</div>
      ) : (
        breakdown.literalComments.map((finding, index) => (
          <FindingRow
            key={`${finding.path}:${index}`}
            finding={finding}
            significance={finding.significance}
            formattingOnly={finding.formattingOnly}
            {...rowProps}
          />
        ))
      )}

      <SectionBar title="Оценка модели" hint="не прямое соответствие" />
      <div className={classes.note}>{reviewNotices.modelEvaluation}</div>
      {breakdown.modelEvaluation.length === 0 ? (
        <div className={classes.note}>Расхождений по исходящему звонку нет.</div>
      ) : (
        breakdown.modelEvaluation.map((finding, index) => (
          <FindingRow
            key={`${finding.path}:${index}`}
            finding={finding}
            significance={finding.significance}
            formattingOnly={finding.formattingOnly}
            {...rowProps}
          />
        ))
      )}

      {unassigned.length > 0 && (
        <>
          <SectionBar title="Не отнесено" hint="вне критериев роли или без критерия" />
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
    </>
  );
}
