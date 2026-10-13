import { useState } from "react";
import { ethers } from "ethers";
import { fmtEth, formatError, getContract, shortAddr, type Bounty } from "../lib/bounty";
import { CONTRACT_ADDRESS, EXPECTED_CHAIN_ID } from "../config/contract";

type SortKey = "reward-desc" | "reward-asc" | "newest" | "oldest";

export function Dashboard(props: {
  bounties: Bounty[];
  loading: boolean;
  onRefresh: () => void;
  onSelect: (id: number) => void;
}) {
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<SortKey>("reward-desc");

  const q = query.trim().toLowerCase();
  const filtered = props.bounties
    .filter(
      (b) =>
        q === "" ||
        b.metadata.toLowerCase().includes(q) ||
        b.owner.toLowerCase().includes(q) ||
        String(b.id) === q
    )
    .sort((a, b) => {
      switch (sort) {
        case "reward-asc":
          return a.available < b.available ? -1 : a.available > b.available ? 1 : 0;
        case "newest":
          return b.id - a.id;
        case "oldest":
          return a.id - b.id;
        case "reward-desc":
        default:
          return a.available > b.available ? -1 : a.available < b.available ? 1 : 0;
      }
    });

  return (
    <div>
      <div className="hero">
        <h2>Explore Bounties</h2>
        <p className="muted">
          Showing {filtered.length} of {props.bounties.length} bounty programs · rewards
          funded on-chain, paid in ETH
        </p>
      </div>
      <div className="filterbar">
        <div className="searchbox">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by keyword"
            aria-label="Search bounties"
          />
        </div>
        <select
          value={sort}
          onChange={(e) => setSort(e.target.value as SortKey)}
          aria-label="Sort bounties"
        >
          <option value="reward-desc">Sort by: Highest reward</option>
          <option value="reward-asc">Sort by: Lowest reward</option>
          <option value="newest">Sort by: Newest</option>
          <option value="oldest">Sort by: Oldest</option>
        </select>
        <button className="btn-small" onClick={props.onRefresh}>
          Refresh
        </button>
      </div>
      {props.loading && (
        <div className="loading-row">
          <span className="spinner" aria-hidden="true" />
          Loading bounties from chain…
        </div>
      )}
      {!props.loading && filtered.length === 0 && (
        <div className="card">
          <div className="empty">
            <div className="big">
              {props.bounties.length === 0 ? "No bounties yet" : "No matches"}
            </div>
            <p>
              {props.bounties.length === 0
                ? "Create the first bounty to kick off the marketplace."
                : "Try a different keyword or sort order."}
            </p>
          </div>
        </div>
      )}
      {filtered.length > 0 && (
        <div className="program-list">
          <div className="list-head" aria-hidden="true">
            <span>Program</span>
            <span>Name</span>
            <span>Rewards up to</span>
            <span>Funded</span>
            <span />
          </div>
          {filtered.map((b) => (
            <div key={b.id} className="program-row">
              <div className="prog-id">#{b.id}</div>
              <div>
                <div className="prog-name">{b.metadata}</div>
                <div className="muted prog-sub">by {shortAddr(b.owner)}</div>
              </div>
              <div className="prog-reward">
                <div className="reward">{fmtEth(b.available)} ETH</div>
                <div className="muted caption">Rewards up to</div>
              </div>
              <div className="prog-meta">
                <div>{fmtEth(b.totalFunds)} ETH</div>
                <div className="muted caption">Funded</div>
              </div>
              <button className="btn-small btn-accent" onClick={() => props.onSelect(b.id)}>
                View bounty
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function CreateBounty(props: { signer: ethers.Signer | null; onCreated: (newBountyId: number | null) => void }) {
  const [metadata, setMetadata] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [msgOk, setMsgOk] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);
    if (!props.signer) {
      setMsgOk(false);
      setMsg("Connect MetaMask first.");
      return;
    }
    if (!metadata.trim()) {
      setMsgOk(false);
      setMsg("Scope/metadata is required.");
      return;
    }
    setBusy(true);
    try {
      const c = getContract(props.signer);
      const tx = await c.createBounty(metadata.trim());
      const receipt = await tx.wait();
      // Decode the new bounty id from the BountyCreated log so the UI can
      // select it. Falls back to null (list still refreshes) if undecodable.
      let newId: number | null = null;
      for (const log of receipt?.logs ?? []) {
        try {
          const parsed = c.interface.parseLog(log);
          if (parsed?.name === "BountyCreated") {
            newId = Number(parsed.args.bountyId);
            break;
          }
        } catch {
          // ignore logs from other contracts
        }
      }
      setMetadata("");
      setMsgOk(true);
      setMsg(newId !== null ? `Bounty #${newId} created.` : "Bounty created.");
      props.onCreated(newId);
    } catch (err) {
      setMsgOk(false);
      setMsg(formatError(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card">
      <h3>Create bounty</h3>
      <form onSubmit={submit} className="col">
        <label>
          Scope / rules (public, on-chain)
          <input
            value={metadata}
            onChange={(e) => setMetadata(e.target.value)}
            placeholder="e.g. Scope: example.com, out of scope: DoS"
            maxLength={280}
          />
        </label>
        <button type="submit" className="btn-primary" disabled={busy}>
          {busy ? "Creating…" : "Create bounty"}
        </button>
      </form>
      {msg && <div className={msgOk ? "alert alert-ok" : "alert alert-error"}>{msg}</div>}
    </div>
  );
}

export function BountyDetails(props: {
  bounty: Bounty | null;
  signer: ethers.Signer | null;
  account: string | null;
  onChanged: () => void;
}) {
  const [amount, setAmount] = useState("0.1");
  const [msg, setMsg] = useState<string | null>(null);
  const [msgOk, setMsgOk] = useState(false);
  const [busy, setBusy] = useState(false);

  if (!props.bounty)
    return (
      <div className="card">
        <h3>Bounty details</h3>
        <div className="empty">
          <div className="big">No bounty selected</div>
          <p>Pick a bounty from the marketplace to see details and fund it.</p>
        </div>
      </div>
    );
  const b = props.bounty;
  const isOwner =
    props.account !== null && b.owner.toLowerCase() === props.account.toLowerCase();

  async function fund() {
    setMsg(null);
    if (!props.signer) {
      setMsgOk(false);
      return setMsg("Connect MetaMask first.");
    }
    const v = Number(amount);
    if (!Number.isFinite(v) || v <= 0) {
      setMsgOk(false);
      return setMsg("Enter an amount > 0.");
    }
    setBusy(true);
    try {
      const c = getContract(props.signer);
      const tx = await c.fundBounty(b.id, { value: ethers.parseEther(amount) });
      await tx.wait();
      setMsgOk(true);
      setMsg(`Funded ${amount} ETH.`);
      props.onChanged();
    } catch (err) {
      setMsgOk(false);
      setMsg(formatError(err));
    } finally {
      setBusy(false);
    }
  }

  async function withdraw() {
    setMsg(null);
    if (!props.signer) {
      setMsgOk(false);
      return setMsg("Connect MetaMask first.");
    }
    setBusy(true);
    try {
      const c = getContract(props.signer);
      const tx = await c.withdrawFunds(b.id, ethers.parseEther(amount));
      await tx.wait();
      setMsgOk(true);
      setMsg(`Withdrew ${amount} ETH (unreserved only).`);
      props.onChanged();
    } catch (err) {
      setMsgOk(false);
      setMsg(formatError(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card">
      <div className="row space-between">
        <h3>Bounty #{b.id}</h3>
        <span className="row">
          <span className="pill pill-open">Open</span>
          {EXPECTED_CHAIN_ID === 11155111 && (
            <a
              className="inline-link mono"
              href={`https://sepolia.etherscan.io/address/${CONTRACT_ADDRESS}`}
              target="_blank"
              rel="noreferrer"
            >
              Etherscan
            </a>
          )}
        </span>
      </div>
      <div className="section-label">Scope</div>
      <p>{b.metadata}</p>
      <div className="muted">
        Owner {shortAddr(b.owner)} {isOwner && "(you)"} · reviewed by the owner, paid in
        ETH
      </div>
      <div className="section-label">Rewards</div>
      <div className="grid2">
        <div className="stat">
          <div className="label">Rewards up to</div>
          <div className="value">{fmtEth(b.available)} ETH</div>
        </div>
        <div className="stat">
          <div className="label">Total funded</div>
          <div className="value">{fmtEth(b.totalFunds)} ETH</div>
        </div>
        <div className="stat">
          <div className="label">Reserved for approvals</div>
          <div className="value">{fmtEth(b.reservedFunds)} ETH</div>
        </div>
      </div>
      <div className="section-label">Fund this program</div>
      <div className="row">
        <input value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="ETH" />
        <button className="btn-primary" onClick={fund} disabled={busy}>
          {busy ? "Funding…" : "Fund"}
        </button>
        {isOwner && (
          <button
            className="btn-danger"
            onClick={withdraw}
            disabled={busy}
            title="Owner only, unreserved funds"
          >
            Withdraw
          </button>
        )}
      </div>
      {msg && <div className={msgOk ? "alert alert-ok" : "alert alert-error"}>{msg}</div>}
    </div>
  );
}

/// Owner dashboard: every bounty owned by the connected wallet.
/// The contract exposes no owner→ids index, so this filters the same
/// on-chain enumeration the marketplace uses — no new indexing, no fake data.
export function OwnerBounties(props: {
  bounties: Bounty[];
  loading: boolean;
  account: string | null;
  onSelect: (id: number) => void;
}) {
  const mine =
    props.account === null
      ? null
      : props.bounties.filter(
          (b) => b.owner.toLowerCase() === props.account!.toLowerCase()
        );

  if (props.account === null || mine === null)
    return (
      <div className="card">
        <h3>My bounties</h3>
        <div className="empty">
          <div className="big">Wallet not connected</div>
          <p>Connect your owner wallet to manage the bounties you created.</p>
        </div>
      </div>
    );

  const totalFunded = mine.reduce((sum, b) => sum + b.totalFunds, 0n);
  const totalAvailable = mine.reduce((sum, b) => sum + b.available, 0n);

  return (
    <div>
      <div className="hero">
        <h2>My Bounties</h2>
        <p className="muted">
          {mine.length} program{mine.length === 1 ? "" : "s"} owned by you ·{" "}
          {fmtEth(totalAvailable)} ETH available · {fmtEth(totalFunded)} ETH funded
        </p>
      </div>
      {props.loading && (
        <div className="loading-row">
          <span className="spinner" aria-hidden="true" />
          Loading your bounties from chain…
        </div>
      )}
      {!props.loading && mine.length === 0 && (
        <div className="card">
          <div className="empty">
            <div className="big">No bounties yet</div>
            <p>Bounties you create with this wallet will appear here.</p>
          </div>
        </div>
      )}
      {mine.length > 0 && (
        <div className="program-list">
          <div className="list-head" aria-hidden="true">
            <span>Program</span>
            <span>Name</span>
            <span>Rewards up to</span>
            <span>Funded</span>
            <span />
          </div>
          {mine.map((b) => (
            <div key={b.id} className="program-row">
              <div className="prog-id">#{b.id}</div>
              <div>
                <div className="prog-name">{b.metadata}</div>
                <div className="muted prog-sub">
                  {fmtEth(b.reservedFunds)} ETH reserved · {shortAddr(b.owner)} (you)
                </div>
              </div>
              <div className="prog-reward">
                <div className="reward">{fmtEth(b.available)} ETH</div>
                <div className="muted caption">Rewards up to</div>
              </div>
              <div className="prog-meta">
                <div>{fmtEth(b.totalFunds)} ETH</div>
                <div className="muted caption">Funded</div>
              </div>
              <button className="btn-small btn-accent" onClick={() => props.onSelect(b.id)}>
                Manage
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
