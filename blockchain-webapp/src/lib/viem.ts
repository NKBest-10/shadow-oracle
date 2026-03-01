import { createPublicClient, http } from 'viem';

// JIBCHAIN L1 Configuration
export const jibchain = {
  id: 8899,
  name: 'JIBCHAIN L1',
  nativeCurrency: {
    decimals: 18,
    name: 'JBC',
    symbol: 'JBC',
  },
  rpcUrls: {
    default: { http: ['https://rpc-l1.jibchain.net'] }
  }
} as const;

export const client = createPublicClient({
  chain: jibchain,
  transport: http()
});
