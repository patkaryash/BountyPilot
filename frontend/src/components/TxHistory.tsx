import { useState } from "react";
import { ethers } from "ethers";
import { CONTRACT_ABI, CONTRACT_ADDRESS } from "../config/contract";
import { fmtEth, formatError, shortAddr } from "../lib/bounty";

type Row = {
  name: string;
  args: string;
  tx: string;
  block: number;
  txIndex: number;
  logIndex: number;
};

const EVENT_NAMES = [
  "BountyCreated",
  "BountyFunded",
  "ReportSubmitted",
  "ReportReviewed",
  "RewardClaimed",
  "FundsWithdrawn",
] as const;

// One eth_getLogs request covers at most this many blocks. Public RPC
// endpoints reject wide ranges (e.g. "range ... exceeds limit of 10000"),
// so History pages [0, latest] in small contiguous chunks instead.
const CHUNK_BLOCKS = 5000;
const CHUNK_CONCURRENCY = 8;

export function TxHistory(props: { provider: ethers.Provider | null }) {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [msgOk, setMsgOk] = useState(false);

  async function load() {
    setMsg(null);
    setProgress(null);
    const provider = props.provider;
    if (!provider) {
      setMsgOk(false);
      return setMsg("Connect wallet (provider needed) first.");
    }
    setLoading(true);
    try {
      const c = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, provider);
      // Non-null alias: narrowing does not carry into the nested loader below.
      const rpc: ethers.Provider = provider;
      const latest = await rpc.getBlockNumber();
      const topicHashes = EVENT_NAMES.map((n) => {
        const frag = c.interface.getEvent(n);
        if (!frag) throw new Error(`Unknown event: ${n}`);
        return frag.topicHash;
      });

      // Contiguous, non-overlapping ranges: [0, 4999], [5000, 9999], …,
      // final chunk clamped to `latest` — no gaps, no duplicates.
      const ranges: Array<[number, number]> = [];
      for (let from = 0; from <= latest; from += CHUNK_BLOCKS) {
        ranges.push([from, Math.min(from + CHUNK_BLOCKS - 1, latest)]);
      }

      const seen = new Set<string>();
      const out: Row[] = [];
      let done = 0;
      async function fetchRange([from, to]: [number, number]) {
        const logs = await rpc.getLogs({
          address: CONTRACT_ADDRESS,
          topics: [topicHashes],
          fromBlock: from,
          toBlock: to,
        });
        for (const l of logs) {
          let parsed = null;
          try {
            parsed = c.interface.parseLog(l);
          } catch {
            parsed = null;
          }
          if (!parsed) continue;
          const key = `${l.blockNumber}:${l.transactionHash}:${l.index}`;
          if (seen.has(key)) continue;
          seen.add(key);
          out.push({
            name: parsed.name,
            args: JSON.stringify(
              Object.fromEntries(
                Object.entries(parsed.args ?? {}).filter(([k]) =>
                  Number.isNaN(Number(k))
                )
              ),
              (_, v) =>
                typeof v === "bigint" ? `${v.toString()} (${fmtEth(v as bigint)} ETH)` : v
            ),
            tx: l.transactionHash ?? "",
            block: l.blockNumber ?? 0,
            txIndex: l.transactionIndex ?? 0,
            logIndex: l.index ?? 0,
          });
        }
        done += 1;
        setProgress(`Scanning chain… ${done}/${ranges.length} chunks`);
      }

      // Bounded parallelism: fast without hammering the RPC.
      let next = 0;
      async function worker() {
        while (next < ranges.length) {
          const range = ranges[next];
          next += 1;
          await fetchRange(range);
        }
      }
      await Promise.all(
        Array.from({ length: Math.min(CHUNK_CONCURRENCY, ranges.length) }, () =>
          worker()
        )
      );

      out.sort(
        (a, b) => a.block - b.block || a.txIndex - b.txIndex || a.logIndex - b.logIndex
      );
      setRows(out);
      if (out.length === 0) {
        setMsgOk(false);
        setMsg("No on-chain events yet on this network.");
      }
    } catch (err) {
      setMsgOk(false);
      setMsg(formatError(err));
    } finally {
      setLoading(false);
      setProgress(null);
    }
  }

  return (
    <div className="card">
      <h3>Transaction history / events</h3>
      <p className="muted">Every bounty action, read straight from chain logs.</p>
      <button className="btn-primary" onClick={load} disabled={loading}>
        {loading ? "Loading…" : "Load on-chain events"}
      </button>
      {loading && progress && <div className="muted">{progress}</div>}
      {msg && (
        <div className={msgOk ? "alert alert-ok" : "alert alert-info"}>{msg}</div>
      )}
      {rows.map((r, i) => (
        <div key={i} className="rowbox">
          <div>
            <div className="row">
              <span className="pill pill-open">{r.name}</span>
              <span className="muted">block {r.block}</span>
            </div>
            <div className="muted truncate">{r.args}</div>
            <div className="muted mono">tx {shortAddr(r.tx)}</div>
          </div>
        </div>
      ))}
    </div>
  );
}
