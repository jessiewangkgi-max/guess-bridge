const CONFIG = {
  chainIdHex: "0xaa36a7", // Sepolia
  guessAddress: "0x483aee89c55737eceaab61c4ffe0e74b0f88e4a8",

  // ★很重要：掃事件的起始區塊（你不知道就先用「最近 200000」）
  // 之後想更準：去 etherscan 看合約 deployment block 再改這個數字
  fromBlock: "latest-200000"
};

let provider, signer, me;
let guess, token;
let tokenDecimals = 18;
let tokenSymbol = "TOKEN";
let ownerAddr = null;

let currentQuestionId = 0;
let selectedOption = null;

const $ = (id) => document.getElementById(id);
const setMsg = (t) => $("msg").textContent = t || "";
const setWallet = (t) => $("walletInfo").textContent = t || "";
const setNet = (t) => $("netInfo").textContent = t || "";

function toRawInt(humanStr) {
  const v = BigInt(humanStr);
  return v * (10n ** BigInt(tokenDecimals));
}
function fromRawInt(raw) {
  const base = 10n ** BigInt(tokenDecimals);
  return (BigInt(raw) / base).toString();
}

async function ensureSepolia() {
  const cid = await window.ethereum.request({ method: "eth_chainId" });
  if (cid !== CONFIG.chainIdHex) throw new Error("請切到 Sepolia 測試鏈");
}

async function connect() {
  if (!window.ethereum) throw new Error("MetaMask not found");
  await window.ethereum.request({ method: "eth_requestAccounts" });

  provider = new ethers.BrowserProvider(window.ethereum);
  signer = await provider.getSigner();
  me = await signer.getAddress();

  await ensureSepolia();

  guess = new ethers.Contract(CONFIG.guessAddress, GUESS_ABI, signer);

  ownerAddr = await guess.owner();

  // ✅ 自動讀取 betToken 地址，不用你填
  const tokenAddr = await guess.betToken();
  token = new ethers.Contract(tokenAddr, ERC20_ABI, signer);

  tokenDecimals = await token.decimals();
  tokenSymbol = await token.symbol();
  $("tokenSymbol").textContent = tokenSymbol;

  setWallet(`Connected: ${me}`);
  setNet(`Network: Sepolia | Token: ${tokenSymbol} (decimals=${tokenDecimals}) | Owner: ${ownerAddr}`);

  await loadList();
  await loadDetail(currentQuestionId);
}

async function getQuestion(qid) {
  const q = await guess.getQuestion(qid);
  return {
    text: q[0],
    options: q[1],
    status: Number(q[2]), // 0 Open, 1 Resolved
    winningOption: BigInt(q[3]),
    totalPool: BigInt(q[4])
  };
}

function shorten(addr) {
  return addr.slice(0, 6) + "…" + addr.slice(-4);
}

function renderOptions(options, disabled=false) {
  const box = $("qOptions");
  box.innerHTML = "";
  selectedOption = null;

  // owner 的答案下拉也在這裡更新
  $("answerSel").innerHTML = "";
  options.forEach((optText, idx) => {
    const b = document.createElement("button");
    b.className = "optBtn";
    b.textContent = optText;
    b.disabled = disabled;
    b.onclick = () => {
      selectedOption = idx;
      [...box.children].forEach((x) => x.classList.remove("selected"));
      b.classList.add("selected");
    };
    box.appendChild(b);

    const o = document.createElement("option");
    o.value = String(idx);
    o.textContent = `${idx} - ${optText}`;
    $("answerSel").appendChild(o);
  });
}

async function loadList() {
  const count = Number(await guess.questionsCount());
  const tbody = $("qList");
  tbody.innerHTML = "";

  if (count === 0) {
    tbody.innerHTML = `<tr><td colspan="4" class="muted">尚無題目</td></tr>`;
    return;
  }

  for (let i = 0; i < count; i++) {
    const q = await getQuestion(i);
    const statusBadge = q.status === 0
      ? `<span class="badge open">Open</span>`
      : `<span class="badge resolved">Resolved</span>`;

    const tr = document.createElement("tr");
    tr.className = "trBtn";
    tr.innerHTML = `
      <td>${i}</td>
      <td>${q.text}</td>
      <td>${statusBadge}</td>
      <td>${fromRawInt(q.totalPool)} ${tokenSymbol}</td>
    `;
    tr.onclick = async () => { await loadDetail(i); };
    tbody.appendChild(tr);
  }
}

async function loadDetail(qid) {
  currentQuestionId = qid;

  const q = await getQuestion(qid);

  $("detailHeader").textContent = `questionId=${qid} | 狀態：${q.status === 0 ? "Open（可下注）" : "Resolved（已公布答案，不可下注）"}`;
  $("qText").textContent = q.text;

  $("poolInfo").textContent = `總池：${fromRawInt(q.totalPool)} ${tokenSymbol}`;

  // 每個選項池子
  const pools = [];
  for (let i = 0; i < q.options.length; i++) {
    const p = await guess.totalStakedPerOption(qid, i);
    pools.push(`${i}(${q.options[i]}): ${fromRawInt(BigInt(p))} ${tokenSymbol}`);
  }
  $("optionPools").textContent = `各選項累積：${pools.join(" | ")}`;

  // 下注區：Open 才可用
  const isOpen = (q.status === 0);
  $("betBox").style.display = isOpen ? "" : "none";
  $("resultBox").style.display = isOpen ? "none" : "";

  renderOptions(q.options, !isOpen);

  // 自己下注資訊
  const stakes = [];
  for (let i = 0; i < q.options.length; i++) {
    const s = await guess.userStake(qid, me, i);
    const si = BigInt(s);
    if (si > 0n) stakes.push(`${i}(${q.options[i]}): ${fromRawInt(si)} ${tokenSymbol}`);
  }
  if ($("myInfo")) $("myInfo").textContent = `你已下注：${stakes.length ? stakes.join(" | ") : "無"}`;

  // Resolved：顯示答案 + 對錯名單
  if (!isOpen) {
    const win = Number(q.winningOption);
    $("answerInfo").textContent = `答案：${win}（${q.options[win]}）`;

    await renderWinnersLosers(qid, win, q.options);
  }
}

async function approveAndBet() {
  if (selectedOption === null) throw new Error("請先選擇選項");
  const human = $("betAmount").value.trim();
  if (!human || isNaN(Number(human))) throw new Error("下注金額請輸入整數，例如 100");

  const raw = toRawInt(human);

  const allowance = await token.allowance(me, CONFIG.guessAddress);
  if (BigInt(allowance) < raw) {
    setMsg(`Approve 中…（${human} ${tokenSymbol}）`);
    const tx1 = await token.approve(CONFIG.guessAddress, raw);
    await tx1.wait();
  }

  setMsg(`下注中… 題目 ${currentQuestionId} 選項 ${selectedOption} 金額 ${human} ${tokenSymbol}`);
  const tx2 = await guess.bet(currentQuestionId, selectedOption, raw);
  await tx2.wait();

  setMsg("✅ 下注成功");
  await loadList();
  await loadDetail(currentQuestionId);
}

async function createQuestion() {
  if (me.toLowerCase() !== ownerAddr.toLowerCase()) throw new Error("你不是 Owner，不能出題");

  const text = $("newText").value.trim();
  const optionsStr = $("newOptions").value.trim();
  let options;
  try { options = JSON.parse(optionsStr); }
  catch { throw new Error("選項請填 JSON array，例如 [\"A\",\"B\",\"C\"]"); }
  if (!Array.isArray(options) || options.length < 2) throw new Error("選項至少 2 個");

  setMsg("出題中…");
  const tx = await guess.createQuestion(text, options);
  await tx.wait();

  setMsg("✅ 出題成功");
  await loadList();
}

async function resolveQuestion() {
  if (me.toLowerCase() !== ownerAddr.toLowerCase()) throw new Error("你不是 Owner，不能公布答案");
  const ans = BigInt($("answerSel").value);

  setMsg("公布答案中…");
  const tx = await guess.resolve(currentQuestionId, ans);
  await tx.wait();

  setMsg("✅ 已公布答案");
  await loadList();
  await loadDetail(currentQuestionId);
}

async function claim() {
  setMsg("領獎中…");
  const tx = await guess.claim(currentQuestionId);
  await tx.wait();
  setMsg("✅ 已領獎");
  await loadDetail(currentQuestionId);
}

async function refund() {
  setMsg("退款中…");
  const tx = await guess.refund(currentQuestionId);
  await tx.wait();
  setMsg("✅ 已退款");
  await loadDetail(currentQuestionId);
}

/**
 * 用 BetPlaced 事件掃出參與者 → 判斷答對/答錯
 * 注意：fromBlock 範圍太大會慢，你可把 CONFIG.fromBlock 調小或改成部署區塊號
 */
async function renderWinnersLosers(qid, winOption, options) {
  $("winners").textContent = "載入中…";
  $("losers").textContent = "載入中…";

  // 用 interface 解析 logs
  const iface = new ethers.Interface(GUESS_ABI);
  const topic = iface.getEvent("BetPlaced").topicHash;

  // fromBlock 支援 "latest-200000" 這種寫法：我們換算成實際 block
  let fromBlock = CONFIG.fromBlock;
  if (typeof fromBlock === "string" && fromBlock.startsWith("latest-")) {
    const n = Number(fromBlock.split("-")[1]);
    const latest = await provider.getBlockNumber();
    fromBlock = Math.max(latest - n, 0);
  }

  const logs = await provider.getLogs({
    address: CONFIG.guessAddress,
    fromBlock,
    toBlock: "latest",
    topics: [topic]
  });

  // 彙整：每個 address 在這題押哪個 option（你這合約允許多選項加押，所以要累積）
  const userToOptionStake = new Map(); // addr -> Map<optionId, rawStake>

  for (const lg of logs) {
    const parsed = iface.parseLog(lg);
    const questionId = Number(parsed.args.questionId);
    if (questionId !== qid) continue;

    const user = String(parsed.args.user).toLowerCase();
    const optionId = Number(parsed.args.optionId);
    const amount = BigInt(parsed.args.amount);

    if (!userToOptionStake.has(user)) userToOptionStake.set(user, new Map());
    const m = userToOptionStake.get(user);
    m.set(optionId, (m.get(optionId) || 0n) + amount);
  }

  // 判斷對錯：只要在 winningOption 有 stake > 0 就算答對
  const winners = [];
  const losers = [];

  for (const [user, m] of userToOptionStake.entries()) {
    const winStake = m.get(winOption) || 0n;

    // 顯示每人下注摘要
    const parts = [];
    for (const [opt, amt] of m.entries()) {
      parts.push(`${opt}(${options[opt]}): ${fromRawInt(amt)} ${tokenSymbol}`);
    }
    const line = `${shorten(user)}  |  ${parts.join(" , ")}`;

    if (winStake > 0n) winners.push(line);
    else losers.push(line);
  }

  $("winners").textContent = winners.length ? winners.join("\n") : "（目前掃不到下注者／或 fromBlock 範圍太小）";
  $("losers").textContent = losers.length ? losers.join("\n") : "（無）";
}

function wire() {
  $("btnConnect").onclick = async () => {
    try { await connect(); }
    catch (e) { setMsg(`❌ ${e.message || e}`); }
  };

  $("btnReload").onclick = async () => {
    try { await loadList(); }
    catch (e) { setMsg(`❌ ${e.message || e}`); }
  };

  $("btnApproveBet").onclick = async () => {
    try { await approveAndBet(); }
    catch (e) { setMsg(`❌ ${e.message || e}`); }
  };

  $("btnCreate").onclick = async () => {
    try { await createQuestion(); }
    catch (e) { setMsg(`❌ ${e.message || e}`); }
  };

  $("btnResolve").onclick = async () => {
    try { await resolveQuestion(); }
    catch (e) { setMsg(`❌ ${e.message || e}`); }
  };

  $("btnClaim").onclick = async () => {
    try { await claim(); }
    catch (e) { setMsg(`❌ ${e.message || e}`); }
  };

  $("btnRefund").onclick = async () => {
    try { await refund(); }
    catch (e) { setMsg(`❌ ${e.message || e}`); }
  };

  $("btnRefresh").onclick = async () => {
    try { await loadDetail(currentQuestionId); }
    catch (e) { setMsg(`❌ ${e.message || e}`); }
  };
}

wire();
setMsg("請先 Connect MetaMask（Sepolia）");
