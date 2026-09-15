export type TrustProxyFunction = (address: string, hop: number) => boolean;

/**
 * Confia somente a quantidade conhecida de proxies a partir do socket.
 * Zero desabilita X-Forwarded-For; dois representa ALB + CloudFront.
 */
export function trustProxyForHops(hops: number): false | TrustProxyFunction {
  if (!Number.isInteger(hops) || hops < 0 || hops > 2) {
    throw new Error("Invalid trusted proxy hop count.");
  }
  if (hops === 0) return false;
  return (_address, hop) => hop < hops;
}
