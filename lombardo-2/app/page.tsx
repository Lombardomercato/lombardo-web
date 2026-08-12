import type { Metadata } from "next";
import { FirstAct } from "@/components/home/FirstAct";
import styles from "./page.module.css";

export const metadata: Metadata = {
  alternates: { canonical: "/" },
};

export default function Home() {
  return (
    <main className={styles.home}>
      <FirstAct />
    </main>
  );
}
