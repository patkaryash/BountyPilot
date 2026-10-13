import { useState } from "react";
import { ethers } from "ethers";
import {
  ReportStatusLabels,
  fmtEth,
  formatError,
  getContract,
  shortAddr,
  type Bounty,
  type Report,
} from "../lib/bounty";

const STATUS_PILL = ["pill-submitted", "pill-approved", "pill-rejected", "pill-claimed"];

export function SubmitReport(props: {
  bounties: Bounty[];
  selectedBounty: number | null;
  signer: ethers.Signer | null;
  onSubmitted: () => void;
}) {
  const [bountyId, setBountyId] = useState<string>(
    props.selectedBounty !== null ? String(props.selectedBounty) : "0"
  );
  const [data, setData] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [msgOk, setMsgOk] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);
    if (!props.signer) {
      setMsgOk(false);
      return setMsg("Connect MetaMask first.");
    }
    if (bountyId === "") {
      setMsgOk(false);
      return setMsg("Pick a bounty.");
    }
    if (!data.trim()) {
      setMsgOk(false);
      return setMsg("Report text is required.");
    }
    setBusy(true);
    try {
      const c = getContract(props.signer);
      const tx = await c.submitReport(Number(bountyId), data.trim());
      await tx.wait();
      setData("");
      setMsgOk(true);
      setMsg("Report submitted.");
      props.onSubmitted();
    } catch (err) {
      setMsgOk(false);
      setMsg(formatError(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card">
      <h3>Submit vulnerability report</h3>
      <div className="alert alert-warn">
        <strong>Public warning:</strong> on-chain descriptions are{" "}
        <strong>publicly visible</strong>. Do not store sensitive vulnerability details
        on-chain. Submit a high-level summary or hash only.
      </div>
      <form onSubmit={submit} className="col">
        <label>
          Bounty
          <select value={bountyId} onChange={(e) => setBountyId(e.target.value)}>
            {props.bounties.map((b) => (
              <option key={b.id} value={b.id}>
                #{b.id} — {b.metadata.slice(0, 60)}
              </option>
            ))}
          </select>
        </label>
        <label>
          Finding summary (public!)
          <textarea
            value={data}
            onChange={(e) => setData(e.target.value)}
            placeholder="e.g. Reflected XSS on /search?q= (details shared off-chain)"
            rows={4}
            maxLength={2000}
          />
        </label>
        <button type="submit" className="btn-primary" disabled={busy}>
          {busy ? "Submitting…" : "Submit report"}
        </button>
      </form>
      {msg && <div className={msgOk ? "alert alert-ok" : "alert alert-error"}>{msg}</div>}
    </div>
  );
}

export function ResearcherReports(props: {
  reports: Report[];
  account: string | null;
  signer: ethers.Signer | null;
  onChanged: () => void;
}) {
  const [busyId, setBusyId] = useState<number | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [msgOk, setMsgOk] = useState(false);
  const mine = props.account
    ? props.reports.filter((r) => r.researcher.toLowerCase() === props.account!.toLowerCase())
    : [];

  async function claim(id: number) {
    setMsg(null);
    if (!props.signer) {
      setMsgOk(false);
      return setMsg("Connect MetaMask first.");
    }
    setBusyId(id);
    try {
      const c = getContract(props.signer);
      const tx = await c.claimReward(id);
      await tx.wait();
      setMsgOk(true);
      setMsg(`Reward claimed for report #${id}.`);
      props.onChanged();
    } catch (err) {
      setMsgOk(false);
      setMsg(formatError(err));
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="card">
      <h3>My reports ({mine.length})</h3>
      {!props.account && (
        <div className="empty">
          <div className="big">Wallet not connected</div>
          <p>Connect your wallet to see the reports you submitted.</p>
        </div>
      )}
      {props.account && mine.length === 0 && (
        <div className="empty">
          <div className="big">No reports yet</div>
          <p>Submit your first finding from the Submit tab.</p>
        </div>
      )}
      {mine.map((r) => (
        <div key={r.id} className="rowbox">
          <div>
            <div className="row">
              <strong>#{r.id}</strong>
              <span className={`pill ${STATUS_PILL[r.status] ?? ""}`}>
                {ReportStatusLabels[r.status]}
              </span>
            </div>
            <div className="muted">
              on bounty #{r.bountyId} ·{" "}
              {r.reward > 0n ? `${fmtEth(r.reward)} ETH` : "no reward yet"}
            </div>
            <div className="muted truncate">{r.reportData}</div>
          </div>
          {r.status === 1 && (
            <button
              className="btn-small btn-primary"
              onClick={() => claim(r.id)}
              disabled={busyId === r.id}
            >
              {busyId === r.id ? "Claiming…" : "Claim reward"}
            </button>
          )}
        </div>
      ))}
      {msg && <div className={msgOk ? "alert alert-ok" : "alert alert-error"}>{msg}</div>}
    </div>
  );
}

export function OwnerReview(props: {
  bounties: Bounty[];
  reports: Report[];
  account: string | null;
  signer: ethers.Signer | null;
  onChanged: () => void;
}) {
  const [rewardById, setRewardById] = useState<Record<number, string>>({});
  const [busyId, setBusyId] = useState<number | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [msgOk, setMsgOk] = useState(false);

  const ownedIds = new Set(
    (props.account
      ? props.bounties.filter(
          (b) => b.owner.toLowerCase() === props.account!.toLowerCase()
        )
      : []
    ).map((b) => b.id)
  );
  const pending = props.reports.filter(
    (r) => ownedIds.has(r.bountyId) && r.status === 0
  );

  async function review(id: number, approved: boolean) {
    setMsg(null);
    if (!props.signer) {
      setMsgOk(false);
      return setMsg("Connect MetaMask first.");
    }
    const rewardStr = rewardById[id] ?? "0";
    let reward = 0n;
    try {
      reward = approved ? ethers.parseEther(rewardStr || "0") : 0n;
    } catch {
      setMsgOk(false);
      return setMsg("Invalid reward amount.");
    }
    if (approved && reward <= 0n) {
      setMsgOk(false);
      return setMsg("Reward must be > 0 when approving.");
    }
    setBusyId(id);
    try {
      const c = getContract(props.signer);
      const tx = await c.reviewReport(id, approved, reward);
      await tx.wait();
      setMsgOk(true);
      setMsg(`Report #${id} ${approved ? "approved" : "rejected"}.`);
      props.onChanged();
    } catch (err) {
      setMsgOk(false);
      setMsg(formatError(err));
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="card">
      <h3>Owner review ({pending.length} pending)</h3>
      {!props.account && (
        <div className="empty">
          <div className="big">Wallet not connected</div>
          <p>Connect an owner wallet to review submissions.</p>
        </div>
      )}
      {pending.map((r) => (
        <div key={r.id} className="rowbox">
          <div>
            <div className="row">
              <strong>#{r.id}</strong>
              <span className="pill pill-submitted">Pending</span>
            </div>
            <div className="muted">
              on bounty #{r.bountyId} by {shortAddr(r.researcher)}
            </div>
            <div className="truncate">{r.reportData}</div>
          </div>
          <div className="row">
            <input
              placeholder="reward ETH"
              value={rewardById[r.id] ?? ""}
              onChange={(e) => setRewardById({ ...rewardById, [r.id]: e.target.value })}
            />
            <button
              className="btn-small btn-primary"
              onClick={() => review(r.id, true)}
              disabled={busyId === r.id}
            >
              {busyId === r.id ? "…" : "Approve"}
            </button>
            <button
              className="btn-small btn-danger"
              onClick={() => review(r.id, false)}
              disabled={busyId === r.id}
            >
              Reject
            </button>
          </div>
        </div>
      ))}
      {pending.length === 0 && props.account && (
        <div className="empty">
          <div className="big">All caught up</div>
          <p>Nothing awaiting your review.</p>
        </div>
      )}
      {msg && <div className={msgOk ? "alert alert-ok" : "alert alert-error"}>{msg}</div>}
    </div>
  );
}
