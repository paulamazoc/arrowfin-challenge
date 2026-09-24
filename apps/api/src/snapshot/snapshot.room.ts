export function snapshotRoom(brokerId: string, traderId: string): string {
  return `broker:${brokerId}:trader:${traderId}`;
}
