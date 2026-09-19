import React from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import DnsDashboard from "./DnsDashboard";
import DnsAccounts from "./DnsAccounts";
import DnsDomains from "./DnsDomains";
import DnsRecords from "./DnsRecords";
import DnsFailover from "./DnsFailover";
import DnsScheduled from "./DnsScheduled";
import DnsCerts from "./DnsCerts";
import DnsSubNav from "./DnsSubNav";

const DnsLayout: React.FC = () => {
  return (
    <div className="w-full space-y-4">
      <DnsSubNav />
      <Routes>
        <Route index element={<DnsDashboard />} />
        <Route path="accounts" element={<DnsAccounts />} />
        <Route path="domains" element={<DnsDomains />} />
        <Route path="records" element={<DnsRecords />} />
        <Route path="failover" element={<DnsFailover />} />
        <Route path="scheduled" element={<DnsScheduled />} />
        <Route path="certs" element={<DnsCerts />} />
        <Route path="*" element={<Navigate to="/cluster/apps/dns" replace />} />
      </Routes>
    </div>
  );
};

export default DnsLayout;
