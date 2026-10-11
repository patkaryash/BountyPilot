import { expect } from "chai";
import { ethers } from "hardhat";

/**
 * Stage 2 — Part A: focused security tests.
 * Preserves existing smoke tests; adds only missing critical cases.
 */
describe("BountyPilot (security: authorization + accounting)", function () {
  async function deployFixture() {
    const [owner, researcher, researcher2, other] = await ethers.getSigners();
    const BountyPilot = await ethers.getContractFactory("BountyPilot");
    const pilot = await BountyPilot.deploy();
    const pilotAddress = await pilot.getAddress();
    const RejectorFactory = await ethers.getContractFactory("ETHRejector");
    const rejector = await RejectorFactory.deploy();
    const rejectorAddress = await rejector.getAddress();
    return { pilot, pilotAddress, owner, researcher, researcher2, other, rejector, rejectorAddress };
  }

  it("researcher cannot review their own report unless they are the bounty owner", async function () {
    const { pilot, owner, researcher } = await deployFixture();
    await pilot.createBounty("scope");
    await pilot.fundBounty(0, { value: ethers.parseEther("1.0") });
    await pilot.connect(researcher).submitReport(0, "finding");

    // Researcher (non-owner) tries to approve their own report -> must fail
    await expect(
      pilot.connect(researcher).reviewReport(0, true, ethers.parseEther("0.1"))
    ).to.be.revertedWith("BountyPilot: only bounty owner");

    // Owner path still works
    await expect(pilot.connect(owner).reviewReport(0, true, ethers.parseEther("0.1")))
      .to.emit(pilot, "ReportReviewed");

    // Positive control: owner submits their own report and CAN review it
    // (researcher == owner is allowed because auth is owner-based)
    await pilot.connect(owner).submitReport(0, "owner self-finding");
    await expect(pilot.connect(owner).reviewReport(1, false, 0))
      .to.emit(pilot, "ReportReviewed");
  });

  it("unauthorized accounts cannot withdraw bounty funds", async function () {
    const { pilot, researcher, other } = await deployFixture();
    await pilot.createBounty("scope");
    await pilot.fundBounty(0, { value: ethers.parseEther("1.0") });

    await expect(
      pilot.connect(researcher).withdrawFunds(0, ethers.parseEther("0.1"))
    ).to.be.revertedWith("BountyPilot: only bounty owner");
    await expect(
      pilot.connect(other).withdrawFunds(0, ethers.parseEther("0.1"))
    ).to.be.revertedWith("BountyPilot: only bounty owner");

    // Funds untouched
    const bounty = await pilot.bounties(0);
    expect(bounty.totalFunds).to.equal(ethers.parseEther("1.0"));
  });

  it("a report cannot be approved or paid twice", async function () {
    const { pilot, owner, researcher } = await deployFixture();
    await pilot.createBounty("scope");
    await pilot.fundBounty(0, { value: ethers.parseEther("2.0") });
    await pilot.connect(researcher).submitReport(0, "bug");

    const reward = ethers.parseEther("0.5");
    await pilot.connect(owner).reviewReport(0, true, reward);

    // Second review (either direction) must fail
    await expect(
      pilot.connect(owner).reviewReport(0, true, reward)
    ).to.be.revertedWith("BountyPilot: already reviewed");
    await expect(
      pilot.connect(owner).reviewReport(0, false, 0)
    ).to.be.revertedWith("BountyPilot: already reviewed");

    // Claim once ok, twice fails
    await pilot.connect(researcher).claimReward(0);
    await expect(pilot.connect(researcher).claimReward(0)).to.be.revertedWith(
      "BountyPilot: not claimable"
    );
  });

  it("a rejected report cannot claim a reward", async function () {
    const { pilot, owner, researcher } = await deployFixture();
    await pilot.createBounty("scope");
    await pilot.fundBounty(0, { value: ethers.parseEther("1.0") });
    await pilot.connect(researcher).submitReport(0, "bug");
    await pilot.connect(owner).reviewReport(0, false, 0);

    const report = await pilot.reports(0);
    expect(report.status).to.equal(2); // Rejected

    await expect(pilot.connect(researcher).claimReward(0)).to.be.revertedWith(
      "BountyPilot: not claimable"
    );
  });

  it("two reports cannot reserve more than available funds", async function () {
    const { pilot, owner, researcher, researcher2 } = await deployFixture();
    await pilot.createBounty("scope");
    await pilot.fundBounty(0, { value: ethers.parseEther("1.0") });
    await pilot.connect(researcher).submitReport(0, "bug A");
    await pilot.connect(researcher2).submitReport(0, "bug B");

    // Reserve 0.6 for report 0 -> available drops to 0.4
    await pilot.connect(owner).reviewReport(0, true, ethers.parseEther("0.6"));
    expect(await pilot.availableFunds(0)).to.equal(ethers.parseEther("0.4"));

    // Second approval of 0.6 must fail (only 0.4 available)
    await expect(
      pilot.connect(owner).reviewReport(1, true, ethers.parseEther("0.6"))
    ).to.be.revertedWith("BountyPilot: reward exceeds available funds");

    // But 0.4 succeeds and fully reserves the bounty
    await pilot.connect(owner).reviewReport(1, true, ethers.parseEther("0.4"));
    expect(await pilot.availableFunds(0)).to.equal(0);

    // Owner cannot withdraw reserved funds
    await expect(
      pilot.connect(owner).withdrawFunds(0, ethers.parseEther("0.1"))
    ).to.be.revertedWith("BountyPilot: amount exceeds available funds");
  });

  it("failed ETH transfer reverts without corrupting accounting (claim)", async function () {
    const { pilot, pilotAddress, owner, rejector, rejectorAddress } = await deployFixture();
    await pilot.createBounty("scope");
    await pilot.fundBounty(0, { value: ethers.parseEther("1.0") });

    // Rejector contract is the researcher (no receive => ETH send fails)
    await rejector.submit(pilotAddress, 0, "bug from non-payable contract");
    const reportBefore = await pilot.reports(0);
    expect(reportBefore.researcher).to.equal(rejectorAddress);

    await pilot.connect(owner).reviewReport(0, true, ethers.parseEther("0.5"));
    const bountyBefore = await pilot.bounties(0);
    expect(bountyBefore.reservedFunds).to.equal(ethers.parseEther("0.5"));

    // Claim must revert with transfer failure...
    await expect(rejector.claim(pilotAddress, 0)).to.be.revertedWith(
      "BountyPilot: ETH transfer failed"
    );

    // ...and accounting must be unchanged (revert rolled back effects)
    const reportAfter = await pilot.reports(0);
    const bountyAfter = await pilot.bounties(0);
    expect(reportAfter.status).to.equal(1); // still Approved, not Claimed
    expect(reportAfter.reward).to.equal(ethers.parseEther("0.5"));
    expect(bountyAfter.totalFunds).to.equal(ethers.parseEther("1.0"));
    expect(bountyAfter.reservedFunds).to.equal(ethers.parseEther("0.5"));
    expect(await pilot.availableFunds(0)).to.equal(ethers.parseEther("0.5"));
  });

  it("failed ETH transfer reverts without corrupting accounting (withdraw)", async function () {
    const { pilot, pilotAddress, rejector, rejectorAddress } = await deployFixture();
    // Rejector contract creates the bounty, so it is the owner (non-payable)
    await rejector.createBounty(pilotAddress, "owned by non-payable contract");
    const bountyId = 0;
    const bounty = await pilot.bounties(bountyId);
    expect(bounty.owner).to.equal(rejectorAddress);

    // Anyone can fund it
    await pilot.fundBounty(bountyId, { value: ethers.parseEther("1.0") });

    // Withdraw to non-payable owner must fail and leave funds intact
    await expect(
      rejector.withdraw(pilotAddress, bountyId, ethers.parseEther("0.4"))
    ).to.be.revertedWith("BountyPilot: ETH transfer failed");

    const after = await pilot.bounties(bountyId);
    expect(after.totalFunds).to.equal(ethers.parseEther("1.0"));
    expect(after.reservedFunds).to.equal(0);
  });
});
