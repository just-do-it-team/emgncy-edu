import type { TeacherStudent } from "@/shared/api";

function normalize(value: string): string {
  return value.trim().toLocaleLowerCase("ru").replace(/ё/g, "е");
}

export function filterBySurname(students: TeacherStudent[], query: string): TeacherStudent[] {
  const needle = normalize(query);

  if (needle === "") return students;

  return students.filter((student) => {
    const [surname = ""] = normalize(student.displayName).split(/\s+/);

    return surname.startsWith(needle);
  });
}
