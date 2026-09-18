import { useNavigate } from "react-router-dom";
import { MdDirectionsRun } from "react-icons/md";
import { useSessionStore } from "@/entities/session";
import { ActionIcon } from "@/shared/ui";

export function LogoutButton({ className }: { className?: string }) {
  const logout = useSessionStore((state) => state.logout);
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate("/login", { replace: true });
  };

  return (
    <ActionIcon
      className={className}
      aria-label="Выйти из профиля"
      title="Выйти из профиля"
      onClick={handleLogout}
    >
      <MdDirectionsRun size={14} aria-hidden="true" />
    </ActionIcon>
  );
}
