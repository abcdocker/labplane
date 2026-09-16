import React from "react";
import { Apple, AppWindow, Boxes, Monitor, Server, Terminal } from "lucide-react";
import { cn } from "@/lib/utils";

export type BastionOsFamily =
  | "windows"
  | "ubuntu"
  | "debian"
  | "rhel"
  | "suse"
  | "amazon"
  | "photon"
  | "generic-linux"
  | "esxi"
  | "darwin"
  | "freebsd"
  | "other";

export type BastionOsInfo = {
  family: BastionOsFamily;
  /** 侧栏短标签 */
  label: string;
  iconClass: string;
  badgeClass: string;
};

function winLabel(g: string): string {
  if (/2025|next|vnext/i.test(g)) return "Win Srv 2025";
  if (/2022|windows9Server64Guest|windows2019srv|winLong/i.test(g)) return "Win Srv 2022";
  if (/2019|windows9Server/.test(g) && !/2016/.test(g)) return "Srv 2019";
  if (/2016/.test(g)) return "Srv 2016";
  if (/2012|r2/.test(g)) return "Srv 2012";
  if (/win11|windows11|windows10_64Guest.*11/i.test(g)) return "Windows 11";
  if (/win10|windows10|windows8|windows9/.test(g) && !/server/i.test(g)) return "Windows 10";
  if (/server|srv|datacenter|standard/i.test(g)) return "Windows Server";
  return "Windows";
}

function ubuntuLabel(g: string): string {
  if (/24/i.test(g)) return "Ubuntu 24.x";
  if (/22/i.test(g)) return "Ubuntu 22.x";
  if (/20/i.test(g)) return "Ubuntu 20.x";
  if (/18/i.test(g)) return "Ubuntu 18.x";
  return "Ubuntu";
}

/** 根据 vCenter guestId（如 ubuntu64Guest、windows9Server64Guest）推断系统族与展示标签 */
export function analyzeGuestOs(guestId?: string | null): BastionOsInfo {
  const raw = (guestId ?? "").trim();
  const g = raw.toLowerCase();

  if (!g) {
    return {
      family: "other",
      label: "未知",
      iconClass: "text-[#6e7681]",
      badgeClass: "bg-[#30363d]/80 text-[#8b949e]",
    };
  }

  if (/vmkernel|esx(i)?Guest|vmwareInfrastructure/i.test(g)) {
    return {
      family: "esxi",
      label: "ESXi",
      iconClass: "text-[#fbbf24]",
      badgeClass: "bg-[#b45309]/35 text-[#fcd34d]",
    };
  }

  if (/darwin|apple|macos|osx/i.test(g)) {
    return {
      family: "darwin",
      label: "macOS",
      iconClass: "text-[#d4d4d4]",
      badgeClass: "bg-[#525252]/40 text-[#e5e5e5]",
    };
  }

  if (/freebsd/i.test(g)) {
    return {
      family: "freebsd",
      label: "FreeBSD",
      iconClass: "text-[#c084fc]",
      badgeClass: "bg-[#6b21a8]/35 text-[#e9d5ff]",
    };
  }

  if (/win|microsoftwindows/i.test(g)) {
    return {
      family: "windows",
      label: winLabel(g),
      iconClass: "text-[#38bdf8]",
      badgeClass: "bg-[#1e40af]/45 text-[#93c5fd]",
    };
  }

  if (/ubuntu/i.test(g)) {
    return {
      family: "ubuntu",
      label: ubuntuLabel(g),
      iconClass: "text-[#fb923c]",
      badgeClass: "bg-[#9a3412]/40 text-[#fdba74]",
    };
  }

  if (/debian/i.test(g)) {
    return {
      family: "debian",
      label: "Debian",
      iconClass: "text-[#f472b6]",
      badgeClass: "bg-[#9d174d]/40 text-[#fbcfe8]",
    };
  }

  if (/rocky|alma|centos|rhel|redhat|red hat|oracleLinux|oraclelinux|almalinux|rockylinux/i.test(g)) {
    let label = "RHEL 系";
    if (/9|el9/i.test(g)) label = "RHEL 系 9.x";
    else if (/8|el8/i.test(g)) label = "RHEL 系 8.x";
    else if (/7|el7/i.test(g)) label = "RHEL 系 7.x";
    return {
      family: "rhel",
      label,
      iconClass: "text-[#f87171]",
      badgeClass: "bg-[#991b1b]/40 text-[#fecaca]",
    };
  }

  if (/suse|sles|opensuse/i.test(g)) {
    return {
      family: "suse",
      label: "SUSE",
      iconClass: "text-[#4ade80]",
      badgeClass: "bg-[#14532d]/45 text-[#bbf7d0]",
    };
  }

  if (/amazon|amzn|linux2|linux_2/i.test(g)) {
    return {
      family: "amazon",
      label: "Amazon Linux",
      iconClass: "text-[#fbbf24]",
      badgeClass: "bg-[#854d0e]/40 text-[#fde68a]",
    };
  }

  if (/photon/i.test(g)) {
    return {
      family: "photon",
      label: "Photon",
      iconClass: "text-[#22d3ee]",
      badgeClass: "bg-[#155e75]/45 text-[#a5f3fc]",
    };
  }

  if (
    /linux|otherGuest|otherLinux|other24x|other3x|fedora|coreos|kali|gentoo|arch|slackware|mandrake|turbo/i.test(
      g
    )
  ) {
    return {
      family: "generic-linux",
      label: "Linux",
      iconClass: "text-[#7ee787]",
      badgeClass: "bg-[#166534]/35 text-[#bbf7d0]",
    };
  }

  return {
    family: "other",
    label: "其他",
    iconClass: "text-[#8b949e]",
    badgeClass: "bg-[#30363d]/80 text-[#8b949e]",
  };
}

/** 额外主机 kind 字段 */
export function analyzeExtraOsKind(kind?: string | null): BastionOsInfo {
  const k = String(kind ?? "").toLowerCase();
  if (k === "windows") {
    return {
      family: "windows",
      label: "Windows",
      iconClass: "text-[#38bdf8]",
      badgeClass: "bg-[#1e40af]/45 text-[#93c5fd]",
    };
  }
  return {
    family: "generic-linux",
    label: "Linux",
    iconClass: "text-[#7ee787]",
    badgeClass: "bg-[#166534]/35 text-[#bbf7d0]",
  };
}

export function BastionOsGlyph({
  family,
  className,
}: {
  family: BastionOsFamily;
  className?: string;
}) {
  const cls = cn("size-3.5 shrink-0", className);
  switch (family) {
    case "windows":
      return <AppWindow className={cls} aria-hidden />;
    case "darwin":
      return <Apple className={cls} aria-hidden />;
    case "esxi":
      return <Boxes className={cls} aria-hidden />;
    case "other":
      return <Monitor className={cls} aria-hidden />;
    case "freebsd":
      return <Server className={cls} aria-hidden />;
    default:
      return <Terminal className={cls} aria-hidden />;
  }
}

export function BastionOsBadge({
  guestId,
  extraKind,
  className,
}: {
  guestId?: string | null;
  extraKind?: string | null;
  className?: string;
}) {
  const info = guestId != null && guestId !== "" ? analyzeGuestOs(guestId) : analyzeExtraOsKind(extraKind);
  return (
    <span
      className={cn(
        "inline-flex max-w-[min(140px,46vw)] shrink-0 items-center gap-1 rounded px-1 py-px text-[10px] font-semibold leading-none tracking-wide",
        info.badgeClass,
        className,
      )}
      title={guestId?.trim() || extraKind || info.label}
    >
      <BastionOsGlyph family={info.family} className={cn("size-3", info.iconClass)} />
      <span className="truncate">{info.label}</span>
    </span>
  );
}

/** 分组目录配色（按 group key 稳定映射） */
export type BastionGroupAccent = {
  border: string;
  chevron: string;
  headerBg: string;
  rowIdleBorder: string;
  rowHoverBg: string;
};

const GROUP_PALETTE: BastionGroupAccent[] = [
  {
    border: "border-l-indigo-400/85",
    chevron: "text-indigo-300/90",
    headerBg: "hover:bg-indigo-500/10",
    rowIdleBorder: "border-l-indigo-400/30",
    rowHoverBg: "hover:bg-indigo-500/[0.07]",
  },
  {
    border: "border-l-teal-400/85",
    chevron: "text-teal-300/90",
    headerBg: "hover:bg-teal-500/10",
    rowIdleBorder: "border-l-teal-400/30",
    rowHoverBg: "hover:bg-teal-500/[0.07]",
  },
  {
    border: "border-l-amber-400/85",
    chevron: "text-amber-300/90",
    headerBg: "hover:bg-amber-500/10",
    rowIdleBorder: "border-l-amber-400/30",
    rowHoverBg: "hover:bg-amber-500/[0.07]",
  },
  {
    border: "border-l-rose-400/85",
    chevron: "text-rose-300/90",
    headerBg: "hover:bg-rose-500/10",
    rowIdleBorder: "border-l-rose-400/30",
    rowHoverBg: "hover:bg-rose-500/[0.07]",
  },
  {
    border: "border-l-sky-400/85",
    chevron: "text-sky-300/90",
    headerBg: "hover:bg-sky-500/10",
    rowIdleBorder: "border-l-sky-400/30",
    rowHoverBg: "hover:bg-sky-500/[0.07]",
  },
  {
    border: "border-l-violet-400/85",
    chevron: "text-violet-300/90",
    headerBg: "hover:bg-violet-500/10",
    rowIdleBorder: "border-l-violet-400/30",
    rowHoverBg: "hover:bg-violet-500/[0.07]",
  },
  {
    border: "border-l-emerald-400/85",
    chevron: "text-emerald-300/90",
    headerBg: "hover:bg-emerald-500/10",
    rowIdleBorder: "border-l-emerald-400/30",
    rowHoverBg: "hover:bg-emerald-500/[0.07]",
  },
  {
    border: "border-l-orange-400/85",
    chevron: "text-orange-300/90",
    headerBg: "hover:bg-orange-500/10",
    rowIdleBorder: "border-l-orange-400/30",
    rowHoverBg: "hover:bg-orange-500/[0.07]",
  },
  {
    border: "border-l-cyan-400/85",
    chevron: "text-cyan-300/90",
    headerBg: "hover:bg-cyan-500/10",
    rowIdleBorder: "border-l-cyan-400/30",
    rowHoverBg: "hover:bg-cyan-500/[0.07]",
  },
  {
    border: "border-l-fuchsia-400/85",
    chevron: "text-fuchsia-300/90",
    headerBg: "hover:bg-fuchsia-500/10",
    rowIdleBorder: "border-l-fuchsia-400/30",
    rowHoverBg: "hover:bg-fuchsia-500/[0.07]",
  },
];

function hashString(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

export function bastionGroupAccent(groupKey: string): BastionGroupAccent {
  const i = hashString(groupKey) % GROUP_PALETTE.length;
  return GROUP_PALETTE[i]!;
}
