const CONFIG = {
  chainIdHex: "0xaa36a7", // Sepolia = 11155111
  guessAddress: "0x483aee89c55737eceaab61c4ffe0e74b0f88e4a8",
  tokenAddress: "0x07e7AF255D6e349a9E8fDC2D5ecB0479C6641945", // ← 你填 KGIT 合約地址
  questionId: 0
};

// === 你合約的 function 名稱如果不同，只要改這裡 ===
// （我先用最常見命名；若你合約不同，去 Remix 看一下方法名對應改掉）
const FN = {
  createQuestion: "createQuestion",
  bet: "bet",
  resolve: "resolveQuestion",     // 有些叫 resolve / finalize
  claim: "claim",
  refund: "refund",
  getQuestion: "getQuestion"      // 有些是 questions(0) 或 getQuestion(0)
};

let provider, signer, me;
let guess, token;
let selectedOption = null;
let tokenDecimals = 18;
let tokenSymbol = "TOKEN";

const $ = (id) => document.getElementById(id);

function setMsg(t) { $("msg").textContent = t || ""; }
function setWallet(t) { $("walletInfo").textContent = t || ""; }
function setNet(t) { $("netInfo").textContent = t || ""; }
function setState(t) { $("stateInfo").textContent = t || ""; }

function toRaw(humanStr) {
  const v = BigInt(humanStr);
  return v * (10n ** BigInt(tokenDecimals));
}

function fmtRaw(raw) {
  // 顯示人類直覺整數（你希望遮掉精度）
  const base = 10n ** BigInt(tokenDecimals);
  return (BigInt(raw) / base).toString();
}

async function ensureSepolia() {
  const cid = await window.ethereum.request({ method: "eth_chainId" });
  if (cid !== CONFIG.chainIdHex) {
    throw new Error("請切換到 Sepolia");
  }
}

async function connect() {
  if (!window.ethereum) throw new Error("MetaMask not found");
  await window.ethereum.request({ method: "eth_requestAccounts" });

  provider = new ethers.BrowserProvider(window.ethereum);
  signer = await provider.getSigner();
  me = await signer.getAddress();

  await ensureSepolia();

  guess = new ethers.Contract(CONFIG.guessAddress, GUESS_ABI, signer);
  token = new ethers.Contract(CONFIG.tokenAddress, ERC20_ABI, signer);

  tokenDecimals = await token.decimals();
  tokenSymbol = await token.symbol();

  setWallet(`Connected: ${me}`);
  setNet(`Network: Sepolia | Token: ${tokenSymbol} (decimals=${tokenDecimals})`);

  await refreshQuestion();
}

async function refreshQuestion() {
  // 你合約怎麼存題目不確定，所以我做兩層：
  // 1) 若你 ABI 有 getQuestion(questionId) 回傳 (text, options, ...)
  // 2) 否則就先顯示預設，讓你先跑通 bet/resolve/claim/refund
  let text = "（尚未從鏈上讀到題目，請確認 getQuestion / questions 方法名）";
  let options = ["A","B","C"];

  try {
    const q = await guess[FN.getQuestion](CONFIG.questionId);

    // 常見回傳型態：
    // q[0]=text, q[1]=options(string[])
    // 或 q.text, q.options
    text = q.text ?? q[0] ?? text;
    options = q.options ?? q[1] ?? options;
  } catch (e) {
    // ignore, keep default
  }

  $("qText").textContent = `題目：${text}`;
  renderOptions(options);
  setState(`目前選擇：${selectedOption === null ? "未選" : selectedOption} | 下注單位：${tokenSymbol}`);
}

function renderOptions(options) {
  const box = $("qOptions");
  box.innerHTML = "";
  options.forEach((opt, idx) => {
    const b = document.createElement("button");
    b.className = "optBtn" + (selectedOption === idx ? " selected" : "");
    b.textContent = opt;
    b.onclick = () => {
      selectedOption = idx;
      renderOptions(options);
      setState(`已選：${idx}（${opt}）`);
    };
    box.appendChild(b);
  });
}

async function approveAndBet() {
  if (selectedOption === null) throw new Error("請先選 A/B/C");
  const human = $("betAmount").value.trim();
  if (!human || isNaN(Number(human))) throw new Error("下注金額請輸入整數，例如 100");

  const raw = toRaw(human);

  // 1) allowance 檢查
  const allowance = await token.allowance(me, CONFIG.guessAddress);
  if (BigInt(allowance) < raw) {
    setMsg(`Approve 中…（${human} ${tokenSymbol}）`);
    const tx1 = await token.approve(CONFIG.guessAddress, raw);
    await tx1.wait();
  }

  // 2) bet
  setMsg(`下注中… 選項 ${selectedOption} 金額 ${human} ${tokenSymbol}`);
  const tx2 = await guess[FN.bet](CONFIG.questionId, selectedOption, raw);
  await tx2.wait();

  setMsg(`✅ 下注成功：${human} ${tokenSymbol}`);
}

async function createQuestion() {
  const text = $("newText").value.trim();
  const optionsStr = $("newOptions").value.trim();

  let options;
  try {
    options = JSON.parse(optionsStr);
  } catch {
    throw new Error("選項請填 JSON array，例如 [\"A\",\"B\",\"C\"]");
  }
  if (!Array.isArray(options) || options.length < 2) throw new Error("選項至少 2 個");

  setMsg("出題中…（寫入鏈上）");
  const tx = await guess[FN.createQuestion](text, options);
  await tx.wait();
  setMsg("✅ 出題成功");
  await refreshQuestion();
}

async function resolveQuestion() {
  const ans = Number($("answerSel").value);
  setMsg(`公布答案中… option=${ans}`);
  const tx = await guess[FN.resolve](CONFIG.questionId, ans);
  await tx.wait();
  setMsg("✅ 已公布答案");
}

async function claim() {
  setMsg("領獎中…");
  const tx = await guess[FN.claim](CONFIG.questionId);
  await tx.wait();
  setMsg("✅ 已領獎");
}

async function refund() {
  setMsg("退款中…");
  const tx = await guess[FN.refund](CONFIG.questionId);
  await tx.wait();
  setMsg("✅ 已退款");
}

function wire() {
  $("btnConnect").onclick = async () => {
    try { await connect(); } catch (e) { setMsg(`❌ ${e.message || e}`); }
  };

  $("btnRefresh").onclick = async () => {
    try { await refreshQuestion(); } catch (e) { setMsg(`❌ ${e.message || e}`); }
  };

  $("btnApproveBet").onclick = async () => {
    try { await approveAndBet(); } catch (e) { setMsg(`❌ ${e.message || e}`); }
  };

  $("btnCreate").onclick = async () => {
    try { await createQuestion(); } catch (e) { setMsg(`❌ ${e.message || e}`); }
  };

  $("btnResolve").onclick = async () => {
    try { await resolveQuestion(); } catch (e) { setMsg(`❌ ${e.message || e}`); }
  };

  $("btnClaim").onclick = async () => {
    try { await claim(); } catch (e) { setMsg(`❌ ${e.message || e}`); }
  };

  $("btnRefund").onclick = async () => {
    try { await refund(); } catch (e) { setMsg(`❌ ${e.message || e}`); }
  };
}

wire();
setMsg("請先 Connect MetaMask（Sepolia）");
