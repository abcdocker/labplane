/** 解析限速输入：空串视为 -1（不限速 / 删除配置） */
export function parseKafkaThrottleRate(s: string): number {
  const t = s.trim();
  if (t === "") return -1;
  const n = Number.parseInt(t, 10);
  return Number.isFinite(n) ? n : -1;
}

export type KafkaTopicThrottlePayload = {
  leaderReplicationThrottledRate: number;
  followerReplicationThrottledRate: number;
};

export function topicThrottleMatchesExpected(
  want: KafkaTopicThrottlePayload,
  got: KafkaTopicThrottlePayload
): boolean {
  return (
    want.leaderReplicationThrottledRate === got.leaderReplicationThrottledRate &&
    want.followerReplicationThrottledRate === got.followerReplicationThrottledRate
  );
}

export type KafkaQuotaRow = {
  user: string;
  producerByteRate: number;
  consumerByteRate: number;
};

/** 期望的生产/消费限速；-1 表示删除。若用户无记录，仅当两项均为 -1 时视为匹配。 */
export function userQuotaMatchesExpected(
  user: string,
  wantProd: number,
  wantCons: number,
  rows: KafkaQuotaRow[]
): boolean {
  const u = user.trim();
  const row = rows.find((r) => r.user === u);
  if (!row) {
    return wantProd === -1 && wantCons === -1;
  }
  return row.producerByteRate === wantProd && row.consumerByteRate === wantCons;
}

export function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
