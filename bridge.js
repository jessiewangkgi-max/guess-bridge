(async function () {
  const status = document.getElementById("status");

  if (!window.ethereum) {
    status.textContent = "❌ 未偵測到 MetaMask";
    return;
  }

  try {
    await window.ethereum.request({ method: "eth_requestAccounts" });
    // ✅ 成功後直接進主頁（不會卡住）
    window.location.href = "./index.html";
  } catch (e) {
    status.textContent = "❌ 使用者拒絕連線";
  }
})();
