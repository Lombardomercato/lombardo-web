import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "ymowgnjusqzkqjpwokib.supabase.co",
        port: "",
        pathname: "/storage/v1/object/public/product-media/**",
      },
    ],
  },
  async redirects() {
    return [
      { source: "/index.html", destination: "/", permanent: true },
      { source: "/pages/home", destination: "/", permanent: true },
      { source: "/tienda.html", destination: "/productos", permanent: true },
      { source: "/pages/tienda", destination: "/productos", permanent: true },
      { source: "/carta.html", destination: "/productos", permanent: true },
      {
        source: "/wine-tinder.html",
        destination: "/categorias/vinos",
        permanent: true,
      },
      {
        source: "/tinder-wine.html",
        destination: "/categorias/vinos",
        permanent: true,
      },
      {
        source: "/pages/wine-tinder",
        destination: "/categorias/vinos",
        permanent: true,
      },
      { source: "/sommelier.html", destination: "/guias", permanent: true },
      { source: "/pages/sommelier-ia", destination: "/guias", permanent: true },
      { source: "/experiencias.html", destination: "/guias", permanent: true },
      { source: "/pages/experiencias", destination: "/guias", permanent: true },
      { source: "/club.html", destination: "/guias", permanent: true },
      { source: "/pages/club", destination: "/guias", permanent: true },
      { source: "/contacto.html", destination: "/", permanent: true },
      { source: "/pages/contacto", destination: "/", permanent: true },
      {
        source: "/pasteleria.html",
        destination: "/categorias/gourmet",
        permanent: true,
      },
      {
        source: "/pages/pasteleria",
        destination: "/categorias/gourmet",
        permanent: true,
      },
      {
        source: "/empresas.html",
        destination: "/guias/regalos-empresariales-rosario",
        permanent: true,
      },
      {
        source: "/archive/empresas.html",
        destination: "/guias/regalos-empresariales-rosario",
        permanent: true,
      },
      {
        source: "/pages/empresas",
        destination: "/guias/regalos-empresariales-rosario",
        permanent: true,
      },
    ];
  },
  async headers() {
    const securityHeaders = [
      { key: "X-Content-Type-Options", value: "nosniff" },
      { key: "X-Frame-Options", value: "DENY" },
      { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
      {
        key: "Permissions-Policy",
        value: "camera=(), microphone=(), geolocation=()",
      },
    ];
    return [
      { source: "/:path*", headers: securityHeaders },
      {
        source: "/api/:path*",
        headers: [
          { key: "X-Robots-Tag", value: "noindex, nofollow, nosnippet" },
        ],
      },
      {
        source: "/admin/api/:path*",
        headers: [
          { key: "X-Robots-Tag", value: "noindex, nofollow, nosnippet" },
        ],
      },
    ];
  },
};

export default nextConfig;
