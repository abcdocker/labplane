import { formatDistanceToNow } from "date-fns";
import { zhCN } from "date-fns/locale";

export function parseAge(iso: string) {
  try {
    return formatDistanceToNow(new Date(iso), { addSuffix: true, locale: zhCN });
  } catch {
    return iso;
  }
}
