import { BlockList, isIP } from 'node:net';

export function parseCidr(cidr: string): {
  address: string;
  prefix: number;
  family: 'ipv4' | 'ipv6';
} {
  const [address = '', bits, extra] = cidr.split('/');
  const version = isIP(address);
  const prefix = Number(bits);
  if (
    !version ||
    bits === undefined ||
    !/^\d+$/.test(bits) ||
    extra !== undefined ||
    prefix < 0 ||
    prefix > (version === 4 ? 32 : 128)
  ) {
    throw new Error(`Invalid campus CIDR: ${cidr}`);
  }
  return { address, prefix, family: version === 4 ? 'ipv4' : 'ipv6' };
}

export function isCampusIp(ip: string | null | undefined, cidrs: readonly string[]): boolean {
  if (!ip) return false;
  // Express commonly reports IPv4 peers as IPv4-mapped IPv6 addresses.
  const address = ip.startsWith('::ffff:') && isIP(ip.slice(7)) === 4 ? ip.slice(7) : ip;
  const version = isIP(address);
  if (!version) return false;
  const list = new BlockList();
  for (const cidr of cidrs) {
    const subnet = parseCidr(cidr);
    list.addSubnet(subnet.address, subnet.prefix, subnet.family);
  }
  return list.check(address, version === 4 ? 'ipv4' : 'ipv6');
}
