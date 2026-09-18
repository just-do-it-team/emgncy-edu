import { FC, Suspense } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import {
  routes,
  RouteNames,
} from "@/app/providers/router/config/route-config.ts";
import { Spinner } from "@/shared/ui/spinner.tsx";
import { Layout } from "@/app/layout/Layout.tsx";

const AppRouter: FC = () => {
  return (
    <Suspense fallback={<Spinner size={"large"} fullScreen />}>
      <Routes>
        {routes.map((route) => (
          <Route
            key={route.path}
            path={route.path}
            element={
              <Layout>
                <route.component />
              </Layout>
            }
          />
        ))}
        <Route
          path={RouteNames.NAVIGATE}
          element={<Navigate replace to={RouteNames.MAIN} />}
        />
      </Routes>
    </Suspense>
  );
};

export default AppRouter;
