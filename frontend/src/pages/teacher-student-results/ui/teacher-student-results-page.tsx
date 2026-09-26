import { useState } from "react";
import { Alert, Anchor, Skeleton, Stack, Text, TextInput } from "@mantine/core";
import { Link, useSearchParams } from "react-router-dom";
import { useSessionStore } from "@/entities/session";
import { useTeacherStudents } from "@/entities/student";
import { Button } from "@/shared/ui";
import { filterBySurname } from "../model/student-search";
import { AttemptsPanel } from "./attempts-panel";
import classes from "./student-results.module.scss";

const STUDENT_PARAM = "student";

function SectionBar({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className={classes.sectionBar}>
      <span className={classes.sectionTitle}>{title}</span>
      {hint && <span className={classes.sectionHint}>{hint}</span>}
    </div>
  );
}

function StudentResults({ teacherId }: { teacherId: string }) {
  const students = useTeacherStudents(teacherId);
  const [query, setQuery] = useState("");
  const [searchParams, setSearchParams] = useSearchParams();
  const selectedId = searchParams.get(STUDENT_PARAM);

  const select = (studentId: string) => {
    setSearchParams({ [STUDENT_PARAM]: studentId }, { replace: true });
  };

  if (students.isPending) {
    return (
      <div className={classes.screen}>
        <div className={classes.listColumn}>
          <SectionBar title="Обучающиеся" />
          <Stack gap="xs" p="sm">
            {[0, 1, 2, 3, 4, 5].map((row) => (
              <Skeleton key={row} height={34} radius={0} />
            ))}
          </Stack>
        </div>
        <div className={classes.attemptsColumn}>
          <SectionBar title="Попытки" />
        </div>
      </div>
    );
  }

  if (students.isError) {
    return (
      <Alert variant="outline" color="povDark2.6" title="Не удалось загрузить обучающихся">
        <Stack gap="xs" align="flex-start">
          <Text size="sm">Сервер не ответил. Повторите запрос позже.</Text>
          <Button size="xs" variant="outline" color="povDark2.6" onClick={() => students.refetch()}>
            Повторить
          </Button>
        </Stack>
      </Alert>
    );
  }

  const visible = filterBySurname(students.data, query);
  const selected = students.data.find((student) => student.id === selectedId) ?? null;

  return (
    <div className={classes.screen}>
      <div className={classes.listColumn}>
        <SectionBar title="Обучающиеся" hint={String(students.data.length)} />
        <div className={classes.search}>
          <TextInput
            size="sm"
            radius={0}
            label="Поиск по фамилии"
            value={query}
            onChange={(event) => setQuery(event.currentTarget.value)}
            autoComplete="off"
          />
        </div>
        <div className={classes.list}>
          {students.data.length === 0 && (
            <div className={classes.state}>
              У вас пока нет обучающихся.
              <div className={classes.stateHint}>
                Добавьте их в группу в разделе{" "}
                <Anchor component={Link} to="/teacher/groups" size="xs" c="povDark.6" underline="always">
                  «Группы»
                </Anchor>
                .
              </div>
            </div>
          )}
          {students.data.length > 0 && visible.length === 0 && (
            <div className={classes.state}>
              Нет обучающихся с такой фамилией.
              <div className={classes.stateHint}>Проверьте написание или очистите поиск.</div>
            </div>
          )}
          {visible.map((student) => (
            <button
              key={student.id}
              type="button"
              className={`${classes.student} ${student.id === selectedId ? classes.studentSelected : ""}`}
              aria-pressed={student.id === selectedId}
              onClick={() => select(student.id)}
            >
              <span className={classes.studentName}>{student.displayName}</span>
              <span className={classes.studentMeta}>
                {[student.groupNames.join(", ") || "без группы", student.isBlocked ? "заблокирован" : null]
                  .filter(Boolean)
                  .join("; ")}
              </span>
            </button>
          ))}
        </div>
      </div>

      <div className={classes.attemptsColumn}>
        <SectionBar title="Попытки" hint={selected?.displayName} />
        {selectedId === null && (
          <div className={classes.state}>
            Выберите обучающегося в списке слева.
            <div className={classes.stateHint}>
              Строка завершённой попытки открывает её разбор.
            </div>
          </div>
        )}
        {selectedId !== null && selected === null && (
          <div className={classes.state}>
            Обучающийся не найден среди ваших.
            <div className={classes.stateHint}>Выберите обучающегося в списке слева.</div>
          </div>
        )}
        {selected && <AttemptsPanel key={selected.id} studentId={selected.id} teacherId={teacherId} />}
      </div>
    </div>
  );
}

const TeacherStudentResultsPage = () => {
  const teacherId = useSessionStore((state) => state.profile?.userId ?? null);

  if (teacherId === null) return null;

  return <StudentResults teacherId={teacherId} />;
};

export default TeacherStudentResultsPage;
