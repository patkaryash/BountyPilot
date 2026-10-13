import { useState } from "react";
import { ethers } from "ethers";
import { EXPECTED_CHAIN_ID, LOCAL_RPC_URL } from "../config/contract";
import { chainLabel } from "../lib/bounty";

declare global {
  interface Window {
    ethereum?: ethers.Eip1193Provider & {
      on?: (event: string, cb: (...args: unknown[]) => void) => void;
      removeListener?: (event: string, cb: (...args: unknown[]) => void) => void;
    };
  }
}

export type WalletState = {
  address: string | null;
  chainId: number | null;
  provider: ethers.BrowserProvider | null;
  signer: ethers.Signer | null;
};

export function useWallet() {
  const [wallet, setWallet] = useState<WalletState>({
    address: null,
    chainId: null,
    provider: null,
    signer: null,
  });
  const [error, setError] = useState<string | null>(null);
  const [connecting, setConnecting] = useState(false);

  async function refresh(provider: ethers.BrowserProvider) {
    const signer = await provider.getSigner();
    const address = await signer.getAddress();
    const net = await provider.getNetwork();
    setWallet({ address, chainId: Number(net.chainId), provider, signer });
  }

  async function connect() {
    setError(null);
    if (!window.ethereum) {
      setError("MetaMask not detected. Install MetaMask to use BountyPilot.");
      return;
    }
    setConnecting(true);
    try {
      const provider = new ethers.BrowserProvider(window.ethereum);
      await provider.send("eth_requestAccounts", []);
      await refresh(provider);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Wallet connection failed.");
    } finally {
      setConnecting(false);
    }
  }

  function disconnect() {
    setWallet({ address: null, chainId: null, provider: null, signer: null });
  }

  const mismatch =
    wallet.chainId !== null && wallet.chainId !== EXPECTED_CHAIN_ID;

  async function switchToLocal() {
    if (!window.ethereum) return;
    const hexChain = "0x" + EXPECTED_CHAIN_ID.toString(16);
    try {
      await window.ethereum.request?.({
        method: "wallet_switchEthereumChain",
        params: [{ chainId: hexChain }],
      });
      if (wallet.provider) await refresh(wallet.provider);
    } catch (e: unknown) {
      // Chain not added (error 4902) -> add localhost network, then retry is manual
      const err = e as { code?: number; message?: string };
      if (err?.code === 4902) {
        try {
          await window.ethereum.request?.({
            method: "wallet_addEthereumChain",
            params: [
              {
                chainId: hexChain,
                chainName: "Localhost (Hardhat)",
                rpcUrls: [LOCAL_RPC_URL],
                nativeCurrency: { name: "ETH", symbol: "ETH", decimals: 18 },
              },
            ],
          });
        } catch (addErr) {
          setError(
            addErr instanceof Error ? addErr.message : "Failed to add localhost network."
          );
        }
      } else {
        setError(err?.message ?? "Failed to switch network.");
      }
    }
  }

  return { wallet, error, connecting, mismatch, connect, disconnect, switchToLocal };
}

export function WalletPanel(props: {
  address: string | null;
  chainId: number | null;
  connecting: boolean;
  mismatch: boolean;
  error: string | null;
  onConnect: () => void;
  onDisconnect: () => void;
  onSwitch: () => void;
}) {
  // Wallet status + connect button live in the top nav; this renders
  // only connection errors and the network-mismatch alert.
  void props.connecting;
  void props.onConnect;
  void props.onDisconnect;
  return (
    <>
      {props.error && <div className="alert alert-error">{props.error}</div>}
      {props.mismatch && props.address && (
        <div className="alert alert-warn">
          Wrong network: connected to {chainLabel(props.chainId)} (chain{" "}
          {props.chainId}), expected {chainLabel(EXPECTED_CHAIN_ID)} (chain{" "}
          {EXPECTED_CHAIN_ID}).{" "}
          <button className="btn-small" onClick={props.onSwitch}>
            Switch network
          </button>
        </div>
      )}
    </>
  );
}
