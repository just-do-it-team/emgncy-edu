import { useState } from "react";
import { useForm } from "@mantine/form";
import { useLocation, useNavigate } from "react-router-dom";
import { useSessionStore } from "@/entities/session";
import { login } from "../api/login";
import { Button, Form, PasswordInput, TextInput } from "@/shared/ui";
import classes from "./login-form.module.scss";

interface LoginValues {
  username: string;
  password: string;
}

const inputClassNames = {
  root: classes.field,
  label: classes.label,
  input: classes.input,
  innerInput: classes.passwordInput,
  error: classes.error,
};

export const LoginForm = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const signIn = useSessionStore((state) => state.signIn);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const form = useForm<LoginValues>({
    initialValues: { username: "", password: "" },
    validate: {
      username: (value) => (value.trim() ? null : "Введите логин"),
      password: (value) => (value ? null : "Введите пароль"),
    },
    onValuesChange: () => setError(""),
  });

  const handleSubmit = async ({ username, password }: LoginValues) => {
    if (submitting) return;

    setSubmitting(true);
    try {
      const session = await login({ username: username.trim(), password });
      signIn(session);
      const returnTo = (location.state as { returnTo?: unknown } | null)?.returnTo;
      const resumeWorkspace =
        session.profile.role === "student" &&
        typeof returnTo === "string" &&
        (returnTo === "/student/arm" || returnTo.startsWith("/student/arm?"));
      navigate(resumeWorkspace ? returnTo : "/", { replace: true });
    } catch (e) {
      form.setFieldValue("password", "");
      setError(e instanceof Error ? e.message : "Не удалось войти. Повторите попытку.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Form
      form={form}
      className={classes.form}
      onSubmit={handleSubmit}
      noValidate
    >
      <TextInput
        {...form.getInputProps("username")}
        id="login"
        name="username"
        label="логин:"
        autoComplete="username"
        autoCapitalize="none"
        spellCheck={false}
        classNames={inputClassNames}
        error={form.errors.username || !!error}
        errorProps={{ role: "alert" }}
        withErrorStyles={false}
        withAsterisk={false}
        required
      />
      <PasswordInput
        {...form.getInputProps("password")}
        id="password"
        name="password"
        label="пароль:"
        autoComplete="current-password"
        classNames={inputClassNames}
        error={form.errors.password || error}
        errorProps={{ role: "alert" }}
        aria-invalid={!!form.errors.password || !!error}
        withErrorStyles={false}
        withAsterisk={false}
        rightSection={false}
        required
      />
      <Button
        className={classes.submit}
        type="submit"
        fullWidth
        disabled={submitting}
      >
        ВОЙТИ
      </Button>
    </Form>
  );
};
