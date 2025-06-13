import { networks } from './networks';

export const getNetworkConfig = (network: 'testnet' | 'mainnet') => {
  const config = networks[network];
  return {
    CHAIN_ID: config.chainId,
    NODE_URL: config.nodeUrl,
    MASP_URL: config.maspUrl,
    NATIVE_TOKEN: config.nativeToken,
    STORAGE_PATH: "."
  };
};
