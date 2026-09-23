import type { ReactNode } from "react";
import { BrowserRouter } from "react-router-dom";
import { ErrorBoundary } from "./error-boundary";
import { QueryProvider } from "./query-provider/QueryProvider";
import { MantineProvider } from "@mantine/core";
import { cssVariablesResolver, theme } from "../styles/theme";
import { DatesProvider } from "@mantine/dates";
import { Notifications } from "@mantine/notifications";
import dayjs from "dayjs";
import customParseFormat from "dayjs/plugin/customParseFormat";
import "dayjs/locale/ru";
import "@fontsource/roboto/400.css";
import "@fontsource/roboto/500.css";
import "@fontsource/roboto/700.css";
import "@mantine/core/styles.css";
import "@mantine/dates/styles.css";
import "@mantine/charts/styles.css";
import "@mantine/notifications/styles.css";
import "../styles/index.scss";
import "./configure-api";
import "./configure-session";

dayjs.extend(customParseFormat);

export function AppProviders({ children }: { children: ReactNode }) {
  return (
    <MantineProvider theme={theme} cssVariablesResolver={cssVariablesResolver}>
      <DatesProvider settings={{ locale: "ru" }}>
        <Notifications position="bottom-right" limit={1} />
        <BrowserRouter>
          <ErrorBoundary>
            <QueryProvider>{children}</QueryProvider>
          </ErrorBoundary>
        </BrowserRouter>
      </DatesProvider>
    </MantineProvider>
  );
}
