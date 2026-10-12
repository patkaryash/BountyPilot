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

## Sepolia deployment (planned — NOT deployed yet)

Target: Ethereum Sepolia testnet, chain ID `11155111`. Test ETH only.
The contract is still NOT audited and NOT production-ready.

### What you need (you provide these at deploy time — never commit them)

- `SEPOLIA_RPC_URL`: HTTPS endpoint for Sepolia from a provider such as
  Alchemy or Infura (a project API key from their dashboard).
- Sepolia test ETH on a **dedicated test wallet** (never a wallet holding
  real assets). Faucets: Google Cloud's Sepolia faucet or Alchemy's Sepolia
  faucet (both need an account; amounts are small test ETH).
- `PRIVATE_KEY`: `0x`-prefixed key of that dedicated test wallet, used only
  by Hardhat from root `.env`. Never put it in any `frontend/.env` file —
  `VITE_*` values ship in browser JS.

### Environment setup (placeholders only in repo)

```powershell
cd G:\BountyPilot
copy .env.example .env
# edit .env: paste SEPOLIA_RPC_URL and PRIVATE_KEY (test wallet only)
```

### Deployment checklist

1. `npx hardhat test` green (12 passing) and `npm run build` green in `frontend/`.
2. Root `.env` filled locally; `git status` shows no `.env` (it is ignored).
3. Deployer wallet holds a little Sepolia test ETH for gas.
4. Run `npm run deploy:sepolia`, save the printed address.
5. Confirm `deployments/sepolia.json` shows `chainId: 11155111`.
6. Verify on Sepolia Etherscan (contract page shows the `BountyPilot` tx).
7. Point the frontend at Sepolia (localhost defaults untouched):
   `frontend/.env` → `VITE_CONTRACT_ADDRESS=<sepolia address>`,
   `VITE_EXPECTED_CHAIN_ID=11155111`; restart `npm run dev`.
8. In MetaMask, switch to Sepolia and re-run the E2E flow with test ETH.

### Exact commands (run only when you approve the deploy)

```powershell
cd G:\BountyPilot
npx hardhat test
npm run deploy:sepolia
Get-Content deployments\sepolia.json

cd frontend
npm run build
```
