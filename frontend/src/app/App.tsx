import type { FC } from "react";
import { AppProviders } from "./providers/app-providers";
import { AppRouter } from "./providers/router";

const App: FC = () => (
  <AppProviders>
    <AppRouter />
  </AppProviders>
);

export default App;
