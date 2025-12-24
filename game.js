const GUESS_CONTRACT = "0x483aee89c55737eceaab61c4ffe0e74b0f88e4a8";
const KGIT_DECIMALS = 18n;

async function bet(optionId) {
  if (!window.ethereum) {
    alert("MetaMask not found");
    return;
  }

  const accounts = await ethereum.request({ method: "eth_accounts" });
  if (accounts.length === 0) {
    alert("尚未連線 MetaMask");
    return;
  }

  const humanAmount = document.getElementById("amount").value;
  const amount = BigInt(humanAmount) * 10n ** KGIT_DECIMALS;

  document.getElementById("status").innerText =
    `下注中：選項 ${optionId}，金額 ${humanAmount} KGIT（raw: ${amount}）`;

  // ⚠️ 下一步這裡會接 ethers.js / wagmi / viem
  // 呼叫 bet(questionId=0, optionId, amount)
}
