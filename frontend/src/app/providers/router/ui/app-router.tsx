import { FC, Suspense } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import {
  routes,
  RouteNames,
} from "@/app/providers/router/config/route-config.ts";
import { Spinner } from "@/shared/ui/spinner.tsx";
import { Layout } from "@/app/layout/Layout.tsx";
import { WorkspacePage } from "@/pages/workspace-page";
import LoginPage from "@/pages/login-page/ui/login-page";
import { useAuthStore } from "@/shared/model/auth";

const AppRouter: FC = () => {
  const role = useAuthStore((state) => state.role);
  const homePath = routes.find((route) => route.role === role)?.path ?? RouteNames.LOGIN;

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
        {routes.map((route) => (
          <Route
            key={route.path}
            path={route.path}
            element={
              role === route.role ? (
                <Layout>
                  <WorkspacePage role={route.role} />
                </Layout>
              ) : (
                <Navigate replace to={homePath} />
              )
            }
          />
        ))}
        <Route
          path={RouteNames.NAVIGATE}
          element={<Navigate replace to={homePath} />}
        />
      </Routes>
    </Suspense>
  );
};

export default AppRouter;
