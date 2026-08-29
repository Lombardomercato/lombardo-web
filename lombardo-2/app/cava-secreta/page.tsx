import type { Metadata } from "next";
import { Footer } from "@/components/layout/Footer";
import { SecretCellarGame } from "@/components/secret-cellar/SecretCellarGame";
import { logCommerceError } from "@/lib/server/dev-commerce-logger";
import { createSecretCellarService } from "@/lib/server/secret-cellar/secret-cellar-service";
import styles from "./page.module.css";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "La Cava Secreta",
  description: "Hay una botella escondida. Seguí las pistas y encontrala.",
  alternates: { canonical: "/cava-secreta" },
  openGraph: {
    title: "LA CAVA SECRETA · LOMBARDO.",
    description: "La botella de hoy ya está escondida.",
    url: "/cava-secreta",
  },
  twitter: {
    card: "summary_large_image",
    title: "LA CAVA SECRETA · LOMBARDO.",
    description: "La botella de hoy ya está escondida.",
  },
};

export default async function SecretCellarPage() {
  let experience;
  try {
    experience = await createSecretCellarService().getPublicExperience();
  } catch (error) {
    logCommerceError("secret_cellar.challenge_failed", error, {
      route: "/cava-secreta",
    });
    experience = { enabled: false } as const;
  }

  return (
    <>
      <main className={styles.root}>
        <SecretCellarGame experience={experience} />
      </main>
      <Footer />
    </>
  );
}
