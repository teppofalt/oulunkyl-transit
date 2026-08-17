import { createFileRoute } from "@tanstack/react-router";

import { TransitBoard } from "@/components/transit/TransitBoard";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Oulunkylä – junat ja ratikka 15 nyt" },
      {
        name: "description",
        content:
          "Oulunkylän lähtevät lähijunat ja pikaratikka 15 reaaliajassa: saapumisajat, myöhästymiset ja pysähtyneet vuorot yhdellä silmäyksellä.",
      },
      { property: "og:title", content: "Oulunkylä – junat ja ratikka 15 nyt" },
      {
        property: "og:description",
        content: "Oulunkylän lähtevät lähijunat ja pikaratikka 15 reaaliajassa: saapumisajat, myöhästymiset ja pysähtyneet vuorot yhdellä silmäyksellä.",
      },
      { name: "theme-color", content: "#101826" },
      { name: "application-name", content: "Oulunkylä Live" },
      { name: "mobile-web-app-capable", content: "yes" },
      { name: "apple-mobile-web-app-capable", content: "yes" },
      { name: "apple-mobile-web-app-status-bar-style", content: "black-translucent" },
      { name: "apple-mobile-web-app-title", content: "Oulunkylä" },
    ],
    links: [
      { rel: "manifest", href: "/manifest.webmanifest" },
      { rel: "apple-touch-icon", href: "/icons/icon-192.png" },
    ],
  }),
  component: Index,
});

function Index() {
  return <TransitBoard />;
}
