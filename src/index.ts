import { getSdk } from "@namada/sdk/web";
import init from "@namada/sdk/web-init";
import { TransparentTransferProps, WrapperTxProps } from "@namada/types";
import BigNumber from "bignumber.js";
import {
  getNetworkConfig
} from "./config";

async function submitTransfer(mnemonicPhrase: string, recipientAddress: string, amount: number | null, network: "testnet" | "mainnet"): Promise<any> {
  console.log("Submitting transfer for network:", network);
  const now = new Date();
  now.setHours(now.getHours() + 1);
  const utcTimestamp = Math.floor(now.getTime() / 1000);
  const { NODE_URL, MASP_URL, STORAGE_PATH, NATIVE_TOKEN, CHAIN_ID } = getNetworkConfig(network);
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

    const wrapperTxProps: WrapperTxProps = {
      token: NATIVE_TOKEN,
      feeAmount: BigNumber(1 * 10 ** -6),
      gasLimit: BigNumber(62500),
      chainId: CHAIN_ID,
      publicKey,
      memo: "Transfer via UI",
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
        if (!error.toString().includes("already revealed")) {
          throw error;
        }
      }
    }

    // Get balance if amount is null (transfer all)
    let transferAmount = amount;
    if (amount === null) {
      const balanceResult = await rpc.queryBalance(address, [NATIVE_TOKEN], CHAIN_ID);
      console.log("Balance result:", balanceResult);
      
      if (!balanceResult || balanceResult.length === 0) {
        throw new Error("Failed to get balance");
      }

      // Balance result format: [['token_address', 'amount']]
      const balance = balanceResult[0][1]; // Get the amount string
      console.log("Balance amount:", balance);
      
      // Convert balance to number and subtract fee
      transferAmount = Number(balance) - (wrapperTxProps.feeAmount.toNumber() * wrapperTxProps.gasLimit.toNumber()) * 10**6;
      console.log("Transfer amount after fee:", transferAmount);
      
      if (transferAmount <= 0) {
        throw new Error("Insufficient balance for transfer");
      }
    }

    // Build the transfer transaction
    const transferProps: TransparentTransferProps = {
      data:[{
        source: address,
        target: recipientAddress,
        amount: BigNumber(transferAmount/10**6),
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
    return result;
  } catch (error) {
    console.error("Error:", error);
    throw error;
  }
}

// UI Handling
document.addEventListener('DOMContentLoaded', () => {
  const mnemonicsInput = document.getElementById('mnemonics') as HTMLTextAreaElement;
  const recipientInput = document.getElementById('recipient') as HTMLInputElement;
  const amountInput = document.getElementById('amount') as HTMLInputElement;
  const transferAllCheckbox = document.getElementById('transferAll') as HTMLInputElement;
  const transferBtn = document.getElementById('transferBtn') as HTMLButtonElement;
  const statusDiv = document.getElementById('status') as HTMLDivElement;
  const progressDiv = document.getElementById('progress') as HTMLDivElement;
  const networkSelect = document.getElementById('network') as HTMLSelectElement;
  let network = localStorage.getItem('selectedNetwork') as "testnet" | "mainnet" || "mainnet";
  networkSelect.value = network;

  // Update network when changed
  networkSelect.addEventListener('change', () => {
    network = networkSelect.value as "testnet" | "mainnet";
    localStorage.setItem('selectedNetwork', network);
  });

  // Disable amount input when transfer all is checked
  transferAllCheckbox.addEventListener('change', () => {
    amountInput.disabled = transferAllCheckbox.checked;
  });

  transferBtn.addEventListener('click', async () => {
    const mnemonics = mnemonicsInput.value.trim().split('\n').filter(m => m.trim());
    const recipient = recipientInput.value.trim();
    const amount = transferAllCheckbox.checked ? null : parseFloat(amountInput.value);

    if (mnemonics.length === 0 || !recipient || (!transferAllCheckbox.checked && isNaN(amount))) {
      statusDiv.textContent = 'Please fill in all fields correctly';
      statusDiv.className = 'status error';
      return;
    }

    try {
      transferBtn.disabled = true;
      statusDiv.textContent = `Processing ${mnemonics.length} transfers...`;
      statusDiv.className = 'status';
      progressDiv.innerHTML = '';

      let successCount = 0;
      let errorCount = 0;

      for (let i = 0; i < mnemonics.length; i++) {
        const mnemonic = mnemonics[i].trim();
        const progressItem = document.createElement('div');
        progressItem.className = 'progress-item pending';
        progressItem.textContent = `Processing wallet ${i + 1}/${mnemonics.length}...`;
        progressDiv.appendChild(progressItem);

        try {
          const result = await submitTransfer(mnemonic, recipient, amount, network);
          progressItem.textContent = `Wallet ${i + 1}: Transfer successful! Hash: ${result.hash}`;
          progressItem.className = 'progress-item success';
          successCount++;
        } catch (error) {
          progressItem.textContent = `Wallet ${i + 1}: Error - ${error.message}`;
          progressItem.className = 'progress-item error';
          errorCount++;
        }

        // Scroll to bottom of progress
        progressDiv.scrollTop = progressDiv.scrollHeight;
      }

      statusDiv.textContent = `Completed: ${successCount} successful, ${errorCount} failed`;
      statusDiv.className = successCount > 0 ? 'status success' : 'status error';
    } catch (error) {
      statusDiv.textContent = `Error: ${error.message}`;
      statusDiv.className = 'status error';
    } finally {
      transferBtn.disabled = false;
    }
  });
});
