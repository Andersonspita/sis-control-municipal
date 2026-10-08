import type { NextConfig } from "next";

// Acompanha LIMITE_TOTAL_ENVIO_BYTES (src/lib/arquivos.ts) com folga para o multipart.
const LIMITE_CORPO = "105mb";

const nextConfig: NextConfig = {
  experimental: {
    serverActions: { bodySizeLimit: LIMITE_CORPO },
    proxyClientMaxBodySize: LIMITE_CORPO,
  },
  // O módulo Medidas passou a se chamar Alertas: links e favoritos antigos continuam funcionando.
  async redirects() {
    return [
      { source: "/medidas", destination: "/alertas", permanent: true },
      { source: "/medidas/:caminho*", destination: "/alertas/:caminho*", permanent: true },
      { source: "/relatorios/pdf/medidas", destination: "/relatorios/pdf/alertas", permanent: true },
    ];
  },
};

export default nextConfig;
