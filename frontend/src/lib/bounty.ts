import { ethers } from "ethers";
import { CONTRACT_ABI, CONTRACT_ADDRESS } from "../config/contract";

export type Bounty = {
  id: number;
  owner: string;
  metadata: string;
  totalFunds: bigint;
  reservedFunds: bigint;
  available: bigint;
  exists: boolean;
};

export const ReportStatusLabels = ["Submitted", "Approved", "Rejected", "Claimed"] as const;

export type Report = {
  id: number;
  bountyId: number;
  researcher: string;
  reportData: string;
  reward: bigint;
  status: number;
  exists: boolean;
};

export function getContract(signerOrProvider: ethers.Signer | ethers.Provider) {
  return new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, signerOrProvider);
}

export async function loadBounties(contract: ethers.Contract): Promise<Bounty[]> {
  const next: bigint = await contract.nextBountyId();
  const out: Bounty[] = [];
  for (let i = 0; i < Number(next); i++) {
    const b = await contract.bounties(i);
    const totalFunds: bigint = b.totalFunds ?? b[2];
    const reservedFunds: bigint = b.reservedFunds ?? b[3];
    out.push({
      id: i,
      owner: (b.owner ?? b[0]) as string,
      metadata: (b.metadata ?? b[1]) as string,
      totalFunds,
      reservedFunds,
      available: totalFunds - reservedFunds,
      exists: Boolean(b.exists ?? b[4]),
    });
  }
  return out;
}

export async function loadReports(contract: ethers.Contract): Promise<Report[]> {
  const next: bigint = await contract.nextReportId();
  const out: Report[] = [];
  for (let i = 0; i < Number(next); i++) {
    const r = await contract.reports(i);
    out.push({
      id: i,
      bountyId: Number(r.bountyId ?? r[0]),
      researcher: (r.researcher ?? r[1]) as string,
      reportData: (r.reportData ?? r[2]) as string,
      reward: (r.reward ?? r[3]) as bigint,
      status: Number(r.status ?? r[4]),
      exists: Boolean(r.exists ?? r[5]),
    });
  }
  return out;
}

export function fmtEth(v: bigint): string {
  return ethers.formatEther(v);
}

/// Human-readable network label for known test chains.
export function chainLabel(chainId: number | null): string {
  if (chainId === 11155111) return "Sepolia";
  if (chainId === 31337) return "Localhost";
  if (chainId === null) return "unknown";
  return `chain ${chainId}`;
}

const REVERT_FRIENDLY: Array<[RegExp, string]> = [
  [/only bounty owner/i, "Only the bounty owner can do this."],
  [/reward exceeds available funds/i, "Reward is bigger than the bounty's available funds. Add funds or lower the reward."],
  [/already reviewed/i, "This report was already reviewed."],
  [/not claimable/i, "This reward can't be claimed right now (not approved, rejected, or already claimed)."],
  [/only researcher/i, "Only the researcher who submitted this report can claim it."],
  [/bounty not found/i, "That bounty doesn't exist on this network."],
  [/report not found/i, "That report doesn't exist on this network."],
  [/report required/i, "Please describe the finding before submitting."],
  [/metadata required/i, "Please add a scope/description for the bounty."],
  [/reward must be/i, "Approval needs a reward above 0 ETH."],
  [/rejected reward must be 0/i, "Rejecting a report takes no reward amount."],
  [/amount must be/i, "Enter an amount above 0 ETH."],
  [/must send ETH/i, "Attach some ETH to fund this bounty."],
  [/amount exceeds available funds/i, "That amount exceeds the unreserved funds. Approved rewards stay locked."],
  [/insufficient bounty funds|accounting error/i, "Bounty accounting looks off — please refresh and try again."],
  [/ETH transfer failed/i, "The ETH transfer failed (receiver may reject it). Nothing was lost — please try again."],
  [/no reward set/i, "This report has no reward set yet."],
];

/// Turn raw ethers/wallet errors into short, user-facing messages.
export function formatError(err: unknown): string {
  if (typeof err === "object" && err !== null) {
    const code = (err as { code?: unknown }).code;
    if (code === 4001 || code === "ACTION_REJECTED") {
      return "Transaction rejected in your wallet. Nothing was sent.";
    }
  }
  if (!(err instanceof Error)) return "Something went wrong. Please try again.";
  const msg = err.message;
  for (const [re, friendly] of REVERT_FRIENDLY) {
    if (re.test(msg)) return friendly;
  }
  if (/insufficient funds/i.test(msg)) {
    return "Not enough test ETH to cover gas (and value). Top up from a faucet and retry.";
  }
  if (/exceeds limit|block range|too many blocks|limit of \d+|-32602/i.test(msg)) {
    return "The chain range is too wide for a single request. History loads in small chunks — please try again.";
  }
  if (/execution reverted/i.test(msg)) {
    return "The transaction reverted on-chain with no reason. If your wallet is a smart/delegated account, retry with a plain test account.";
  }
  if (/UNPREDICTABLE_GAS_LIMIT|CALL_EXCEPTION|missing revert data/i.test(msg)) {
    return "This transaction would fail on-chain. Check funds, ownership, and report status, then retry.";
  }
  if (/could not detect network|network changed|unsupported network/i.test(msg)) {
    return "Wallet network issue. Check MetaMask is on the expected network and refresh.";
  }
  const oneLine = msg.replace(/\s+/g, " ").trim();
  return oneLine.length > 220 ? oneLine.slice(0, 220) + "…" : oneLine;
}

export function shortAddr(a: string): string {
  if (!a || a.length < 10) return a;
  return `${a.slice(0, 6)}…${a.slice(-4)}`;
}
