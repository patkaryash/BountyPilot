import { useState } from "react";
import { ethers } from "ethers";
import { fmtEth, getContract, shortAddr, type Bounty } from "../lib/bounty";

export function Dashboard(props: {
  bounties: Bounty[];
  loading: boolean;
  onSelect: (id: number) => void;
}) {
  if (props.loading) return <div className="card">Loading bounties…</div>;
  if (props.bounties.length === 0)
    return (
      <div className="card">
        <h3>Bounty marketplace</h3>
        <p className="muted">No bounties yet. Create the first one.</p>
      </div>
    );
  return (
    <div className="card">
      <h3>Bounty marketplace ({props.bounties.length})</h3>
      <table>
        <thead>
          <tr>
            <th>ID</th>
            <th>Scope</th>
            <th>Owner</th>
            <th>Funded</th>
            <th>Available</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {props.bounties.map((b) => (
            <tr key={b.id}>
              <td>{b.id}</td>
              <td className="truncate">{b.metadata}</td>
              <td>{shortAddr(b.owner)}</td>
              <td>{fmtEth(b.totalFunds)} ETH</td>
              <td>{fmtEth(b.available)} ETH</td>
              <td>
                <button onClick={() => props.onSelect(b.id)}>Open</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function CreateBounty(props: { signer: ethers.Signer | null; onCreated: (newBountyId: number | null) => void }) {
  const [metadata, setMetadata] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);
    if (!props.signer) {
      setMsg("Connect MetaMask first.");
      return;
    }
    if (!metadata.trim()) {
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
      setMsg(newId !== null ? `Bounty #${newId} created.` : "Bounty created.");
      props.onCreated(newId);
    } catch (err) {
      setMsg(err instanceof Error ? err.message : "Create failed.");
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
        <button type="submit" disabled={busy}>
          {busy ? "Creating…" : "Create bounty"}
        </button>
      </form>
      {msg && <div className="muted">{msg}</div>}
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
  const [busy, setBusy] = useState(false);

  if (!props.bounty) return <div className="card">Select a bounty to see details.</div>;
  const b = props.bounty;
  const isOwner =
    props.account !== null && b.owner.toLowerCase() === props.account.toLowerCase();

  async function fund() {
    setMsg(null);
    if (!props.signer) return setMsg("Connect MetaMask first.");
    const v = Number(amount);
    if (!Number.isFinite(v) || v <= 0) return setMsg("Enter an amount > 0.");
    setBusy(true);
    try {
      const c = getContract(props.signer);
      const tx = await c.fundBounty(b.id, { value: ethers.parseEther(amount) });
      await tx.wait();
      setMsg(`Funded ${amount} ETH.`);
      props.onChanged();
    } catch (err) {
      setMsg(err instanceof Error ? err.message : "Fund failed.");
    } finally {
      setBusy(false);
    }
  }

  async function withdraw() {
    setMsg(null);
    if (!props.signer) return setMsg("Connect MetaMask first.");
    setBusy(true);
    try {
      const c = getContract(props.signer);
      const tx = await c.withdrawFunds(b.id, ethers.parseEther(amount));
      await tx.wait();
      setMsg(`Withdrew ${amount} ETH (unreserved only).`);
      props.onChanged();
    } catch (err) {
      setMsg(err instanceof Error ? err.message : "Withdraw failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card">
      <h3>Bounty #{b.id}</h3>
      <p>{b.metadata}</p>
      <div className="grid2">
        <div>Owner: {shortAddr(b.owner)} {isOwner && "(you)"}</div>
        <div>Total: {fmtEth(b.totalFunds)} ETH</div>
        <div>Reserved: {fmtEth(b.reservedFunds)} ETH</div>
        <div>Available: {fmtEth(b.available)} ETH</div>
      </div>
      <div className="row">
        <input value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="ETH" />
        <button onClick={fund} disabled={busy}>
          Fund
        </button>
        {isOwner && (
          <button onClick={withdraw} disabled={busy} title="Owner only, unreserved funds">
            Withdraw
          </button>
        )}
      </div>
      {msg && <div className="muted">{msg}</div>}
    </div>
  );
}
