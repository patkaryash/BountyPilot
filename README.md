# BountyPilot — Distributed Bug Bounty Platform (college MVP)

BountyPilot lets project owners run bug bounty programs on Ethereum and lets
security researchers submit findings and claim rewards in ETH.

> **Status: local MVP only (Stages 1–2). NOT audited. NOT production-ready.
> Use test ETH on a local Hardhat network only. Never use real funds.**

## What works today

1. Owners create bounty programs (`createBounty`)
2. Anyone funds a bounty with test ETH (`fundBounty`)
3. Researchers submit vulnerability reports (`submitReport`)
4. Owners approve (with a fixed reward) or reject reports (`reviewReport`)
5. Researchers claim approved rewards exactly once (`claimReward`)
6. Owners withdraw unreserved funds (`withdrawFunds`)
7. Anyone inspects on-chain events (`BountyCreated`, `BountyFunded`,
   `ReportSubmitted`, `ReportReviewed`, `RewardClaimed`, `FundsWithdrawn`)
8. React frontend (local): dashboard, create, bounty details + funding,
   submit report, my reports + claim, owner review, tx history, MetaMask
   wallet + network-mismatch warning

No backend, database, IPFS, tokens, NFTs, or AI. No Sepolia deployment yet
(Stage 3).

## Tech stack

- Solidity `0.8.24`, OpenZeppelin `5.0.2` (`ReentrancyGuard`)
- Hardhat `2.29.1` + `@nomicfoundation/hardhat-toolbox` `4.0.0`, ethers v6
- React + Vite + TypeScript frontend (`frontend/`), ethers `6.13.2`, MetaMask
- Local Hardhat network (chain ID `31337`) for development

## Repo structure

```
contracts/BountyPilot.sol        MVP contract (bounties, reports, rewards)
contracts/test/ETHRejector.sol   test helper (non-payable contract)
test/BountyPilot.test.ts         5 smoke tests (core flows + auth)
test/BountyPilot.security.test.ts  7 security tests ( Stages 2 )
scripts/deploy.ts                deploys + writes deployments/<network>.json
deployments/localhost.json       last localhost deploy (address, chainId)
frontend/                        Vite + React + TS app (ethers v6)
frontend/src/config/contract.ts  address/chain/ABI config (env-overridable)
frontend/src/config/BountyPilot.abi.json  ABI copied from artifacts
```

## Prerequisites

- Node.js 22, npm 10, Git, MetaMask (browser)
- No secrets needed for local development

## Quickstart (3 terminals)

```powershell
# Terminal 1 — local blockchain (keep running)
cd G:\BountyPilot
npm install
npm run node

# Terminal 2 — deploy to localhost (while node runs)
cd G:\BountyPilot
npm run deploy:local
# BountyPilot deployed to: 0x5FbDB2315678afecb367f032d93F642f64180aa3
# (first deploy on a fresh node is deterministic)

# Terminal 3 — frontend
cd G:\BountyPilot\frontend
npm install
copy .env.example .env
npm run dev
# open the Vite URL, connect MetaMask to http://127.0.0.1:8545 (chain 31337),
# import a Hardhat test account. Test ETH only.
```

Make sure `VITE_CONTRACT_ADDRESS` in `frontend/.env` matches the address
printed by `npm run deploy:local` (default is the address above).

## Tests & builds

```powershell
cd G:\BountyPilot
npx hardhat compile
npx hardhat test        # 12 passing (5 smoke + 7 security)

cd frontend
npm run build           # production build (tsc + vite)
```

## Contract notes (actual API)

- `createBounty(string metadata)`, `fundBounty(uint256 bountyId) payable`
- `submitReport(uint256 bountyId, string reportData)` — **public on-chain**:
  submit a summary or hash only, never sensitive exploit details
- `reviewReport(uint256 reportId, bool approved, uint256 reward)` — owner only;
  approval reserves `reward <= totalFunds - reservedFunds`
- `claimReward(uint256 reportId)` — researcher only, pays approved amount once
  (checks-effects-interactions + `nonReentrant`; failure reverts accounting)
- `withdrawFunds(uint256 bountyId, uint256 amount)` — owner only, unreserved only
- Views: `bounties(id)`, `reports(id)`, `availableFunds(id)`,
  `nextBountyId`, `nextReportId`

## Security properties tested

- Only the bounty owner can approve/reject and withdraw
- Rewards can't exceed available funds, including across two reports
- No double review, no double claim; rejected reports can't claim
- Failed ETH transfers revert without corrupting `totalFunds`/`reservedFunds`
- Input validation on metadata, reports, rewards, amounts

## Next (Stage 3, not started)

End-to-end browser click-through on localhost, then Sepolia deployment
planning (`.env` with `SEPOLIA_RPC_URL`/`PRIVATE_KEY`, never committed).
