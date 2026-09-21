import { FC, Suspense } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { routes, RouteNames } from "../config/route-config";
import { navigation, roleLabels, type NavItem } from "@/shared/config";
import { SectionPlaceholder, Spinner } from "@/shared/ui";
import { Layout } from "../../../ui/layout";
import { WorkspacePage } from "@/pages/workspace-page";
import { LoginPage } from "@/pages/login-page";
import { AppShell } from "@/widgets/app-shell";
import { TeacherOverviewPage } from "@/pages/teacher-overview";
import { TeacherLessonsPage } from "@/pages/teacher-lessons";
import { TeacherLessonResultsPage } from "@/pages/teacher-lesson-results";
import { TeacherScenariosPage } from "@/pages/teacher-scenarios";
import { TeacherScenarioCardPage } from "@/pages/teacher-scenario-card";
import { TeacherGroupsPage } from "@/pages/teacher-groups";
import { TeacherAnalyticsPage } from "@/pages/teacher-analytics";
import { TeacherMaterialsPage } from "@/pages/teacher-materials";
import { TeacherAttemptReviewPage } from "@/pages/teacher-attempt-review";
import { StudentOverviewPage } from "@/pages/student-overview";
import { StudentResultsPage } from "@/pages/student-results";
import { useSessionStore, type UserRole } from "@/entities/session";

const roleNavigation: Record<UserRole, NavItem[]> = navigation;

const AppRouter: FC = () => {
  const role = useSessionStore((state) => state.role);
  const homePath = routes.find((route) => route.role === role)?.path ?? RouteNames.LOGIN;

  const guarded = (allowed: string, element: React.ReactNode) =>
    role === allowed ? element : <Navigate replace to={homePath} />;

  return (
    <Suspense fallback={<Spinner size={"large"} fullScreen />}>
      <Routes>
        <Route
          path={RouteNames.LOGIN}
          element={
            <Layout>
              <LoginPage />
            </Layout>
          }
        />

        <Route
          path="/teacher/attempts/:attemptId"
          element={guarded("teacher", <TeacherAttemptReviewPage />)}
        />
        <Route
          path="/student/attempts/:attemptId"
          element={guarded("student", <TeacherAttemptReviewPage />)}
        />
        <Route
          path="/student/arm"
          element={guarded(
            "student",
            <Layout>
              <WorkspacePage role="student" />
            </Layout>,
          )}
        />

        <Route
          path={RouteNames.TEACHER}
          element={guarded(
            "teacher",
            <AppShell items={roleNavigation.teacher} roleLabel={roleLabels.teacher} />,
          )}
        >
          <Route index element={<TeacherOverviewPage />} />
          <Route path="lessons" element={<TeacherLessonsPage />} />
          <Route path="lessons/:lessonId" element={<TeacherLessonResultsPage />} />
          <Route
            path="monitor/:lessonId"
            element={<SectionPlaceholder title="Монитор занятия" />}
          />
          <Route path="scenarios" element={<TeacherScenariosPage />} />
          <Route path="scenarios/:scenarioId" element={<TeacherScenarioCardPage />} />
          <Route path="groups" element={<TeacherGroupsPage />} />
          <Route path="analytics" element={<TeacherAnalyticsPage />} />
          <Route path="materials" element={<TeacherMaterialsPage />} />
          <Route path="*" element={<Navigate replace to={RouteNames.TEACHER} />} />
        </Route>

        <Route
          path={RouteNames.STUDENT}
          element={guarded(
            "student",
            <AppShell items={roleNavigation.student} roleLabel={roleLabels.student} />,
          )}
        >
          <Route index element={<StudentOverviewPage />} />
          <Route path="results" element={<StudentResultsPage />} />
          <Route path="progress" element={<SectionPlaceholder title="Прогресс" />} />
          <Route path="materials" element={<SectionPlaceholder title="Материалы" />} />
          <Route path="*" element={<Navigate replace to={RouteNames.STUDENT} />} />
        </Route>

        <Route
          path={RouteNames.ADMIN}
          element={guarded(
            "admin",
            <AppShell items={roleNavigation.admin} roleLabel={roleLabels.admin} />,
          )}
        >
          <Route index element={<SectionPlaceholder title="Администрирование" />} />
          <Route path="*" element={<Navigate replace to={RouteNames.ADMIN} />} />
        </Route>

        <Route
          path={RouteNames.NAVIGATE}
          element={<Navigate replace to={homePath} />}
        />
      </Routes>
    </Suspense>
  );
};

export default AppRouter;
