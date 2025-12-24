async function connect() {
  if (!window.ethereum) {
    document.getElementById("status").innerText = "❌ 未偵測到 MetaMask";
    return;
  }

  try {
    await window.ethereum.request({
      method: "eth_requestAccounts",
    });

    // ✅ 連線成功後直接跳轉到下注頁
    window.location.href = "./index.html";
  } catch (err) {
    document.getElementById("status").innerText = "❌ 使用者拒絕連線";
  }
}

connect();
