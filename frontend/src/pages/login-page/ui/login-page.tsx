import { useState } from "react";
import { useForm } from "@mantine/form";
import { useNavigate } from "react-router-dom";
import { useAuthStore } from "@/shared/model/auth";
import { Button } from "@/shared/ui/button";
import { Form } from "@/shared/ui/form";
import { PasswordInput } from "@/shared/ui/password-input";
import { TextInput } from "@/shared/ui/text-input";
import classes from "./login-page.module.scss";

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

const LoginPage = () => {
  const navigate = useNavigate();
  const login = useAuthStore((state) => state.login);
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
    if (!login(username, password)) {
      setError("Неверный логин или пароль");
      return;
    }

    navigate("/", { replace: true });
  };

  return (
    <div className={classes.LoginPage}>
      <section className={classes.panel} aria-labelledby="login-title">
        <header className={classes.header}>
          <span className={classes.number}>112</span>
          <h1 id="login-title" className={classes.title}>
            ВХОД В СИСТЕМУ
          </h1>
        </header>

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

        <div className={classes.support}>
          <div>Техподдержка</div>
          <a className={classes.phone} href="tel:+74951978981">
            +7 (495) 197-89-81
          </a>
          <div>(многоканальный)</div>
          <a className={classes.email} href="mailto:hd-112@mos.ru">
            hd-112@mos.ru
          </a>
        </div>
      </section>
    </div>
  );
};

export default LoginPage;
