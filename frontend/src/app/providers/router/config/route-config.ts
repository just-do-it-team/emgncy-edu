import { MainPage } from "@/pages/main-page"

export enum RouteNames {
  MAIN = "/",
  NAVIGATE = "*",
}

export const routes = [{ path: RouteNames.MAIN, component: MainPage }]
