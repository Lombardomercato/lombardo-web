import { FirstAct } from "@/components/home/FirstAct";
import styles from "./page.module.css";

export default function Home() {
  return (
    <main className={styles.home}>
      <FirstAct />
    </main>
  );
}
