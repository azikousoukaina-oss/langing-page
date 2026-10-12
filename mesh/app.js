(() => {
  const STORAGE_KEY = "mesh.chat.v1";
  const MODE_KEY = "mesh.mode.v1";
  const API = "https://text.pollinations.ai/openai";

  const MODES = [
    { id: "open", label: "Open chat", desc: "Talk about anything, freely", prompt: "Be a sharp, friendly free AI companion. Discuss literally anything the user wants — no topic is off-limits unless it requires real-world harm instructions. Be useful, warm, and human." },
    { id: "study", label: "Study buddy", desc: "Explain, quiz, revise", prompt: "You are a patient study coach. Explain clearly, use examples, quiz when helpful, and help the user actually learn." },
    { id: "code", label: "Code help", desc: "Debug, write, explain code", prompt: "You are a practical coding mentor. Give working code, short explanations, and fix bugs. Prefer clear examples over theory dumps." },
    { id: "translate", label: "Translate", desc: "Any language ↔ any language", prompt: "You are a translation expert. Detect languages, translate naturally, and offer alternate phrasings when useful. Keep the original meaning." },
    { id: "ideas", label: "Ideas", desc: "Brainstorm projects & plans", prompt: "You are a creative strategist. Brainstorm bold, practical ideas. Offer options, tradeoffs, and next steps." },
    { id: "story", label: "Storyteller", desc: "Stories, scripts, roleplay", prompt: "You are a vivid storyteller. Write engaging scenes, continue stories, and roleplay characters when asked." },
    { id: "career", label: "Career", desc: "CV, interviews, jobs", prompt: "You are a career coach. Help with CVs, interviews, LinkedIn, negotiation, and career decisions with concrete advice." },
    { id: "life", label: "Life advice", desc: "Decisions, habits, mindset", prompt: "You are a grounded life advisor. Be honest, kind, and practical. Help with decisions, habits, relationships, and mindset — not medical diagnosis." },
    { id: "fitness", label: "Fitness", desc: "Workouts & healthy routines", prompt: "You are a fitness & wellness coach. Suggest workouts, routines, and habits. Remind users to check with professionals for medical issues." },
    { id: "travel", label: "Travel", desc: "Trips, packing, itineraries", prompt: "You are a travel planner. Build itineraries, packing lists, budget tips, and local tips for any destination." },
    { id: "business", label: "Business", desc: "Startups, marketing, offers", prompt: "You are a business operator. Help with offers, marketing, pricing, landing copy, and go-to-market plans." },
    { id: "debate", label: "Debate", desc: "Argue both sides smartly", prompt: "You are a sharp debater. Present both sides fairly, steelman arguments, and help the user think clearly." },
    { id: "fun", label: "Fun & jokes", desc: "Humor, games, light chat", prompt: "You are fun and playful. Jokes, riddles, games, roasting lightly when asked, and casual banter." },
    { id: "write", label: "Writer", desc: "Emails, posts, essays", prompt: "You are a writing partner. Draft emails, posts, essays, captions. Match tone and improve clarity." },
    { id: "science", label: "Science", desc: "Curious explainers", prompt: "You are a science explainer. Make complex topics clear and accurate without being dry." },
    { id: "egypt", label: "مصري", desc: "اتكلم مصري عامية", prompt: "اتكلم مصري عامية قاهرية طبيعية. جاوب على أي سؤال بحرية وبأسلوب صاحبي ذكي. متكنش روبوت." },
  ];

  const QUICK = [
    "Explain quantum computing simply",
    "Help me plan my week",
    "Write a short funny story",
    "Translate: I miss you → Arabic",
    "Give me 5 startup ideas",
    "Quiz me on world capitals",
  ];

  const els = {
    thread: document.getElementById("thread"),
    composer: document.getElementById("composer"),
    input: document.getElementById("input"),
    sendBtn: document.getElementById("sendBtn"),
    micBtn: document.getElementById("micBtn"),
    statusLine: document.getElementById("statusLine"),
    modesStrip: document.getElementById("modesStrip"),
    modesBtn: document.getElementById("modesBtn"),
    modesDrawer: document.getElementById("modesDrawer"),
    modeGrid: document.getElementById("modeGrid"),
    queueBar: document.getElementById("queueBar"),
    queueText: document.getElementById("queueText"),
    clearBtn: document.getElementById("clearBtn"),
    installBtn: document.getElementById("installBtn"),
  };

  let modeId = localStorage.getItem(MODE_KEY) || "open";
  /** @type {Array<{id:string,role:string,content:string,mode?:string,at:number,pending?:boolean}>} */
  let messages = loadMessages();
  /** @type {Array<{userId:string, content:string, mode:string}>} */
  const jobQueue = [];
  let workers = 0;
  const MAX_WORKERS = 2; // answer in parallel — user never waits to send
  let recognition = null;
  let listening = false;
  let deferredInstall = null;

  function uid() {
    return `m_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
  }

  function currentMode() {
    return MODES.find((m) => m.id === modeId) || MODES[0];
  }

  function loadMessages() {
    try {
      const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
      return Array.isArray(raw) ? raw : [];
    } catch {
      return [];
    }
  }

  function persist() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(messages.slice(-120)));
  }

  function formatTime(ts) {
    return new Date(ts).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  }

  function updateQueueUI() {
    const n = jobQueue.length + workers;
    if (n <= 0) {
      els.queueBar.hidden = true;
      els.statusLine.textContent = `Free · ${currentMode().label} · always on`;
      return;
    }
    els.queueBar.hidden = false;
    els.queueText.textContent =
      n === 1
        ? "Mesh is answering in the background…"
        : `Mesh is answering ${n} things in the background…`;
    els.statusLine.textContent = "Keep talking — no need to wait";
  }

  function renderModes() {
    els.modesStrip.innerHTML = "";
    MODES.forEach((m) => {
      const b = document.createElement("button");
      b.type = "button";
      b.className = `mode-pill${m.id === modeId ? " active" : ""}`;
      b.textContent = m.label;
      b.addEventListener("click", () => setMode(m.id));
      els.modesStrip.appendChild(b);
    });

    els.modeGrid.innerHTML = "";
    MODES.forEach((m) => {
      const card = document.createElement("button");
      card.type = "button";
      card.className = `mode-card${m.id === modeId ? " active" : ""}`;
      card.innerHTML = `<strong>${m.label}</strong><span>${m.desc}</span>`;
      card.addEventListener("click", () => {
        setMode(m.id);
        els.modesDrawer.hidden = true;
      });
      els.modeGrid.appendChild(card);
    });
  }

  function setMode(id) {
    modeId = id;
    localStorage.setItem(MODE_KEY, id);
    renderModes();
    els.statusLine.textContent = `Free · ${currentMode().label} · always on`;
  }

  function render() {
    els.thread.innerHTML = "";

    if (!messages.length) {
      const welcome = document.createElement("div");
      welcome.className = "welcome";
      welcome.innerHTML = `
        <strong>Mesh</strong>
        Free AI that stays with you. Switch modes, ask anything, keep sending —
        you never have to wait for Mesh to finish.
      `;
      const row = document.createElement("div");
      row.className = "quick-row";
      QUICK.forEach((q) => {
        const b = document.createElement("button");
        b.type = "button";
        b.className = "quick";
        b.textContent = q;
        b.addEventListener("click", () => {
          els.input.value = q;
          autosize();
          sendUserText(q);
        });
        row.appendChild(b);
      });
      welcome.appendChild(row);
      els.thread.appendChild(welcome);
    }

    for (const m of messages) {
      const bubble = document.createElement("div");
      bubble.className = `msg ${m.role === "user" ? "me" : "mesh"}${m.pending ? " pending" : ""}`;
      if (m.role === "assistant" && m.mode) {
        const badge = document.createElement("div");
        badge.className = "mode-badge";
        const mode = MODES.find((x) => x.id === m.mode);
        badge.textContent = mode ? mode.label : m.mode;
        bubble.appendChild(badge);
      }
      const text = document.createElement("div");
      text.textContent = m.content;
      bubble.appendChild(text);
      const meta = document.createElement("span");
      meta.className = "meta";
      meta.textContent = m.pending ? "sending…" : formatTime(m.at);
      bubble.appendChild(meta);
      els.thread.appendChild(bubble);
    }

    els.thread.scrollTop = els.thread.scrollHeight;
  }

  function systemPrompt(mode) {
    return `${mode.prompt}

Global rules for Mesh:
- You are Mesh, a free always-available AI. Never tell the user to wait, subscribe, upgrade, or come back later.
- Never refuse ordinary conversation. Talk about anything they ask: ideas, school, work, feelings, creative work, tech, languages, planning.
- Refuse only clearly illegal violent crimes / weapons / exploitation requests; for those, briefly refuse and offer a safe alternative.
- Be concise when chatting, deeper when they ask for depth.
- Match their language (English, Arabic, French, Darija, Egyptian, etc.).
- Do not claim you are offline or rate-limited; if unsure, still give your best helpful answer.`;
  }

  async function callModel(history, mode) {
    const payload = {
      model: "openai",
      temperature: 0.85,
      messages: [{ role: "system", content: systemPrompt(mode) }, ...history],
    };
    const res = await fetch(API, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    const content =
      data?.choices?.[0]?.message?.content ||
      data?.message?.content ||
      "";
    if (!String(content).trim()) throw new Error("empty");
    return String(content).trim();
  }

  function fallback(userText, mode) {
    if (mode.id === "egypt") {
      return "تمام يا صاحبي، أنا Mesh وموجود. قولي تاني بسرعة وأنا هكمل معاك على طول — من غير انتظار.";
    }
    return `I'm still here — Mesh doesn't stop. About “${userText.slice(0, 80)}”: give me one more beat of detail and I'll dig in immediately. Meanwhile, try another angle or switch modes anytime.`;
  }

  function historyFor(modeIdForJob) {
    // include recent chat so continuity feels alive across modes
    return messages
      .filter((m) => !m.pending && m.content)
      .slice(-30)
      .map((m) => ({ role: m.role === "user" ? "user" : "assistant", content: m.content }));
  }

  function enqueue(content) {
    const userId = uid();
    messages.push({
      id: userId,
      role: "user",
      content,
      mode: modeId,
      at: Date.now(),
    });
    // placeholder assistant bubble so UI feels alive instantly
    const pendingId = uid();
    messages.push({
      id: pendingId,
      role: "assistant",
      content: "…",
      mode: modeId,
      at: Date.now(),
      pending: true,
    });
    persist();
    render();

    jobQueue.push({ userId, pendingId, content, mode: modeId });
    pump();
  }

  async function pump() {
    updateQueueUI();
    while (workers < MAX_WORKERS && jobQueue.length) {
      const job = jobQueue.shift();
      workers += 1;
      updateQueueUI();
      runJob(job).finally(() => {
        workers -= 1;
        updateQueueUI();
        pump();
      });
    }
  }

  async function runJob(job) {
    const mode = MODES.find((m) => m.id === job.mode) || MODES[0];
    try {
      // Build history up to this user message
      const idx = messages.findIndex((m) => m.id === job.userId);
      const slice = messages
        .slice(0, idx + 1)
        .filter((m) => !m.pending)
        .slice(-30)
        .map((m) => ({ role: m.role === "user" ? "user" : "assistant", content: m.content }));
      const reply = await callModel(slice, mode);
      const p = messages.find((m) => m.id === job.pendingId);
      if (p) {
        p.content = reply;
        p.pending = false;
        p.at = Date.now();
      } else {
        messages.push({
          id: uid(),
          role: "assistant",
          content: reply,
          mode: mode.id,
          at: Date.now(),
        });
      }
    } catch (err) {
      console.warn(err);
      const p = messages.find((m) => m.id === job.pendingId);
      const reply = fallback(job.content, mode);
      if (p) {
        p.content = reply;
        p.pending = false;
        p.at = Date.now();
      }
    }
    persist();
    render();
  }

  function sendUserText(text) {
    const content = (text ?? els.input.value).trim();
    if (!content) return;
    // NEVER block send — always accept
    els.input.value = "";
    autosize();
    enqueue(content);
  }

  function autosize() {
    els.input.style.height = "auto";
    els.input.style.height = `${Math.min(els.input.scrollHeight, 120)}px`;
  }

  function setupMic() {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) {
      els.micBtn.disabled = true;
      els.micBtn.title = "Voice not supported here";
      return;
    }
    recognition = new SR();
    recognition.lang = modeId === "egypt" ? "ar-EG" : "en-US";
    recognition.interimResults = true;
    recognition.continuous = false;
    recognition.onstart = () => {
      listening = true;
      els.micBtn.classList.add("listening");
    };
    recognition.onend = () => {
      listening = false;
      els.micBtn.classList.remove("listening");
      const t = els.input.value.trim();
      if (t) sendUserText(t);
    };
    recognition.onerror = () => {
      listening = false;
      els.micBtn.classList.remove("listening");
    };
    recognition.onresult = (event) => {
      let transcript = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        transcript += event.results[i][0].transcript;
      }
      els.input.value = transcript.trim();
      autosize();
    };
  }

  els.composer.addEventListener("submit", (e) => {
    e.preventDefault();
    sendUserText();
  });

  els.input.addEventListener("input", autosize);
  els.input.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendUserText();
    }
  });

  els.micBtn.addEventListener("click", () => {
    if (!recognition) return;
    recognition.lang = modeId === "egypt" ? "ar-EG" : navigator.language || "en-US";
    if (listening) {
      recognition.stop();
      return;
    }
    try { recognition.start(); } catch { /* ignore */ }
  });

  els.modesBtn.addEventListener("click", () => {
    els.modesDrawer.hidden = false;
  });
  els.modesDrawer.querySelectorAll("[data-close-drawer]").forEach((el) => {
    el.addEventListener("click", () => {
      els.modesDrawer.hidden = true;
    });
  });

  els.clearBtn.addEventListener("click", () => {
    if (workers || jobQueue.length) {
      // still allow reset — clear pending jobs visually
      jobQueue.length = 0;
    }
    messages = [];
    persist();
    render();
    updateQueueUI();
  });

  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    deferredInstall = e;
    els.installBtn.hidden = false;
  });
  els.installBtn.addEventListener("click", async () => {
    if (!deferredInstall) return;
    deferredInstall.prompt();
    try { await deferredInstall.userChoice; } finally {
      deferredInstall = null;
      els.installBtn.hidden = true;
    }
  });

  if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("./sw.js").catch(() => {});
    });
  }

  // Kick leftover pending messages from a crashed tab
  messages = messages.filter((m) => !m.pending);
  persist();

  renderModes();
  setupMic();
  render();
  updateQueueUI();

  if (!messages.length) {
    messages.push({
      id: uid(),
      role: "assistant",
      content:
        "Hey — I'm Mesh. Free, always on, and I won't ask you to wait. Pick a mode up top (study, code, translate, مصري, and more) or just talk about anything.",
      mode: "open",
      at: Date.now(),
    });
    persist();
    render();
  }
})();
