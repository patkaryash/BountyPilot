import abi from "./BountyPilot.abi.json";

// Deployed address captured from REAL localhost deployment output
// (see G:\BountyPilot\deployments\localhost.json).
// Override with .env for flexibility — never hardcode secrets here.
const FALLBACK_ADDRESS = "0x5FbDB2315678afecb367f032d93F642f64180aa3";

export const CONTRACT_ADDRESS: string =
  (import.meta.env.VITE_CONTRACT_ADDRESS as string | undefined)?.trim() ||
  FALLBACK_ADDRESS;

export const EXPECTED_CHAIN_ID: number = Number(
  import.meta.env.VITE_EXPECTED_CHAIN_ID ?? 31337
);

export const CONTRACT_ABI = abi;

// Local Hardhat defaults (test accounts only — never real funds)
export const LOCAL_RPC_URL =
  (import.meta.env.VITE_RPC_URL as string | undefined) ?? "http://127.0.0.1:8545";
