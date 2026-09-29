import { MdDirectionsRun } from "react-icons/md";
import { ActionIcon } from "@/shared/ui";
import { useSignOut } from "../model/use-sign-out";

export function LogoutButton({ className }: { className?: string }) {
  const signOut = useSignOut();

  return (
    <ActionIcon className={className} aria-label="Выйти из профиля" title="Выйти из профиля" onClick={signOut}>
      <MdDirectionsRun size={14} aria-hidden="true" />
    </ActionIcon>
  );
}
