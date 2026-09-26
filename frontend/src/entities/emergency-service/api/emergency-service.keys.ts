export const emergencyServiceKeys = {
  all: ["emergency-services"] as const,
  directory: () => [...emergencyServiceKeys.all, "directory"] as const,
};
