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

export function shortAddr(a: string): string {
  if (!a || a.length < 10) return a;
  return `${a.slice(0, 6)}…${a.slice(-4)}`;
}
