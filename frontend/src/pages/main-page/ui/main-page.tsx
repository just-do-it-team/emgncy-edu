import { classNames } from "@/shared/lib/classNames/classNames";
import classes from "./main-page.module.scss";
import { Button } from "@mantine/core";

interface MainPageProps {
  className?: string;
}

const MainPage = ({ className }: MainPageProps) => (
  <div className={classNames(classes.MainPage, {}, [className])}>
    <Button>JustDoIt</Button>
  </div>
);

export default MainPage;
