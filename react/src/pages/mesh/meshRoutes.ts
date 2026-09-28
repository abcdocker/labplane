export const meshRouteState = (approvedRoutes: string[] = [], availableRoutes: string[] = []) => {
  const approved = [...new Set(approvedRoutes.filter(Boolean))];
  const approvedSet = new Set(approved);
  const pending = [...new Set(availableRoutes.filter((route) => route && !approvedSet.has(route)))];
  return { approved, pending, approvalDraft: approved.join("\n") };
};
