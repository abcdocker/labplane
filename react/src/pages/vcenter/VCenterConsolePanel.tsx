import React from "react";
import { VCenterWebMKSConsole } from "./VCenterBastionConsoleEmbed";

const VCenterConsolePanel: React.FC<{ moref: string }> = ({ moref }) => {
  return (
    <VCenterWebMKSConsole
      moref={moref}
      className="h-[clamp(320px,calc(100dvh-10rem),760px)] w-full rounded-lg border border-slate-800 shadow-sm"
    />
  );
};

export default VCenterConsolePanel;
