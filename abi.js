// ====== 你要填的：猜題合約 ABI（從 Remix 複製貼上） ======
const GUESS_ABI = [
  // 把 Remix 的 ABI JSON array 貼在這裡
];

// ====== ERC20 最小 ABI（approve/allowance/balanceOf/decimals/symbol） ======
const ERC20_ABI = [
  "function approve(address spender, uint256 amount) external returns (bool)",
  "function allowance(address owner, address spender) external view returns (uint256)",
  "function balanceOf(address owner) external view returns (uint256)",
  "function decimals() external view returns (uint8)",
  "function symbol() external view returns (string)"
];
