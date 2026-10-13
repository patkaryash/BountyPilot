import { useCallback, useEffect, useState } from "react";
import { CONTRACT_ADDRESS, EXPECTED_CHAIN_ID } from "./config/contract";
import { chainLabel, formatError, getContract, loadBounties, loadReports, shortAddr, type Bounty, type Report } from "./lib/bounty";
import { WalletPanel, useWallet } from "./components/WalletButton";
import { BountyDetails, CreateBounty, Dashboard, OwnerBounties } from "./components/Bounties";
import { OwnerReview, ResearcherReports, SubmitReport } from "./components/Reports";
import { TxHistory } from "./components/TxHistory";
import "./App.css";

type Tab = "market" | "owned" | "create" | "details" | "submit" | "mine" | "review" | "history";

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
      setStatus(formatError(e));
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
      <nav className="topnav">
        <div className="brand">
          <div className="brand-mark" aria-hidden="true">B</div>
          <span className="brand-name">BountyPilot</span>
        </div>
        <div className="nav-links">
          {(
            [
              ["market", "Bounties"],
              ["owned", "My Bounties"],
              ["create", "Create"],
              ["details", "Bounty"],
              ["submit", "Submit"],
              ["mine", "My Reports"],
              ["review", "Review"],
              ["history", "History"],
            ] as [Tab, string][]
          ).map(([id, label]) => (
            <button key={id} className={tab === id ? "active" : ""} onClick={() => setTab(id)}>
              {label}
            </button>
          ))}
        </div>
        <div className="nav-wallet">
          <span
            className={`dot${wallet.address ? (mismatch ? " bad" : " on") : ""}`}
            aria-hidden="true"
          />
          <span className="muted">
            {wallet.address
              ? `${shortAddr(wallet.address)} · ${chainLabel(wallet.chainId)}`
              : "Not connected"}
          </span>
          {wallet.address ? (
            <button className="btn-small" onClick={disconnect}>
              Disconnect
            </button>
          ) : (
            <button className="btn-small btn-primary" onClick={connect} disabled={connecting}>
              {connecting ? "Connecting…" : "Connect"}
            </button>
          )}
        </div>
      </nav>
      <p className="muted mono contract-line">
        Contract {CONTRACT_ADDRESS} · {chainLabel(EXPECTED_CHAIN_ID)} (chain{" "}
        {EXPECTED_CHAIN_ID})
      </p>

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

      {!wallet.address && (
        <div className="card empty">
          <div className="big">Connect your wallet to begin</div>
          <p>Use a Sepolia test account with test ETH — never real funds.</p>
          <button className="btn-primary" onClick={connect} disabled={connecting}>
            {connecting ? "Connecting…" : "Connect MetaMask"}
          </button>
        </div>
      )}
      {status && <div className="alert alert-error">{status}</div>}

      {tab === "market" && (
        <Dashboard
          bounties={bounties}
          loading={loading}
          onRefresh={() => void refresh()}
          onSelect={(id) => {
            setSelectedBounty(id);
            setTab("details");
          }}
        />
      )}
      {tab === "owned" && (
        <OwnerBounties
          bounties={bounties}
          loading={loading}
          account={wallet.address}
          onSelect={(id) => {
            setSelectedBounty(id);
            setTab("details");
          }}
        />
      )}
      {tab === "create" && (
        <CreateBounty
          signer={wallet.signer}
          onCreated={(id) => {
            if (id !== null) setSelectedBounty(id);
            void refresh();
          }}
        />
      )}
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
