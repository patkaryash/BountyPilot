import { expect } from "chai";
import { ethers } from "hardhat";

describe("BountyPilot (scaffold smoke tests)", function () {
  async function deployFixture() {
    const [owner, researcher, other] = await ethers.getSigners();
    const BountyPilot = await ethers.getContractFactory("BountyPilot");
    const pilot = await BountyPilot.deploy();
    return { pilot, owner, researcher, other };
  }

  it("creates a bounty and emits BountyCreated", async function () {
    const { pilot, owner } = await deployFixture();
    await expect(pilot.createBounty("Test scope: example.com"))
      .to.emit(pilot, "BountyCreated")
      .withArgs(0, owner.address, "Test scope: example.com");
    const bounty = await pilot.bounties(0);
    expect(bounty.owner).to.equal(owner.address);
    expect(bounty.exists).to.equal(true);
  });

  it("funds a bounty and tracks totalFunds", async function () {
    const { pilot } = await deployFixture();
    await pilot.createBounty("scope");
    await pilot.fundBounty(0, { value: ethers.parseEther("1.0") });
    const bounty = await pilot.bounties(0);
    expect(bounty.totalFunds).to.equal(ethers.parseEther("1.0"));
  });

  it("full flow: submit -> approve -> claim pays researcher once", async function () {
    const { pilot, owner, researcher } = await deployFixture();
    await pilot.createBounty("scope");
    await pilot.fundBounty(0, { value: ethers.parseEther("2.0") });

    await expect(pilot.connect(researcher).submitReport(0, "XSS in login form"))
      .to.emit(pilot, "ReportSubmitted")
      .withArgs(0, 0, researcher.address);

    const reward = ethers.parseEther("0.5");
    await expect(pilot.connect(owner).reviewReport(0, true, reward))
      .to.emit(pilot, "ReportReviewed")
      .withArgs(0, 0, true, reward);

    await expect(pilot.connect(researcher).claimReward(0))
      .to.emit(pilot, "RewardClaimed")
      .withArgs(0, 0, researcher.address, reward);

    const report = await pilot.reports(0);
    expect(report.status).to.equal(3); // Claimed

    // Cannot claim twice
    await expect(pilot.connect(researcher).claimReward(0)).to.be.revertedWith(
      "BountyPilot: not claimable"
    );
  });

  it("rejects approval exceeding available funds", async function () {
    const { pilot, owner, researcher } = await deployFixture();
    await pilot.createBounty("scope");
    await pilot.fundBounty(0, { value: ethers.parseEther("1.0") });
    await pilot.connect(researcher).submitReport(0, "bug");
    await expect(
      pilot.connect(owner).reviewReport(0, true, ethers.parseEther("2.0"))
    ).to.be.revertedWith("BountyPilot: reward exceeds available funds");
  });

  it("only owner can review; only researcher can claim", async function () {
    const { pilot, owner, researcher, other } = await deployFixture();
    await pilot.createBounty("scope");
    await pilot.fundBounty(0, { value: ethers.parseEther("1.0") });
    await pilot.connect(researcher).submitReport(0, "bug");

    await expect(
      pilot.connect(other).reviewReport(0, true, ethers.parseEther("0.1"))
    ).to.be.revertedWith("BountyPilot: only bounty owner");

    await pilot.connect(owner).reviewReport(0, true, ethers.parseEther("0.1"));
    await expect(pilot.connect(other).claimReward(0)).to.be.revertedWith(
      "BountyPilot: only researcher"
    );
  });
});
