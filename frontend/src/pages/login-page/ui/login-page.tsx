import { LoginForm } from "@/features/auth";
import classes from "./login-page.module.scss";

const LoginPage = () => {
  return (
    <div className={classes.LoginPage}>
      <section className={classes.panel} aria-labelledby="login-title">
        <header className={classes.header}>
          <span className={classes.number}>112</span>
          <h1 id="login-title" className={classes.title}>
            ВХОД В СИСТЕМУ
          </h1>
        </header>

        <LoginForm />

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
