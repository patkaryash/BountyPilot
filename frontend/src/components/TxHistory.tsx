import { useState } from "react";
import { ethers } from "ethers";
import { CONTRACT_ABI, CONTRACT_ADDRESS } from "../config/contract";
import { fmtEth, shortAddr } from "../lib/bounty";

type Row = { name: string; args: string; tx: string; block: number };

const EVENT_NAMES = [
  "BountyCreated",
  "BountyFunded",
  "ReportSubmitted",
  "ReportReviewed",
  "RewardClaimed",
  "FundsWithdrawn",
] as const;

export function TxHistory(props: { provider: ethers.Provider | null }) {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function load() {
    setMsg(null);
    if (!props.provider) return setMsg("Connect wallet (provider needed) first.");
    setLoading(true);
    try {
      const c = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, props.provider);
      const out: Row[] = [];
      for (const name of EVENT_NAMES) {
        const events = await c.queryFilter(c.filters[name](), 0, "latest");
        for (const e of events) {
          const log = e as ethers.EventLog;
          out.push({
            name,
            args: JSON.stringify(
              Object.fromEntries(
                Object.entries(log.args ?? {}).filter(([k]) => Number.isNaN(Number(k)))
              ),
              (_, v) => (typeof v === "bigint" ? `${v.toString()} (${fmtEth(v as bigint)} ETH)` : v)
            ),
            tx: log.transactionHash ?? "",
            block: log.blockNumber ?? 0,
          });
        }
      }
      out.sort((a, b) => a.block - b.block);
      setRows(out);
      if (out.length === 0) setMsg("No on-chain events yet on this network.");
    } catch (err) {
      setMsg(err instanceof Error ? err.message : "History load failed.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="card">
      <h3>Transaction history / events</h3>
      <button onClick={load} disabled={loading}>
        {loading ? "Loading…" : "Load on-chain events"}
      </button>
      {msg && <div className="muted">{msg}</div>}
      {rows.map((r, i) => (
        <div key={i} className="rowbox">
          <div>
            <strong>{r.name}</strong> <span className="muted">block {r.block}</span>
            <div className="muted truncate">{r.args}</div>
            <div className="muted">tx {shortAddr(r.tx)}</div>
          </div>
        </div>
      ))}
    </div>
  );
}
