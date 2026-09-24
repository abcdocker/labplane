export type VmCaptureFinding = {
  id: number;
  sev: "high" | "mid" | "low" | "info";
  title: string;
  text: string;
  packetNo?: number;
  at: string;
};

export type VmCapturePreviewLine = {
  seq: number;
  proto: string;
  text: string;
};

export type VmCaptureKV = { key: string; count: number };

export type VmCaptureStatus = {
  name: string;
  status: "running" | "done" | "error";
  stopReason?: string;
  errText?: string;
  stderrTail?: string;
  vmName: string;
  moref: string;
  guestIp: string;
  bpf: string;
  iface: string;
  snaplen: number;
  maxMiB: number;
  durationSec: number;
  aiEnabled: boolean;
  startedAt: string;
  elapsedSec: number;
  packets: number;
  bytes: number;
  pps: number;
  riskScore: number;
  riskLevel: string;
  findings: VmCaptureFinding[];
  previewSeq: number;
  previewLines: VmCapturePreviewLine[];
  protoDist: VmCaptureKV[];
};

export type VmCaptureFileMeta = {
  name: string;
  moref: string;
  vmName?: string;
  guestIp?: string;
  bpf: string;
  iface: string;
  snaplen: number;
  startedAt: string;
  endedAt: string;
  durationSec: number;
  packets: number;
  bytes: number;
  status: string;
  stopReason?: string;
  errText?: string;
  riskScore: number;
  findings: VmCaptureFinding[];
  aiReady?: boolean;
  aiEnabled?: boolean;
};

export type VmCaptureListResponse = {
  running: VmCaptureStatus[];
  files: VmCaptureFileMeta[];
  usedBytes: number;
  quotaBytes: number;
  retainDays: number;
};

export type VmCapturePreflight = {
  checkedAt: string;
  sshOk: boolean;
  sshError?: string;
  guestIp?: string;
  rttMs?: number;
  tcpdumpOk: boolean;
  tcpdumpVersion?: string;
  sudoOk: boolean;
  aiReady: boolean;
  aiModel?: string;
  hint?: string;
};

export type VmCaptureInterpretLine = { level: "ok" | "warn" | "bad" | "info"; text: string };

export type VmCaptureInterpretResponse = {
  command: string;
  lines: VmCaptureInterpretLine[];
  aiUsed: boolean;
  aiError?: string;
};

export type VmCaptureStartRequest = {
  bpf: string;
  iface: string;
  snaplen: number;
  maxMiB: number;
  durationSec: number;
  aiEnabled: boolean;
  vmName: string;
};

export type VmCapturePacketRow = {
  no: number;
  tsRel: number;
  src: string;
  dst: string;
  srcPort?: number;
  dstPort?: number;
  proto: string;
  length: number;
  info: string;
};

export type VmCaptureEndpointStat = { endpoint: string; packets: number; bytes: number };

export type VmCaptureTreeField = { k: string; v: string };
export type VmCaptureTreeLayer = { layer: string; fields: VmCaptureTreeField[]; alert?: boolean };
export type VmCaptureHexLine = { off: number; hex: string[]; ascii: string };

export type VmCapturePacketDetail = {
  no: number;
  length: number;
  payloadOffset: number;
  tree: VmCaptureTreeLayer[];
  hex: VmCaptureHexLine[];
};

export type VmCaptureDecodeResult = {
  meta: {
    packets: number;
    capped: boolean;
    firstTs?: string;
    lastTs?: string;
    linkType: string;
    listLimit: number;
  };
  packets: VmCapturePacketRow[];
  protoDist: VmCaptureKV[];
  topTalkers: VmCaptureEndpointStat[];
  detail?: VmCapturePacketDetail;
};

export type VmCaptureAIReportFinding = {
  severity: "high" | "mid" | "low" | string;
  title: string;
  packetNo?: number;
  desc: string;
  fix?: string;
};

export type VmCaptureAIReport = {
  engine: string;
  score: number;
  level: string;
  summary: string;
  findings: VmCaptureAIReportFinding[];
  advice: { when: string; text: string }[];
  protoDist: VmCaptureKV[];
  topTalkers: VmCaptureEndpointStat[];
  dnsTop?: VmCaptureKV[];
  sniTop?: VmCaptureKV[];
  generatedAt: string;
  aiUsed: boolean;
  aiError?: string;
};

export type VmCaptureChatTurn = { role: "user" | "assistant"; content: string };
