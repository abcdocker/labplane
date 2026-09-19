import React from "react";
import { Outlet } from "react-router-dom";
import AppCenterSubNav from "@/components/AppCenterSubNav";

/** 应用中心子路由容器（Dashboard / Redis / 云主机），顶栏子导航。 */
const AppCenterLayout: React.FC = () => {
  return (
    <div className="mx-auto w-full max-w-[min(100%,80rem)] space-y-4 pb-2 sm:px-4 sm:pb-8 sm:pt-4 lg:px-8 lg:pb-10">
      <AppCenterSubNav />
      <Outlet />
    </div>
  );
};

export default AppCenterLayout;
