import { createRoot } from "react-dom/client";
import App from "./app/App";
import { BrowserRouter } from "react-router-dom";
import { ErrorBoundary } from "@/app/providers/error-boundary";
import { QueryProvider } from "@/app/providers/query-provider/QueryProvider";
import { MantineProvider } from "@mantine/core";
import { DatesProvider } from "@mantine/dates";
import { Notifications } from "@mantine/notifications";
import dayjs from "dayjs";
import customParseFormat from "dayjs/plugin/customParseFormat";
import "dayjs/locale/ru";
import "@mantine/core/styles.css";
import "@mantine/dates/styles.css";
import "@mantine/charts/styles.css";
import "@mantine/notifications/styles.css";
import "./app/styles/index.scss";

dayjs.extend(customParseFormat);

const container = document.getElementById("root");

if (container) {
  const root = createRoot(container);

  root.render(
    <MantineProvider>
      <DatesProvider settings={{ locale: "ru" }}>
        <Notifications position="bottom-right" limit={1} />
        <BrowserRouter>
          <ErrorBoundary>
            <QueryProvider>
              <App />
            </QueryProvider>
          </ErrorBoundary>
        </BrowserRouter>
      </DatesProvider>
    </MantineProvider>,
  );
} else {
  throw new Error(
    "Root element with ID 'root' was not found in the document. Ensure there is a corresponding HTML element with the ID 'root' in your HTML file.",
  );
}
