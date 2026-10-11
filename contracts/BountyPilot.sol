// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/// @title BountyPilot — minimal distributed bug bounty platform (MVP, NOT audited)
/// @notice College MVP. Not production-ready. No audit. Use test ETH only.
contract BountyPilot is ReentrancyGuard {
    enum ReportStatus {
        Submitted, // 0: just submitted, awaiting review
        Approved, // 1: owner approved with a fixed reward
        Rejected, // 2: owner rejected, terminal
        Claimed // 3: reward paid out, terminal
    }

    struct Bounty {
        address owner;
        string metadata; // title/description/scope (keep short; no IPFS in MVP)
        uint256 totalFunds; // ETH currently held for this bounty
        uint256 reservedFunds; // sum of approved-but-unclaimed rewards
        bool exists;
    }

    struct Report {
        uint256 bountyId;
        address researcher;
        string reportData; // vulnerability details or hash (MVP stores on-chain string)
        uint256 reward; // fixed at approval time, paid at claim time
        ReportStatus status;
        bool exists;
    }

    uint256 public nextBountyId;
    uint256 public nextReportId;

    mapping(uint256 => Bounty) public bounties;
    mapping(uint256 => Report) public reports;

    event BountyCreated(uint256 indexed bountyId, address indexed owner, string metadata);
    event BountyFunded(uint256 indexed bountyId, address indexed funder, uint256 amount);
    event ReportSubmitted(
        uint256 indexed reportId,
        uint256 indexed bountyId,
        address indexed researcher
    );
    event ReportReviewed(
        uint256 indexed reportId,
        uint256 indexed bountyId,
        bool approved,
        uint256 reward
    );
    event RewardClaimed(uint256 indexed reportId, uint256 indexed bountyId, address indexed researcher, uint256 reward);
    event FundsWithdrawn(uint256 indexed bountyId, address indexed owner, uint256 amount);

    /// @notice Create a new bounty program. Caller becomes the owner.
    /// @param metadata Short description of scope/rules. Must not be empty.
    /// @return bountyId The new bounty id.
    function createBounty(string calldata metadata) external returns (uint256 bountyId) {
        require(bytes(metadata).length > 0, "BountyPilot: metadata required");
        bountyId = nextBountyId++;
        bounties[bountyId] = Bounty({
            owner: msg.sender,
            metadata: metadata,
            totalFunds: 0,
            reservedFunds: 0,
            exists: true
        });
        emit BountyCreated(bountyId, msg.sender, metadata);
    }

    /// @notice Fund a bounty with ETH. Anyone can fund; funds belong to the bounty.
    /// @param bountyId Target bounty.
    function fundBounty(uint256 bountyId) external payable {
        Bounty storage bounty = bounties[bountyId];
        require(bounty.exists, "BountyPilot: bounty not found");
        require(msg.value > 0, "BountyPilot: must send ETH");
        bounty.totalFunds += msg.value;
        emit BountyFunded(bountyId, msg.sender, msg.value);
    }

    /// @notice Submit a vulnerability report for a bounty.
    /// @param bountyId Target bounty.
    /// @param reportData Details of the finding. Must not be empty.
    /// @return reportId The new report id.
    function submitReport(
        uint256 bountyId,
        string calldata reportData
    ) external returns (uint256 reportId) {
        Bounty storage bounty = bounties[bountyId];
        require(bounty.exists, "BountyPilot: bounty not found");
        require(bytes(reportData).length > 0, "BountyPilot: report required");
        reportId = nextReportId++;
        reports[reportId] = Report({
            bountyId: bountyId,
            researcher: msg.sender,
            reportData: reportData,
            reward: 0,
            status: ReportStatus.Submitted,
            exists: true
        });
        emit ReportSubmitted(reportId, bountyId, msg.sender);
    }

    /// @notice Owner approves (with reward) or rejects a report.
    /// @dev Approval reserves funds: reward <= totalFunds - reservedFunds.
    /// @param reportId Target report.
    /// @param approved True to approve, false to reject.
    /// @param reward ETH reward if approving. Must be > 0 and affordable.
    function reviewReport(uint256 reportId, bool approved, uint256 reward) external {
        Report storage report = reports[reportId];
        require(report.exists, "BountyPilot: report not found");
        require(report.status == ReportStatus.Submitted, "BountyPilot: already reviewed");
        Bounty storage bounty = bounties[report.bountyId];
        require(msg.sender == bounty.owner, "BountyPilot: only bounty owner");
        if (approved) {
            require(reward > 0, "BountyPilot: reward must be > 0");
            uint256 available = bounty.totalFunds - bounty.reservedFunds;
            require(reward <= available, "BountyPilot: reward exceeds available funds");
            report.reward = reward;
            report.status = ReportStatus.Approved;
            bounty.reservedFunds += reward;
        } else {
            require(reward == 0, "BountyPilot: rejected reward must be 0");
            report.status = ReportStatus.Rejected;
        }
        emit ReportReviewed(reportId, report.bountyId, approved, reward);
    }

    /// @notice Researcher claims an approved reward. Pays exactly the approved amount, once.
    /// @dev Checks-effects-interactions + nonReentrant.
    /// @param reportId Target report.
    function claimReward(uint256 reportId) external nonReentrant {
        Report storage report = reports[reportId];
        require(report.exists, "BountyPilot: report not found");
        require(report.status == ReportStatus.Approved, "BountyPilot: not claimable");
        require(msg.sender == report.researcher, "BountyPilot: only researcher");
        Bounty storage bounty = bounties[report.bountyId];
        uint256 reward = report.reward;
        require(reward > 0, "BountyPilot: no reward set");
        require(reward <= bounty.totalFunds, "BountyPilot: insufficient bounty funds");
        require(reward <= bounty.reservedFunds, "BountyPilot: accounting error");

        // Effects first
        report.status = ReportStatus.Claimed;
        bounty.reservedFunds -= reward;
        bounty.totalFunds -= reward;

        // Interaction last
        (bool ok, ) = payable(report.researcher).call{value: reward}("");
        require(ok, "BountyPilot: ETH transfer failed");

        emit RewardClaimed(reportId, report.bountyId, report.researcher, reward);
    }

    /// @notice Owner withdraws unreserved funds (totalFunds - reservedFunds).
    /// @dev Checks-effects-interactions + nonReentrant.
    /// @param bountyId Target bounty.
    /// @param amount Amount to withdraw.
    function withdrawFunds(uint256 bountyId, uint256 amount) external nonReentrant {
        Bounty storage bounty = bounties[bountyId];
        require(bounty.exists, "BountyPilot: bounty not found");
        require(msg.sender == bounty.owner, "BountyPilot: only bounty owner");
        require(amount > 0, "BountyPilot: amount must be > 0");
        uint256 available = bounty.totalFunds - bounty.reservedFunds;
        require(amount <= available, "BountyPilot: amount exceeds available funds");

        bounty.totalFunds -= amount;

        (bool ok, ) = payable(bounty.owner).call{value: amount}("");
        require(ok, "BountyPilot: ETH transfer failed");

        emit FundsWithdrawn(bountyId, bounty.owner, amount);
    }

    /// @notice View unreserved (spendable/promisable) funds for a bounty.
    function availableFunds(uint256 bountyId) external view returns (uint256) {
        Bounty storage bounty = bounties[bountyId];
        require(bounty.exists, "BountyPilot: bounty not found");
        return bounty.totalFunds - bounty.reservedFunds;
    }
}
