import React from "react";
import { Outlet } from "react-router-dom";

const BaotaLayout: React.FC = () => {
  return (
    <div className="mx-auto max-w-[1600px] pb-2 sm:pb-12">
      <Outlet />
    </div>
  );
};

export default BaotaLayout;
