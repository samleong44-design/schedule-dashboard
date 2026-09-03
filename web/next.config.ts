import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Allow opening the dev server from other devices on the LAN.
  allowedDevOrigins: ["192.168.68.84"],
};

export default nextConfig;
