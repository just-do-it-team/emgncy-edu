import { Suspense, type ReactElement } from "react";
import {
  AppShell as MantineAppShell,
  Box,
  Group,
  NavLink,
  Text,
  Title,
  Tooltip,
} from "@mantine/core";
import { useMediaQuery } from "@mantine/hooks";
import { LogOut, PanelLeftClose, PanelLeftOpen, UserRound } from "lucide-react";
import { Link, Outlet, useLocation, useNavigate } from "react-router-dom";
import { useSessionStore } from "@/entities/session";
import { ActionIcon, Spinner } from "@/shared/ui";
import { matchRouteTitle, type NavItem } from "@/shared/config";
import { useSidebarCollapsed } from "../model/sidebar";
import { Clock } from "./clock";
import classes from "./app-shell.module.scss";

interface AppShellProps {
  items: NavItem[];
  roleLabel: string;
}

const HEADER_HEIGHT = 56;
const SIDEBAR_WIDTH_EXPANDED = 240;
const SIDEBAR_WIDTH_COLLAPSED = 56;
const COMPACT_QUERY = "(max-width: 48em)";

interface CollapsibleProps {
  collapsed: boolean;
  label: string;
  children: ReactElement;
}

function CollapsibleTooltip({ collapsed, label, children }: CollapsibleProps) {
  if (!collapsed) return children;

  return (
    <Tooltip label={label} position="right" withArrow>
      {children}
    </Tooltip>
  );
}

function SidebarLink({
  item,
  active,
  collapsed,
}: {
  item: NavItem;
  active: boolean;
  collapsed: boolean;
}) {
  const Icon = item.icon;

  return (
    <CollapsibleTooltip collapsed={collapsed} label={item.label}>
      <NavLink
        component={Link}
        to={item.path}
        active={active}
        aria-label={item.label}
        label={collapsed ? undefined : item.label}
        leftSection={<Icon size={18} aria-hidden="true" />}
        classNames={{
          root: collapsed ? classes.linkCollapsed : classes.link,
          section: collapsed ? classes.linkIconCollapsed : undefined,
        }}
      />
    </CollapsibleTooltip>
  );
}

export function AppShell({ items, roleLabel }: AppShellProps) {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const logout = useSessionStore((state) => state.logout);
  const sidebar = useSidebarCollapsed();
  const compact = useMediaQuery(COMPACT_QUERY) ?? false;
  const collapsed = compact || sidebar.collapsed;
  const activeTitle = matchRouteTitle(pathname);

  const handleLogout = () => {
    logout();
    navigate("/login", { replace: true });
  };

  return (
    <MantineAppShell
      header={{ height: HEADER_HEIGHT }}
      navbar={{
        width: collapsed ? SIDEBAR_WIDTH_COLLAPSED : SIDEBAR_WIDTH_EXPANDED,
        breakpoint: 0,
      }}
      padding="md"
    >
      <MantineAppShell.Header bg="povLight2.6">
        <div className={classes.headerInner}>
          <Title order={1} size="h4" fw={600}>
            {activeTitle}
          </Title>
          <Box bg="povDark.6" className={classes.clockPlate}>
            <Clock />
          </Box>
        </div>
      </MantineAppShell.Header>

      <MantineAppShell.Navbar bg="povLight.6">
        <div className={classes.navbarInner}>
          {!compact && (
            <Group justify={collapsed ? "center" : "flex-end"} p={4}>
              <ActionIcon
                onClick={sidebar.toggle}
                aria-label={collapsed ? "Развернуть меню" : "Свернуть меню"}
              >
                {collapsed ? <PanelLeftOpen size={16} /> : <PanelLeftClose size={16} />}
              </ActionIcon>
            </Group>
          )}

          {items.map((item) => (
            <SidebarLink
              key={item.key}
              item={item}
              active={activeTitle === item.label}
              collapsed={collapsed}
            />
          ))}

          <div className={classes.spacer} />

          <CollapsibleTooltip collapsed={collapsed} label={roleLabel}>
            <Group
              gap={10}
              px={collapsed ? 0 : 12}
              py={8}
              wrap="nowrap"
              justify={collapsed ? "center" : "flex-start"}
            >
              <UserRound size={18} aria-hidden="true" />
              {!collapsed && (
                <Text size="sm" truncate>
                  {roleLabel}
                </Text>
              )}
            </Group>
          </CollapsibleTooltip>

          <CollapsibleTooltip collapsed={collapsed} label="Выход">
            <NavLink
              component="button"
              type="button"
              onClick={handleLogout}
              aria-label="Выход"
              label={collapsed ? undefined : "Выход"}
              leftSection={<LogOut size={18} aria-hidden="true" />}
              classNames={{
                root: collapsed ? classes.linkCollapsed : classes.link,
                section: collapsed ? classes.linkIconCollapsed : undefined,
              }}
            />
          </CollapsibleTooltip>
        </div>
      </MantineAppShell.Navbar>

      <MantineAppShell.Main>
        <Suspense fallback={<Spinner />}>
          <Outlet />
        </Suspense>
      </MantineAppShell.Main>
    </MantineAppShell>
  );
}
