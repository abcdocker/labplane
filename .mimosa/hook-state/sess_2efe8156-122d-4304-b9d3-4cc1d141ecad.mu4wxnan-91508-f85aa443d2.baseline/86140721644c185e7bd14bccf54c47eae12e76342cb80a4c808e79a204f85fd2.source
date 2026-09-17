/** 将相同协议+端口的行合并为一行，本地地址去重后用逗号拼接。 */
export type ListeningPortRow = { proto: string; local: string; port: number };

export function mergeListeningPortsByProtoPort(
  ports: ListeningPortRow[]
): { proto: string; port: number; locals: string }[] {
  const map = new Map<
    string,
    { proto: string; port: number; locals: Set<string> }
  >();
  for (const r of ports) {
    const k = `${r.proto}:${r.port}`;
    let ex = map.get(k);
    if (!ex) {
      ex = { proto: r.proto, port: r.port, locals: new Set() };
      map.set(k, ex);
    }
    ex.locals.add((r.local || "").trim() || "—");
  }
  return Array.from(map.values())
    .map((x) => ({
      proto: x.proto,
      port: x.port,
      locals: Array.from(x.locals).sort().join("，"),
    }))
    .sort((a, b) => a.port - b.port || a.proto.localeCompare(b.proto));
}
