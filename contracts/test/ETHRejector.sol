// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IBountyPilot {
    function submitReport(uint256 bountyId, string calldata reportData) external returns (uint256);
    function claimReward(uint256 reportId) external;
    function createBounty(string calldata metadata) external returns (uint256);
    function withdrawFunds(uint256 bountyId, uint256 amount) external;
}

/// @notice Test helper with NO receive()/fallback — ETH transfers to it always fail.
/// @dev Used to prove failed claim/withdraw reverts and does not corrupt accounting.
contract ETHRejector {
    function submit(address pilot, uint256 bountyId, string calldata data) external returns (uint256) {
        return IBountyPilot(pilot).submitReport(bountyId, data);
    }

    function claim(address pilot, uint256 reportId) external {
        IBountyPilot(pilot).claimReward(reportId);
    }

    function createBounty(address pilot, string calldata metadata) external returns (uint256) {
        return IBountyPilot(pilot).createBounty(metadata);
    }

    function withdraw(address pilot, uint256 bountyId, uint256 amount) external {
        IBountyPilot(pilot).withdrawFunds(bountyId, amount);
    }
}
