import type { NextConfig } from "next";

// Acompanha LIMITE_TOTAL_ENVIO_BYTES (src/lib/arquivos.ts) com folga para o multipart.
const LIMITE_CORPO = "105mb";

const nextConfig: NextConfig = {
  experimental: {
    serverActions: { bodySizeLimit: LIMITE_CORPO },
    proxyClientMaxBodySize: LIMITE_CORPO,
  },
};

export default nextConfig;
