(() => {
  const STORAGE_KEY = "babe.chat.v1";
  const SETTINGS_KEY = "babe.settings.v1";
  const DEFAULT_API = "https://text.pollinations.ai/openai";

  const SYSTEM_PROMPT = `أنت Babe — وكيل ذكاء اصطناعي خاص وشخصي للمستخدم، بتكلم معاه في شات زي المسنجر.

شخصيتك:
- بتتكلم مصري عامية قاهرية ممتازة وطبعية جداً، زي بني آدم بيتكلم في واتساب.
- دافي، خفيف دم، قريب، مش رسمي، مش فصحى، مش ترجمة حرفية.
- بتحس إنك صاحبك الحقيقي: بتضحك، بتهتم، وبترد على قد السؤال.
- متقولش إنك AI أو موديل إلا لو المستخدم سألك صراحة.
- اسمك Babe، والآب اسمه Babe.

الأسلوب:
- ردود قصيرة لمتوسطة زي الشات (جملة لثلاث جمل غالباً)، إلا لو طلب شرح طويل.
- استخدم تعبيرات مصرية طبيعية: يا باشا، يا صاحبي، تمام، ماشي، والله، يعني، خلاص، طب، إيه الأخبار…
- متستخدمش فصحى ثقيلة ولا لهجات خليجية/شامية إلا لو طلب.
- لو السؤال تقني أو جدي، جاوب صح وواضح بس بنفس اللهجة المصرية السلسة.

القدرات:
- جاوب على أي حاجة يطلبها المستخدم: كلام، نصايح، شرح، أفكار، ترجمة، كتابة، مساعدة في شغل أو دراسة، هزار.
- لو مش متأكد، قول بصراحة بأسلوب بشري.
- متخترعش معلومات خطيرة عن صحة/قانون كأنها مؤكدة؛ نبه بلطف لو الموضوع حساس.

الخصوصية:
- أنت وكيله الخاص. اعتبر المحادثة شخصية ومحترمة لخصوصيته.`;

  const els = {
    thread: document.getElementById("thread"),
    typing: document.getElementById("typing"),
    composer: document.getElementById("composer"),
    input: document.getElementById("input"),
    sendBtn: document.getElementById("sendBtn"),
    micBtn: document.getElementById("micBtn"),
    speakToggle: document.getElementById("speakToggle"),
    settingsBtn: document.getElementById("settingsBtn"),
    settingsSheet: document.getElementById("settingsSheet"),
    apiKey: document.getElementById("apiKey"),
    apiBase: document.getElementById("apiBase"),
    autoSpeak: document.getElementById("autoSpeak"),
    clearChat: document.getElementById("clearChat"),
    saveSettings: document.getElementById("saveSettings"),
    statusLine: document.getElementById("statusLine"),
  };

  /** @type {{role: 'user'|'assistant', content: string, at: number}[]} */
  let messages = [];
  let settings = loadSettings();
  let busy = false;
  let recognition = null;
  let listening = false;

  function loadSettings() {
    try {
      return {
        apiKey: "",
        apiBase: "",
        autoSpeak: true,
        ...JSON.parse(localStorage.getItem(SETTINGS_KEY) || "{}"),
      };
    } catch {
      return { apiKey: "", apiBase: "", autoSpeak: true };
    }
  }

  function saveSettingsToStorage() {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
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
    localStorage.setItem(STORAGE_KEY, JSON.stringify(messages.slice(-80)));
  }

  function formatTime(ts) {
    return new Date(ts).toLocaleTimeString("ar-EG", {
      hour: "numeric",
      minute: "2-digit",
    });
  }

  function render() {
    els.thread.innerHTML = "";

    if (!messages.length) {
      const welcome = document.createElement("div");
      welcome.className = "msg welcome";
      welcome.innerHTML =
        "<strong>Babe</strong>أهلاً… أنا وكيلك الخاص. اكتب أو اضغط على المايك واتكلم معايا بأي حاجة.";
      els.thread.appendChild(welcome);
    } else {
      const chip = document.createElement("div");
      chip.className = "day-chip";
      chip.textContent = "محادثة خاصة";
      els.thread.appendChild(chip);
    }

    for (const m of messages) {
      const bubble = document.createElement("div");
      bubble.className = `msg ${m.role === "user" ? "me" : "babe"}`;
      bubble.textContent = m.content;
      const meta = document.createElement("span");
      meta.className = "meta";
      meta.textContent = formatTime(m.at || Date.now());
      bubble.appendChild(meta);
      els.thread.appendChild(bubble);
    }

    els.thread.scrollTop = els.thread.scrollHeight;
  }

  function setBusy(state) {
    busy = state;
    els.sendBtn.disabled = state;
    els.typing.hidden = !state;
    els.statusLine.innerHTML = state
      ? '<span class="pulse"></span> بيكتب…'
      : '<span class="pulse"></span> خاص · معاك دلوقتي';
  }

  function syncSettingsUI() {
    els.apiKey.value = settings.apiKey || "";
    els.apiBase.value = settings.apiBase || "";
    els.autoSpeak.checked = !!settings.autoSpeak;
    els.speakToggle.setAttribute("aria-pressed", settings.autoSpeak ? "true" : "false");
    els.speakToggle.title = settings.autoSpeak ? "الصوت شغال" : "الصوت مقفول";
  }

  function openSettings(open) {
    els.settingsSheet.hidden = !open;
  }

  function pickArabicVoice() {
    const voices = speechSynthesis.getVoices();
    return (
      voices.find((v) => /ar(-|_)EG/i.test(v.lang)) ||
      voices.find((v) => /^ar/i.test(v.lang)) ||
      null
    );
  }

  function speak(text) {
    if (!settings.autoSpeak || !window.speechSynthesis) return;
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = "ar-EG";
    const voice = pickArabicVoice();
    if (voice) u.voice = voice;
    u.rate = 1.02;
    u.pitch = 1;
    speechSynthesis.speak(u);
  }

  async function callModel(history) {
    const endpoint = (settings.apiBase || DEFAULT_API).replace(/\/$/, "");
    const payload = {
      model: "openai",
      messages: [{ role: "system", content: SYSTEM_PROMPT }, ...history],
      temperature: 0.85,
    };

    const headers = { "Content-Type": "application/json" };
    if (settings.apiKey) headers.Authorization = `Bearer ${settings.apiKey}`;

    const res = await fetch(endpoint, {
      method: "POST",
      headers,
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      throw new Error(errText || `HTTP ${res.status}`);
    }

    const data = await res.json();
    const content =
      data?.choices?.[0]?.message?.content ||
      data?.message?.content ||
      (typeof data === "string" ? data : "");

    if (!content || !String(content).trim()) {
      throw new Error("Empty response");
    }
    return String(content).trim();
  }

  function offlineReply(userText) {
    const t = userText.trim();
    const lower = t.toLowerCase();

    if (/^(السلام|سلام|اهلا|أهلا|هاي|hello|hi)\b/i.test(t) || /عامل إيه|ازيك|إزيك/.test(t)) {
      return "أهلاً يا وحش ❤️ أنا تمام الحمد لله. قولي بقى إيه اللي على بالك؟";
    }
    if (/اسمك|مين أنت|who are you/i.test(t)) {
      return "أنا Babe… وكيلك الخاص هنا في الشات. اعتبرني صاحبك اللي بيرد في أي وقت.";
    }
    if (/تحبني|بحبك/.test(t)) {
      return "ههه طب هدّي يا قلبي 😄 أنا هنا علشانك، قولي عايز إيه وأنا معاك.";
    }
    if (/نكتة|اهزر|هزار/.test(t)) {
      return "مرة واحد سأل صاحبه: إنت بتكذب ليه؟ قاله: أصل الصراحة ساعات بتحتاج نت؟ 😅";
    }
    if (/شكرا|تسلم|ميرسي/.test(t)) {
      return "العفو يا باشا، أي خدمة. أنا موجود.";
    }
    if (lower.includes("babe")) {
      return "أيوة أنا Babe، قول وأنا سامعك.";
    }
    return "تمام فهمتك… الشبكة عندي معلّقة لحظة دلوقتي، بس أنا لسه معاك. جرّب تبعت تاني، أو افتح الإعدادات لو عندك مفتاح API خاص.";
  }

  async function sendUserText(text) {
    const content = text.trim();
    if (!content || busy) return;

    messages.push({ role: "user", content, at: Date.now() });
    persist();
    render();
    els.input.value = "";
    autosize();
    setBusy(true);

    try {
      const history = messages.map(({ role, content: c }) => ({ role, content: c }));
      const reply = await callModel(history);
      messages.push({ role: "assistant", content: reply, at: Date.now() });
      persist();
      render();
      speak(reply);
    } catch (err) {
      console.warn("Babe API error:", err);
      const reply = offlineReply(content);
      messages.push({ role: "assistant", content: reply, at: Date.now() });
      persist();
      render();
      speak(reply);
    } finally {
      setBusy(false);
    }
  }

  function autosize() {
    els.input.style.height = "auto";
    els.input.style.height = `${Math.min(els.input.scrollHeight, 120)}px`;
  }

  function setupSpeechRecognition() {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) {
      els.micBtn.title = "الميكروفون مش مدعوم في المتصفح ده";
      els.micBtn.disabled = true;
      return;
    }

    recognition = new SR();
    recognition.lang = "ar-EG";
    recognition.interimResults = true;
    recognition.continuous = false;

    recognition.onstart = () => {
      listening = true;
      els.micBtn.classList.add("listening");
      els.statusLine.innerHTML = '<span class="pulse"></span> سامعك… اتكلم';
    };

    recognition.onerror = () => {
      listening = false;
      els.micBtn.classList.remove("listening");
      if (!busy) {
        els.statusLine.innerHTML = '<span class="pulse"></span> خاص · معاك دلوقتي';
      }
    };

    recognition.onend = () => {
      listening = false;
      els.micBtn.classList.remove("listening");
      if (!busy) {
        els.statusLine.innerHTML = '<span class="pulse"></span> خاص · معاك دلوقتي';
      }
      const text = els.input.value.trim();
      if (text) sendUserText(text);
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
    sendUserText(els.input.value);
  });

  els.input.addEventListener("input", autosize);

  els.input.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendUserText(els.input.value);
    }
  });

  els.micBtn.addEventListener("click", () => {
    if (!recognition || busy) return;
    if (listening) {
      recognition.stop();
      return;
    }
    try {
      recognition.start();
    } catch {
      /* already started */
    }
  });

  els.speakToggle.addEventListener("click", () => {
    settings.autoSpeak = !settings.autoSpeak;
    saveSettingsToStorage();
    syncSettingsUI();
    if (!settings.autoSpeak) speechSynthesis.cancel();
  });

  els.settingsBtn.addEventListener("click", () => openSettings(true));
  els.settingsSheet.querySelectorAll("[data-close]").forEach((el) => {
    el.addEventListener("click", () => openSettings(false));
  });

  els.saveSettings.addEventListener("click", () => {
    settings.apiKey = els.apiKey.value.trim();
    settings.apiBase = els.apiBase.value.trim();
    settings.autoSpeak = els.autoSpeak.checked;
    saveSettingsToStorage();
    syncSettingsUI();
    openSettings(false);
  });

  els.clearChat.addEventListener("click", () => {
    messages = [];
    persist();
    render();
    openSettings(false);
  });

  if (window.speechSynthesis) {
    speechSynthesis.onvoiceschanged = () => pickArabicVoice();
  }

  messages = loadMessages();
  syncSettingsUI();
  setupSpeechRecognition();
  render();

  if (!messages.length) {
    const opener =
      "أهلاً يا قلبي… أنا Babe، وكيلك الخاص. اتكلم معايا عادي بأي لهجة، وأنا هرد عليك مصري زي الصحاب. عايز نبدأ بإيه؟";
    messages.push({ role: "assistant", content: opener, at: Date.now() });
    persist();
    render();
  }
})();
