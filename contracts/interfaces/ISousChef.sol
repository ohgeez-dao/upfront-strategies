// SPDX-License-Identifier: WTFPL

pragma solidity ^0.8.0;

interface ISousChef {
    error TooEarly();
    error InvalidPid();
    error InvalidFSushiVault();
    error InvalidFSushiController();
    error NoClaimableRewards();

    event UpdateFSushiVault(address indexed fSushiVault);
    event UpdateFSushiController(address indexed fSushiController);
    event Deposit(uint256 indexed pid, uint256 amount, address indexed beneficiary);
    event Withdraw(uint256 indexed pid, uint256 amount, address indexed beneficiary);
    event Checkpoint(uint256 indexed pid, uint256 lastCheckpoint);
    event UserCheckpoint(uint256 indexed pid, address indexed account, uint256 lastCheckpoint);
    event AllocateRewards(uint256 indexed pid, address indexed account, uint256 allocatedRewards);
    event ClaimRewards(uint256 indexed pid, address indexed account, address indexed beneficiary, uint256 amount);

    function BONUS_MULTIPLIER() external view returns (uint256);

    function REWARDS_FOR_INITIAL_WEEK() external view returns (uint256);

    function fSushi() external view returns (address);

    function flashStrategyFactory() external view returns (address);

    function startWeek() external view returns (uint256);

    function vault() external view returns (address);

    function controller() external view returns (address);

    function weeklyRewards(uint256 time) external view returns (uint256);

    function allocatedRewards(uint256 pid, address account) external view returns (uint256);

    function claimedRewards(uint256 pid, address account) external view returns (uint256);

    function checkpoints(uint256 pid, uint256 index) external view returns (uint256 amount, uint256 timestamp);

    function checkpointsLength(uint256 pid) external view returns (uint256);

    function points(uint256 pid, uint256 time) external view returns (uint256);

    function lastCheckpoint(uint256 pid) external view returns (uint256 time);

    function userCheckpoints(
        uint256 pid,
        address account,
        uint256 index
    ) external view returns (uint256 amount, uint256 timestamp);

    function userPoints(
        uint256 pid,
        address account,
        uint256 time
    ) external view returns (uint256);

    function userLastCheckpoint(uint256 pid, address account) external view returns (uint256 time);

    function userCheckpointsLength(uint256 pid, address account) external view returns (uint256);

    function updateFSushiVault(address _fSushiVault) external;

    function updateFSushiController(address _fSushiController) external;

    function deposit(
        uint256 pid,
        uint256 amount,
        address beneficiary
    ) external;

    function withdraw(
        uint256 pid,
        uint256 amount,
        address beneficiary
    ) external;

    function claimRewards(uint256 pid, address beneficiary) external;

    function checkpoint(uint256 pid) external;

    function userCheckpoint(uint256 pid, address account) external;
}
