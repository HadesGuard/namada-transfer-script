import { getSdk } from "@namada/sdk/web";
import init from "@namada/sdk/web-init";
import { TransparentTransferProps, WrapperTxProps } from "@namada/types";
import BigNumber from "bignumber.js";

import {
  NODE_URL,
  NATIVE_TOKEN,
  CHAIN_ID,
  STORAGE_PATH,
  MASP_URL,
} from "./config";

const mnemonicPhrase = "elite security reunion friend vital clerk twice switch finger only raw uphold";

export const submitTransfer = async (): Promise<void> => {


  try {
    const { cryptoMemory } = await init();

    const sdk = getSdk(
      cryptoMemory,
      NODE_URL,
      MASP_URL,
      STORAGE_PATH,
      NATIVE_TOKEN,
    );

    const { keys, mnemonic, rpc, signing, tx } = sdk;

    const seed = mnemonic.toSeed(mnemonicPhrase);

    // Derive a keypair and address
    const bip44Path = {
      account: 0,
      change: 0,
      index: 0,
    };
    const { address, publicKey, privateKey } = keys.deriveFromSeed(
      seed,
      bip44Path
    );
    const isRevealed = await rpc.queryPublicKey(address);
    console.log("Is Revealed:", isRevealed);
    console.log("Address:", address);
    console.log("Public Key:", publicKey);
    console.log("Private Key:", privateKey);

    const now = new Date();
    // Set expiration to 1 Hour (this is also the default)
    now.setHours(now.getHours() + 1);
    const utcTimestamp = Math.floor(now.getTime() / 1000);

    const wrapperTxProps: WrapperTxProps = {
      token: NATIVE_TOKEN,
      feeAmount: BigNumber(1 * 10 ** -6),
      gasLimit: BigNumber(62500),
      chainId: CHAIN_ID,
      publicKey,
      memo: "Tom test",
      expiration: utcTimestamp,
      wrapperFeePayer: publicKey
    };

    // Check if public key is already revealed
    if(!isRevealed) {
      try {
        const revealPkTx = await tx.buildRevealPk(wrapperTxProps);
        const signedRevealPkTx = await signing.sign(revealPkTx, privateKey);
        const revealPkResponse = await rpc.broadcastTx(signedRevealPkTx);
        console.log("Reveal PK response:", revealPkResponse);
        
        // Wait a bit for reveal PK transaction to be processed
        await new Promise(resolve => setTimeout(resolve, 5000));
      } catch (error) {
        // If error contains "already revealed", skip reveal transaction
        if (error.toString().includes("already revealed")) {
          console.log("Public key already revealed, skipping reveal transaction");
        } else {
          throw error;
        }
      }
    }

    // Build the transfer transaction
    const transferProps: TransparentTransferProps = {
      data:[{
        source: address,
        target: "tnam1qrml8rckfqq09gd3g7mda7fe9pedm3695ytyaa6k",
        amount: BigNumber(10),
        token: NATIVE_TOKEN
      }]
    };

    const transferTxs = await tx.buildTransparentTransfer(
      wrapperTxProps,
      transferProps
    );

    // Sign and submit the transaction
    const signedTx = await signing.sign(transferTxs, privateKey);
    const result = await rpc.broadcastTx(signedTx);
    console.log("Transfer result:", result);

  } catch (error) {
    console.error("Error:", error);
  }
};

submitTransfer();
