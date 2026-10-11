import { useCallback, useEffect, useState } from "react";
import { CONTRACT_ADDRESS, EXPECTED_CHAIN_ID } from "./config/contract";
import { getContract, loadBounties, loadReports, type Bounty, type Report } from "./lib/bounty";
import { WalletPanel, useWallet } from "./components/WalletButton";
import { BountyDetails, CreateBounty, Dashboard } from "./components/Bounties";
import { OwnerReview, ResearcherReports, SubmitReport } from "./components/Reports";
import { TxHistory } from "./components/TxHistory";
import "./App.css";

type Tab = "market" | "create" | "details" | "submit" | "mine" | "review" | "history";

export default function App() {
  const { wallet, error, connecting, mismatch, connect, disconnect, switchToLocal } = useWallet();
  const [tab, setTab] = useState<Tab>("market");
  const [bounties, setBounties] = useState<Bounty[]>([]);
  const [reports, setReports] = useState<Report[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedBounty, setSelectedBounty] = useState<number | null>(null);
  const [status, setStatus] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!wallet.provider) {
      setBounties([]);
      setReports([]);
      return;
    }
    setLoading(true);
    try {
      // Read-only via provider so listing works even on wrong network (will just be empty/fail)
      const c = getContract(wallet.provider);
      const [b, r] = await Promise.all([loadBounties(c), loadReports(c)]);
      setBounties(b);
      setReports(r);
      setStatus(null);
    } catch (e) {
      setStatus(e instanceof Error ? e.message : "Failed to load on-chain data.");
    } finally {
      setLoading(false);
    }
  }, [wallet.provider]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const selected = selectedBounty !== null ? bounties.find((b) => b.id === selectedBounty) ?? null : null;

  return (
    <div className="app">
      <header>
        <h1>BountyPilot</h1>
        <p className="muted">
          Distributed bug bounty MVP · local Hardhat only · NOT audited, NOT production-ready
        </p>
        <p className="muted mono">
          Contract {CONTRACT_ADDRESS} · expected chain {EXPECTED_CHAIN_ID}
        </p>
      </header>

      <WalletPanel
        address={wallet.address}
        chainId={wallet.chainId}
        connecting={connecting}
        mismatch={mismatch}
        error={error}
        onConnect={connect}
        onDisconnect={disconnect}
        onSwitch={switchToLocal}
      />

      <nav className="tabs">
        {(
          [
            ["market", "Dashboard"],
            ["create", "Create"],
            ["details", "Bounty"],
            ["submit", "Submit"],
            ["mine", "My reports"],
            ["review", "Review"],
            ["history", "History"],
          ] as [Tab, string][]
        ).map(([id, label]) => (
          <button key={id} className={tab === id ? "active" : ""} onClick={() => setTab(id)}>
            {label}
          </button>
        ))}
        <button onClick={() => void refresh()} disabled={!wallet.provider}>
          Refresh
        </button>
      </nav>

      {!wallet.address && (
        <div className="card">
          <p>Connect MetaMask to interact. Use a local Hardhat test account — never real funds.</p>
        </div>
      )}
      {status && <div className="error">{status}</div>}

      {tab === "market" && (
        <Dashboard
          bounties={bounties}
          loading={loading}
          onSelect={(id) => {
            setSelectedBounty(id);
            setTab("details");
          }}
        />
      )}
      {tab === "create" && <CreateBounty signer={wallet.signer} onCreated={() => void refresh()} />}
      {tab === "details" && (
        <BountyDetails
          bounty={selected}
          signer={wallet.signer}
          account={wallet.address}
          onChanged={() => void refresh()}
        />
      )}
      {tab === "submit" && (
        <SubmitReport
          bounties={bounties}
          selectedBounty={selectedBounty}
          signer={wallet.signer}
          onSubmitted={() => void refresh()}
        />
      )}
      {tab === "mine" && (
        <ResearcherReports
          reports={reports}
          account={wallet.address}
          signer={wallet.signer}
          onChanged={() => void refresh()}
        />
      )}
      {tab === "review" && (
        <OwnerReview
          bounties={bounties}
          reports={reports}
          account={wallet.address}
          signer={wallet.signer}
          onChanged={() => void refresh()}
        />
      )}
      {tab === "history" && <TxHistory provider={wallet.provider} />}

      <footer className="muted">
        MVP note: report text is stored on-chain and is public. Share summaries/hashes only.
      </footer>
    </div>
  );
}
