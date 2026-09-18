import { useState } from "react";
import { useForm } from "@mantine/form";
import { useNavigate } from "react-router-dom";
import { useSessionStore } from "@/entities/session";
import { getDemoAccountRole } from "../api/demo-login";
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
  const setRole = useSessionStore((state) => state.setRole);
  const [error, setError] = useState("");
  const form = useForm<LoginValues>({
    initialValues: { username: "", password: "" },
    validate: {
      username: (value) => (value.trim() ? null : "Введите логин"),
      password: (value) => (value ? null : "Введите пароль"),
    },
    onValuesChange: () => setError(""),
  });

  const handleSubmit = ({ username, password }: LoginValues) => {
    const role = getDemoAccountRole(username, password);
    if (!role) {
      setError("Неверный логин или пароль");
      return;
    }

    setRole(role);
    navigate("/", { replace: true });
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
      <Button className={classes.submit} type="submit" fullWidth>
        ВОЙТИ
      </Button>
    </Form>
  );
};
