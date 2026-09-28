import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Group,
  Modal,
  Pagination,
  Paper,
  PasswordInput,
  ScrollArea,
  Select,
  Stack,
  Table,
  Text,
  Textarea,
  TextInput,
} from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { Button } from "@/shared/ui";
import { handleApiError } from "@/shared/api";
import {
  adminGet,
  adminPatch,
  adminPost,
  type AdminRole,
  type AdminUser,
  type CreateUser,
  type Page,
  type PasswordPolicy,
} from "./api";
import { Empty, QueryState, Section, Status } from "./common";
import { dateTime } from "./format";

const roleOptions = [
  { value: "ADMINISTRATOR", label: "Администратор" },
  { value: "TEACHER", label: "Преподаватель" },
  { value: "STUDENT", label: "Обучающийся" },
];
const roleLabel = (role: AdminRole) =>
  roleOptions.find((item) => item.value === role)?.label ?? role;
const initialForm: CreateUser = {
  username: "",
  display_name: "",
  email: null,
  password: "",
  role: "STUDENT",
};

export function AdminUsersPage() {
  const client = useQueryClient();
  const [searchDraft, setSearchDraft] = useState("");
  const [search, setSearch] = useState("");
  const [role, setRole] = useState<string | null>(null);
  const [blocked, setBlocked] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState<CreateUser>(initialForm);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editRole, setEditRole] = useState<AdminRole>("STUDENT");
  const [blockUser, setBlockUser] = useState<AdminUser | null>(null);
  const [reason, setReason] = useState("");
  const params = {
    search: search || undefined,
    role: role || undefined,
    is_blocked: blocked === null ? undefined : blocked === "true",
    limit: 25,
    offset: (page - 1) * 25,
  };
  const users = useQuery({
    queryKey: ["admin", "users", params],
    queryFn: () => adminGet<Page<AdminUser>>("/users", params),
  });
  const detail = useQuery({
    queryKey: ["admin", "user", selectedId],
    enabled: !!selectedId,
    queryFn: () => adminGet<AdminUser>(`/users/${selectedId}`),
  });
  const policy = useQuery({
    queryKey: ["admin", "password-policy"],
    queryFn: () => adminGet<PasswordPolicy>("/security/policy"),
  });
  const refresh = () => {
    void client.invalidateQueries({ queryKey: ["admin", "users"] });
    void client.invalidateQueries({ queryKey: ["admin", "user"] });
  };
  const create = useMutation({
    mutationFn: () =>
      adminPost<AdminUser>("/users", {
        ...form,
        email: form.email?.trim() || null,
      }),
    onSuccess: () => {
      refresh();
      setCreateOpen(false);
      setForm(initialForm);
      notifications.show({ message: "Пользователь создан", color: "green" });
    },
    onError: (error) =>
      handleApiError(error, "Не удалось создать пользователя"),
  });
  const changeRole = useMutation({
    mutationFn: () =>
      adminPatch<AdminUser>(`/users/${selectedId}/role`, { role: editRole }),
    onSuccess: () => {
      refresh();
      notifications.show({ message: "Роль изменена", color: "green" });
    },
    onError: (error) => handleApiError(error, "Не удалось изменить роль"),
  });
  const changeBlock = useMutation({
    mutationFn: () =>
      adminPatch<AdminUser>(`/users/${blockUser?.id}/block`, {
        blocked: !blockUser?.is_blocked,
        reason: reason.trim() || null,
      }),
    onSuccess: () => {
      refresh();
      setBlockUser(null);
      setReason("");
      notifications.show({
        message: "Статус пользователя изменён",
        color: "green",
      });
    },
    onError: (error) => handleApiError(error, "Не удалось изменить статус"),
  });
  const applySearch = () => {
    setPage(1);
    setSearch(searchDraft.trim());
  };

  return (
    <Section
      title="Пользователи"
      action={
        <Button size="sm" onClick={() => setCreateOpen(true)}>
          Создать пользователя
        </Button>
      }
    >
      <Group align="end">
        <TextInput
          label="Поиск"
          placeholder="Логин, имя или email"
          value={searchDraft}
          onChange={(event) => setSearchDraft(event.currentTarget.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") applySearch();
          }}
        />
        <Button variant="outline" onClick={applySearch}>
          Найти
        </Button>
        <Select
          label="Роль"
          placeholder="Все"
          clearable
          data={roleOptions}
          value={role}
          onChange={(value) => {
            setRole(value);
            setPage(1);
          }}
        />
        <Select
          label="Статус"
          placeholder="Все"
          clearable
          data={[
            { value: "false", label: "Активные" },
            { value: "true", label: "Заблокированные" },
          ]}
          value={blocked}
          onChange={(value) => {
            setBlocked(value);
            setPage(1);
          }}
        />
      </Group>
      <QueryState
        pending={users.isPending}
        error={users.isError}
        onRetry={() => users.refetch()}
      />
      {users.data &&
        (users.data.items.length ? (
          <>
            <Paper withBorder>
              <ScrollArea>
                <Table striped highlightOnHover>
                  <Table.Thead>
                    <Table.Tr>
                      <Table.Th>Пользователь</Table.Th>
                      <Table.Th>Email</Table.Th>
                      <Table.Th>Роль</Table.Th>
                      <Table.Th>Статус</Table.Th>
                      <Table.Th>Последний вход</Table.Th>
                      <Table.Th></Table.Th>
                    </Table.Tr>
                  </Table.Thead>
                  <Table.Tbody>
                    {users.data.items.map((item) => (
                      <Table.Tr key={item.id}>
                        <Table.Td>
                          <Text fw={600}>{item.display_name}</Text>
                          <Text size="xs" c="dimmed">
                            {item.username}
                          </Text>
                        </Table.Td>
                        <Table.Td>{item.email || "—"}</Table.Td>
                        <Table.Td>{roleLabel(item.role)}</Table.Td>
                        <Table.Td>
                          <Status
                            value={item.is_blocked ? "blocked" : "enabled"}
                            label={item.is_blocked ? "Заблокирован" : "Активен"}
                          />
                        </Table.Td>
                        <Table.Td>{dateTime(item.last_login_at)}</Table.Td>
                        <Table.Td>
                          <Button
                            size="xs"
                            variant="subtle"
                            onClick={() => {
                              setSelectedId(item.id);
                              setEditRole(item.role);
                            }}
                          >
                            Открыть
                          </Button>
                        </Table.Td>
                      </Table.Tr>
                    ))}
                  </Table.Tbody>
                </Table>
              </ScrollArea>
            </Paper>
            <Group justify="space-between">
              <Text size="sm" c="dimmed">
                Всего: {users.data.total}
              </Text>
              <Pagination
                total={Math.max(1, Math.ceil(users.data.total / 25))}
                value={page}
                onChange={setPage}
              />
            </Group>
          </>
        ) : (
          <Empty text="Пользователи не найдены" />
        ))}

      <Modal
        opened={createOpen}
        onClose={() => setCreateOpen(false)}
        title="Новый пользователь"
        centered
      >
        <form
          onSubmit={(event) => {
            event.preventDefault();
            create.mutate();
          }}
        >
          <Stack gap="sm">
            <TextInput
              label="Логин"
              required
              minLength={3}
              maxLength={64}
              pattern="[A-Za-z0-9._-]+"
              value={form.username}
              onChange={(event) =>
                setForm({ ...form, username: event.currentTarget.value })
              }
            />
            <TextInput
              label="Имя"
              required
              maxLength={255}
              value={form.display_name}
              onChange={(event) =>
                setForm({ ...form, display_name: event.currentTarget.value })
              }
            />
            <TextInput
              type="email"
              label="Email"
              maxLength={320}
              value={form.email ?? ""}
              onChange={(event) =>
                setForm({ ...form, email: event.currentTarget.value })
              }
            />
            <Select
              label="Роль"
              data={roleOptions}
              value={form.role}
              allowDeselect={false}
              onChange={(value) =>
                setForm({ ...form, role: (value ?? "STUDENT") as AdminRole })
              }
            />
            <PasswordInput
              label="Пароль"
              required
              minLength={policy.data?.password_min_length ?? 8}
              maxLength={256}
              value={form.password}
              onChange={(event) =>
                setForm({ ...form, password: event.currentTarget.value })
              }
            />
            <Text size="xs" c="dimmed">
              {policy.data
                ? `Не менее ${policy.data.password_min_length} символов${policy.data.require_uppercase ? ", заглавная буква" : ""}${policy.data.require_lowercase ? ", строчная буква" : ""}${policy.data.require_digit ? ", цифра" : ""}${policy.data.require_special ? ", специальный символ" : ""}.`
                : "Пароль проверяется по текущей политике безопасности."}
            </Text>
            <Button type="submit" loading={create.isPending}>
              Создать
            </Button>
          </Stack>
        </form>
      </Modal>

      <Modal
        opened={!!selectedId}
        onClose={() => setSelectedId(null)}
        title="Карточка пользователя"
        centered
      >
        <QueryState
          pending={detail.isPending}
          error={detail.isError}
          onRetry={() => detail.refetch()}
        />
        {detail.data && (
          <Stack gap="sm">
            <Text fw={600}>
              {detail.data.display_name} ({detail.data.username})
            </Text>
            <Text size="sm">Email: {detail.data.email || "—"}</Text>
            <Text size="sm">Создан: {dateTime(detail.data.created_at)}</Text>
            <Text size="sm">Обновлён: {dateTime(detail.data.updated_at)}</Text>
            <Text size="sm">
              Последний вход: {dateTime(detail.data.last_login_at)}
            </Text>
            <Text size="sm">
              Блокировка: {dateTime(detail.data.blocked_at)}
            </Text>
            <Select
              label="Роль"
              data={roleOptions}
              value={editRole}
              allowDeselect={false}
              onChange={(value) =>
                setEditRole((value ?? detail.data!.role) as AdminRole)
              }
            />
            <Button
              disabled={editRole === detail.data.role}
              loading={changeRole.isPending}
              onClick={() => changeRole.mutate()}
            >
              Сохранить роль
            </Button>
            <Button
              color={detail.data.is_blocked ? "green" : "red"}
              variant="outline"
              onClick={() => {
                setBlockUser(detail.data!);
                setReason("");
              }}
            >
              {detail.data.is_blocked ? "Разблокировать" : "Заблокировать"}
            </Button>
          </Stack>
        )}
      </Modal>

      <Modal
        opened={!!blockUser}
        onClose={() => setBlockUser(null)}
        title={
          blockUser?.is_blocked
            ? "Разблокировать пользователя"
            : "Заблокировать пользователя"
        }
        centered
      >
        <Stack>
          <Text size="sm">{blockUser?.display_name}</Text>
          <Textarea
            label="Причина"
            maxLength={500}
            value={reason}
            onChange={(event) => setReason(event.currentTarget.value)}
          />
          <Button
            color={blockUser?.is_blocked ? "green" : "red"}
            loading={changeBlock.isPending}
            onClick={() => changeBlock.mutate()}
          >
            Подтвердить
          </Button>
        </Stack>
      </Modal>
    </Section>
  );
}
