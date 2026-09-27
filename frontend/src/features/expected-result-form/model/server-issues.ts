import { failureOf, type LocMapper, type ServerFailure } from "@/entities/scenario";
import { errorDetail, errorStatus } from "@/shared/api";

export function serverFailure(error: unknown, mapLoc: LocMapper): ServerFailure {
  return failureOf(errorStatus(error), errorDetail(error), mapLoc);
}
