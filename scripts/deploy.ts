import { ethers, network } from "hardhat";
import * as fs from "fs";
import * as path from "path";

async function main() {
  const BountyPilot = await ethers.getContractFactory("BountyPilot");
  const bountyPilot = await BountyPilot.deploy();
  await bountyPilot.waitForDeployment();
  const address = await bountyPilot.getAddress();
  const net = await ethers.provider.getNetwork();
  const chainId = Number(net.chainId);
  console.log(`BountyPilot deployed to: ${address}`);

  // Persist for frontend config (localhost MVP). No secrets written.
  const dir = path.join(__dirname, "..", "deployments");
  fs.mkdirSync(dir, { recursive: true });
  const outFile = path.join(dir, `${network.name}.json`);
  fs.writeFileSync(
    outFile,
    JSON.stringify(
      { contract: "BountyPilot", network: network.name, chainId, address },
      null,
      2
    ) + "\n"
  );
  console.log(`Deployment info written to: ${outFile}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
