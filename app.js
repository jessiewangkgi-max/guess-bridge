// ================== 全域變數 ==================
let provider;
let signer;
let guess;
let token;
let me;
let ownerAddr;
let tokenDecimals = 0;
let tokenSymbol = "";

// ================== 設定 ==================
const CONFIG = {
  chainIdHex: "0xaa36a7", // Sepolia
  guessAddress: "0x483aee89c55737eceaab61c4ffe0e74b0f88e4a8",
  fromBlock: 0 // 可之後改成部署 block number
};

// ================== 工具 ==================
function toUnits(n) {
  return BigInt(n) * 10n ** BigInt(tokenDecimals);
}
function fromUnits(bn) {
  return Number(bn) / 10 ** tokenDecimals;
}

// ================== Connect MetaMask ==================
async function connect() {
  try {
    if (!window.ethereum) throw new Error("MetaMask not found");

    await window.ethereum.request({ method: "eth_requestAccounts" });

    provider = new ethers.BrowserProvider(window.ethereum);
    signer = await provider.getSigner();
    me = await signer.getAddress();

    const chainId = await window.ethereum.request({ method: "eth_chainId" });
    if (chainId !== CONFIG.chainIdHex) {
      throw new Error("請切換到 Sepolia 測試鏈");
    }

    // Guess contract
    guess = new ethers.Contract(
      CONFIG.guessAddress,
      GUESS_ABI,
      signer
    );

    // Owner
    ownerAddr = await guess.owner();

    // Token（自動讀）
    const tokenAddr = await guess.betToken();
    token = new ethers.Contract(tokenAddr, ERC20_ABI, signer);
    tokenDecimals = await token.decimals();
    tokenSymbol = await token.symbol();

    document.getElementById("status").textContent = "✅ 已連線";
    document.getElementById("walletInfo").textContent = `Wallet: ${me}`;
    document.getElementById("tokenInfo").textContent = `Token: ${tokenSymbol}`;

    await loadQuestions();
  } catch (err) {
    document.getElementById("status").textContent = "❌ " + err.message;
    console.error(err);
  }
}

// ================== 載入題目列表 ==================
async function loadQuestions() {
  const list = document.getElementById("questions");
  list.innerHTML = "";

  const count = Number(await guess.questionsCount());

  for (let i = 0; i < count; i++) {
    const q = await guess.getQuestion(i);

    const div = document.createElement("div");
    div.className = "question";

    const statusText = q.status === 0 ? "開放下注" : "已公布答案";
    const pool = fromUnits(q.totalPool);

    div.innerHTML = `
      <h3>#${i} ${q.text}</h3>
      <p>狀態：${statusText}</p>
      <p>獎池：${pool} ${tokenSymbol}</p>
      <button onclick="openDetail(${i})">查看</button>
      <hr/>
    `;

    list.appendChild(div);
  }
}

// ================== 題目詳情 ==================
async function openDetail(id) {
  const box = document.getElementById("detail");
  box.innerHTML = "";

  const q = await guess.getQuestion(id);

  let html = `<h2>${q.text}</h2>`;

  // 顯示選項
  for (let i = 0; i < q.options.length; i++) {
    const total = await guess.totalStakedPerOption(id, i);
    html += `<p>選項 ${i}: ${q.options[i]}（${fromUnits(total)} ${tokenSymbol}）</p>`;
  }

  // 已公布
  if (q.status === 1) {
    html += `<h3>✅ 答案：${q.options[q.winningOption]}</h3>`;

    const myStake = await guess.userStake(id, me, q.winningOption);
    if (myStake > 0n) {
      html += `<button onclick="claim(${id})">Claim 獎金</button>`;
    } else {
      html += `<p>你沒有答對</p>`;
    }
  }

  // 可下注
  if (q.status === 0) {
    html += `
      <h3>下注</h3>
      <select id="opt">
        ${q.options.map((_, i) => `<option value="${i}">${i}</option>`).join("")}
      </select>
      <input id="amt" type="number" placeholder="下注數量"/>
      <button onclick="bet(${id})">下注</button>
    `;
  }

  box.innerHTML = html;
}

// ================== Bet ==================
async function bet(qid) {
  const opt = Number(document.getElementById("opt").value);
  const amt = document.getElementById("amt").value;

  if (!amt || amt <= 0) {
    alert("請輸入下注數量");
    return;
  }

  const amount = toUnits(amt);

  const allowance = await token.allowance(me, CONFIG.guessAddress);
  if (allowance < amount) {
    const tx1 = await token.approve(CONFIG.guessAddress, amount);
    await tx1.wait();
  }

  const tx2 = await guess.bet(qid, opt, amount);
  await tx2.wait();

  alert("下注成功");
  await openDetail(qid);
  await loadQuestions();
}

// ================== Claim ==================
async function claim(qid) {
  const tx = await guess.claim(qid);
  await tx.wait();
  alert("已領獎");
  await openDetail(qid);
}

// ================== 綁定 ==================
window.addEventListener("load", () => {
  document.getElementById("connectBtn").onclick = connect;
});
