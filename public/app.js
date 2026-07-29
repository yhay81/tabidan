(() => {
  "use strict";

  const storage = window.localStorage;
  const sessionKey = "tabidan:session";
  const visitKey = "tabidan:last-visit";
  const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  const automated =
    navigator.webdriver === true || new URLSearchParams(location.search).get("qa") === "1";

  function sessionId() {
    const current = storage.getItem(sessionKey);
    if (current && uuidPattern.test(current)) return current;
    const created = crypto.randomUUID();
    storage.setItem(sessionKey, created);
    return created;
  }

  async function jsonRequest(path, options = {}) {
    const response = await fetch(path, {
      ...options,
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        ...options.headers,
      },
    });
    const body = response.headers.get("content-type")?.includes("application/json")
      ? await response.json()
      : null;
    if (!response.ok) {
      const error = new Error(body?.error || "request_failed");
      error.status = response.status;
      throw error;
    }
    return body;
  }

  function telemetry(name) {
    void jsonRequest("/api/telemetry", {
      body: JSON.stringify({ automated, name, sessionId: sessionId() }),
      method: "POST",
    }).catch(() => {});
  }

  const today = new Date().toISOString().slice(0, 10);
  const previousVisit = storage.getItem(visitKey);
  telemetry("visited");
  if (previousVisit && previousVisit !== today) telemetry("returned");
  storage.setItem(visitKey, today);

  function setError(element, message) {
    if (!element) return;
    element.textContent = message;
    element.hidden = !message;
  }

  function formText(values, name) {
    const value = values.get(name);
    return typeof value === "string" ? value : "";
  }

  function errorMessage(code) {
    return (
      {
        invalid_edit_token: "編集用URLを確認できませんでした。",
        invalid_trip: "日付、予定、URLなどの入力内容を確認してください。",
        rate_limited: "操作が続きました。1分ほど待ってからお試しください。",
        stale_revision: "別の端末で先に更新されました。ページを再読み込みしてください。",
        trip_not_found: "このしおりは削除されたか、期限切れです。",
      }[code] || "保存できませんでした。少し待ってからお試しください。"
    );
  }

  function copyText(value, button) {
    void navigator.clipboard.writeText(value).then(() => {
      const previous = button.textContent;
      button.textContent = "コピー済み";
      window.setTimeout(() => {
        button.textContent = previous;
      }, 1400);
    });
  }

  document.querySelectorAll("[data-copy-target]").forEach((element) => {
    element.addEventListener("click", () => {
      const input = document.getElementById(element.dataset.copyTarget);
      if (input instanceof HTMLInputElement && element instanceof HTMLButtonElement) {
        copyText(input.value, element);
      }
    });
  });

  function makeId() {
    return crypto.randomUUID().replaceAll("-", "").slice(0, 12);
  }

  function dateList(start, end) {
    const dates = [];
    const cursor = new Date(`${start}T00:00:00Z`);
    const finish = new Date(`${end}T00:00:00Z`);
    while (cursor <= finish && dates.length < 14) {
      dates.push(cursor.toISOString().slice(0, 10));
      cursor.setUTCDate(cursor.getUTCDate() + 1);
    }
    return dates;
  }

  function formatDate(value, withYear = false) {
    const date = new Date(`${value}T00:00:00Z`);
    if (Number.isNaN(date.valueOf())) return value;
    return new Intl.DateTimeFormat("ja-JP", {
      day: "numeric",
      month: "short",
      timeZone: "UTC",
      weekday: "short",
      ...(withYear ? { year: "numeric" } : {}),
    }).format(date);
  }

  function monthName(value) {
    const date = new Date(`${value}T00:00:00Z`);
    return new Intl.DateTimeFormat("en-US", { month: "short", timeZone: "UTC" })
      .format(date)
      .toUpperCase();
  }

  function dayNumber(value) {
    return String(new Date(`${value}T00:00:00Z`).getUTCDate()).padStart(2, "0");
  }

  function guessKind(text) {
    if (/駅|空港|出発|到着|移動|新幹線|電車|バス|飛行機|レンタカー/.test(text)) return "move";
    if (/ホテル|旅館|宿|チェックイン|泊/.test(text)) return "stay";
    if (/朝食|昼食|夕食|ごはん|ランチ|ディナー|カフェ|市場|食/.test(text)) return "food";
    return "see";
  }

  function parsePastedPlan(text, startDate, endDate) {
    const dates = dateList(startDate, endDate);
    const plan = {
      checklist: [],
      days: dates.map((date) => ({ date, items: [], label: "" })),
      expenses: [],
      travelers: [],
    };
    let dayIndex = 0;
    for (const rawLine of text.split(/\r?\n/)) {
      let line = rawLine.trim().replace(/^[-・●]\s*/, "");
      if (!line) continue;
      const dayMatch = line.match(/^(\d{1,2})日目[\s:：-]*(.*)$/);
      if (dayMatch) {
        dayIndex = Math.min(Math.max(Number(dayMatch[1]) - 1, 0), dates.length - 1);
        line = dayMatch[2].trim();
        if (!line) continue;
      }
      const dateMatch = line.match(/^(?:(\d{4})[-/])?(\d{1,2})[-/月](\d{1,2})日?[\s:：-]*(.*)$/);
      if (dateMatch) {
        const candidate = `${dateMatch[1] || startDate.slice(0, 4)}-${String(dateMatch[2]).padStart(2, "0")}-${String(dateMatch[3]).padStart(2, "0")}`;
        const found = dates.indexOf(candidate);
        if (found >= 0) dayIndex = found;
        line = dateMatch[4].trim();
        if (!line) continue;
      }
      const timeMatch = line.match(/^([01]?\d|2[0-3]):([0-5]\d)\s*(.*)$/);
      const time = timeMatch ? `${String(timeMatch[1]).padStart(2, "0")}:${timeMatch[2]}` : "";
      const title = (timeMatch ? timeMatch[3] : line).trim().slice(0, 80);
      if (!title) continue;
      plan.days[dayIndex].items.push({
        cost: 0,
        id: makeId(),
        kind: guessKind(title),
        note: "",
        place: "",
        time,
        title,
        url: "",
      });
    }
    for (const day of plan.days) day.items.sort((a, b) => a.time.localeCompare(b.time));
    return plan;
  }

  const createForm = document.getElementById("create-trip-form");
  if (createForm instanceof HTMLFormElement) {
    const fields = {
      destination: document.getElementById("trip-destination"),
      end: document.getElementById("end-date"),
      start: document.getElementById("start-date"),
      title: document.getElementById("trip-title"),
    };
    const preview = document.querySelector(".trip-preview");
    let accent = "sunrise";

    function updatePreview() {
      const start = fields.start.value;
      const end = fields.end.value;
      if (end < start) fields.end.value = start;
      const days = dateList(start, fields.end.value).length;
      document.getElementById("preview-title").textContent =
        fields.title.value.trim() || "旅の名前";
      document.getElementById("preview-destination").textContent =
        fields.destination.value.trim() || "行き先";
      document.getElementById("preview-month").textContent = monthName(start);
      document.getElementById("preview-day").textContent = dayNumber(start);
      document.getElementById("preview-days").textContent =
        `${days} ${days === 1 ? "DAY" : "DAYS"}`;
      fields.end.min = start;
    }

    createForm.querySelectorAll("input").forEach((input) => {
      input.addEventListener("input", updatePreview);
    });
    document.querySelectorAll(".accent-choice, .accent-choices button").forEach((button) => {
      button.addEventListener("click", () => {
        accent = button.dataset.accent;
        preview.dataset.accent = accent;
        document.querySelectorAll(".accent-choices button").forEach((choice) => {
          const selected = choice === button;
          choice.dataset.selected = String(selected);
          choice.setAttribute("aria-pressed", String(selected));
        });
      });
    });
    fields.start.min = new Date(Date.now() - 90 * 86_400_000).toISOString().slice(0, 10);
    fields.end.max = new Date(Date.now() + 370 * 86_400_000).toISOString().slice(0, 10);
    updatePreview();

    createForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      const error = document.getElementById("create-error");
      const submit = createForm.querySelector('button[type="submit"]');
      setError(error, "");
      submit.disabled = true;
      const values = new FormData(createForm);
      const startDate = formText(values, "startDate");
      const endDate = formText(values, "endDate");
      const plan = parsePastedPlan(formText(values, "pastePlan"), startDate, endDate);
      try {
        const result = await jsonRequest("/api/trips", {
          body: JSON.stringify({
            accent,
            destination: values.get("destination"),
            endDate,
            plan,
            sessionId: sessionId(),
            startDate,
            title: values.get("title"),
            website: values.get("website"),
          }),
          method: "POST",
        });
        const viewUrl = `${location.origin}${result.sharePath}`;
        const editUrl = `${location.origin}${result.editPath}`;
        document.getElementById("share-url").value = viewUrl;
        document.getElementById("edit-url").value = editUrl;
        document.getElementById("open-trip").href = editUrl;
        document.querySelector(".home-workspace").hidden = true;
        const success = document.getElementById("create-success");
        success.hidden = false;
        success.scrollIntoView({ behavior: "smooth", block: "center" });
        telemetry("created");
      } catch (requestError) {
        submit.disabled = false;
        setError(error, errorMessage(requestError.message));
      }
    });
  }

  const tripPage = document.querySelector(".trip-page");
  if (!(tripPage instanceof HTMLElement)) return;

  let plan;
  let trip;
  try {
    plan = JSON.parse(decodeURIComponent(tripPage.dataset.plan));
    trip = JSON.parse(decodeURIComponent(tripPage.dataset.trip));
  } catch {
    return;
  }
  const tripId = tripPage.dataset.tripId;
  const editToken = location.hash.slice(1);
  const editHeaders = { Authorization: `Bearer ${editToken}` };
  const editError = document.getElementById("edit-error");
  let canEdit = false;
  let activeDay = plan.days[0]?.date || "";
  let editingItemId = "";
  let saveQueue = Promise.resolve();

  function element(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = String(text);
    return node;
  }

  function money(value) {
    return new Intl.NumberFormat("ja-JP", {
      currency: "JPY",
      maximumFractionDigits: 0,
      style: "currency",
    }).format(value);
  }

  function mapUrl(place) {
    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(place)}`;
  }

  function renderTimeline() {
    const tabs = document.getElementById("day-tabs");
    const root = document.getElementById("timeline-root");
    tabs.replaceChildren();
    root.replaceChildren();
    if (!plan.days.some((day) => day.date === activeDay)) activeDay = plan.days[0]?.date || "";
    plan.days.forEach((day, index) => {
      const tab = element("button");
      tab.type = "button";
      tab.dataset.dayTab = day.date;
      tab.setAttribute("aria-selected", String(day.date === activeDay));
      tab.append(element("span", "", `DAY ${index + 1}`));
      tab.append(element("strong", "", dayNumber(day.date)));
      tab.append(element("small", "", monthName(day.date)));
      tabs.append(tab);

      const section = element("section", "day-timeline");
      section.dataset.dayPanel = day.date;
      section.hidden = day.date !== activeDay;
      const heading = element("header", "day-heading");
      const headingLeft = element("span", "", `DAY ${index + 1}`);
      const title = element("h2", "", day.label || formatDate(day.date));
      const date = element("time", "", formatDate(day.date, true));
      heading.append(headingLeft, title, date);
      section.append(heading);
      const list = element("div", "timeline-list");
      if (!day.items.length) {
        const empty = element("div", "empty-state");
        empty.append(
          element("span", "", "＋"),
          element("strong", "", "この日の予定はまだありません"),
          element("p", "", "編集URLから、移動や立ち寄り先を追加できます。"),
        );
        list.append(empty);
      }
      for (const item of day.items) {
        const article = element("article", "timeline-item");
        article.dataset.itemId = item.id;
        article.dataset.kind = item.kind;
        article.append(element("time", "", item.time || "—"));
        const icons = { food: "♨", free: "•", move: "→", see: "◇", stay: "⌂" };
        const labels = {
          food: "食べる",
          free: "自由",
          move: "移動",
          see: "立ち寄る",
          stay: "泊まる",
        };
        article.append(element("span", "item-pin", icons[item.kind]));
        const card = element("div", "item-card");
        const header = element("header");
        const labelsBlock = element("div");
        labelsBlock.append(
          element("span", "kind-label", labels[item.kind]),
          element("h3", "", item.title),
        );
        header.append(labelsBlock);
        if (canEdit) {
          const actions = element("div", "item-actions");
          const edit = element("button", "", "編集");
          edit.type = "button";
          edit.dataset.editItem = item.id;
          const remove = element("button", "", "削除");
          remove.type = "button";
          remove.dataset.deleteItem = item.id;
          actions.append(edit, remove);
          header.append(actions);
        }
        card.append(header);
        if (item.place) {
          const place = element("p", "item-place", `${item.place} `);
          const link = element("a", "map-link", "地図");
          link.href = mapUrl(item.place);
          link.target = "_blank";
          link.rel = "noreferrer";
          place.append(link);
          card.append(place);
        }
        if (item.note) card.append(element("p", "item-note", item.note));
        if (item.cost || item.url) {
          const footer = element("footer");
          footer.append(element("span", "", item.cost ? money(item.cost) : ""));
          if (item.url) {
            const link = element("a", "", "予約・案内 ↗");
            link.href = item.url;
            link.target = "_blank";
            link.rel = "noreferrer";
            footer.append(link);
          }
          card.append(footer);
        }
        article.append(card);
        list.append(article);
      }
      section.append(list);
      root.append(section);
    });
    const itemTotal = plan.days.reduce((total, day) => total + day.items.length, 0);
    document.querySelector('[data-view-tab="itinerary"] small').textContent = String(itemTotal);
  }

  function renderChecklist() {
    const root = document.getElementById("checklist-root");
    const view = root.closest(".checklist-view");
    root.replaceChildren();
    const checked = plan.checklist.filter((item) => item.checked).length;
    view.querySelector(".section-heading > strong").textContent =
      `${checked} / ${plan.checklist.length}`;
    view.querySelector(".progress-track i").style.width = `${
      plan.checklist.length ? (checked / plan.checklist.length) * 100 : 0
    }%`;
    document.querySelector('[data-view-tab="checklist"] small').textContent =
      `${checked}/${plan.checklist.length}`;
    if (!plan.checklist.length) {
      const empty = element("div", "empty-state");
      empty.append(
        element("span", "", "✓"),
        element("strong", "", "持ち物はまだありません"),
        element("p", "", "みんなで確認したい物を追加できます。"),
      );
      root.append(empty);
      return;
    }
    for (const item of plan.checklist) {
      const label = element("label", "check-row");
      label.dataset.checkId = item.id;
      const input = element("input");
      input.type = "checkbox";
      input.checked = item.checked;
      input.dataset.toggleCheck = item.id;
      const box = element("span", "check-box");
      const copy = element("span");
      copy.append(element("strong", "", item.text));
      if (item.owner) copy.append(element("small", "", item.owner));
      label.append(input, box, copy);
      if (canEdit) {
        const remove = element("button", "", "削除");
        remove.type = "button";
        remove.dataset.deleteCheck = item.id;
        label.append(remove);
      }
      root.append(label);
    }
  }

  function renderExpenses() {
    const root = document.getElementById("expense-root");
    const view = root.closest(".expense-view");
    root.replaceChildren();
    const total = plan.expenses.reduce((sum, item) => sum + item.amount, 0);
    const perPerson = plan.travelers.length ? Math.round(total / plan.travelers.length) : 0;
    view.querySelector(".section-heading > strong").textContent = money(total);
    const summary = view.querySelectorAll(".cost-summary strong");
    summary[0].textContent = money(total);
    summary[1].textContent = plan.travelers.length ? money(perPerson) : "—";
    summary[2].textContent = String(plan.travelers.length || "—");
    document.querySelector('[data-view-tab="expenses"] small').textContent = total
      ? money(total)
      : "—";
    if (!plan.expenses.length) {
      const empty = element("div", "empty-state");
      empty.append(
        element("span", "", "¥"),
        element("strong", "", "費用メモはまだありません"),
        element("p", "", "交通費や宿代を入れると、一人分の目安が見えます。"),
      );
      root.append(empty);
    } else {
      for (const expense of plan.expenses) {
        const row = element("article");
        row.dataset.expenseId = expense.id;
        row.append(element("span", "expense-dot"));
        const copy = element("div");
        copy.append(
          element("strong", "", expense.label),
          element("small", "", expense.paidBy ? `${expense.paidBy} が支払い` : "支払者未定"),
        );
        row.append(copy, element("b", "", money(expense.amount)));
        if (canEdit) {
          const remove = element("button", "", "削除");
          remove.type = "button";
          remove.dataset.deleteExpense = expense.id;
          row.append(remove);
        }
        root.append(row);
      }
    }
    view.querySelector(".settlement-list")?.remove();
    if (plan.travelers.length && total) {
      const paid = new Map(plan.travelers.map((name) => [name, 0]));
      plan.expenses.forEach((expense) => {
        if (expense.paidBy)
          paid.set(expense.paidBy, (paid.get(expense.paidBy) || 0) + expense.amount);
      });
      const settlement = element("div", "settlement-list");
      settlement.append(element("h3", "", "同じ金額で分けた場合"));
      for (const traveler of plan.travelers) {
        const balance = (paid.get(traveler) || 0) - perPerson;
        const row = element("div");
        row.append(element("span", "", traveler));
        const result = element(
          "strong",
          "",
          `${balance >= 0 ? "+" : "−"}${money(Math.abs(balance))}`,
        );
        result.dataset.balance = balance >= 0 ? "plus" : "minus";
        row.append(result);
        settlement.append(row);
      }
      view.append(settlement);
    }
  }

  function renderTravelers() {
    const root = document.getElementById("traveler-list");
    root.replaceChildren();
    if (!plan.travelers.length) root.append(element("p", "", "まだ登録されていません"));
    plan.travelers.forEach((traveler, index) => {
      const chip = element("span");
      chip.append(element("i", "", traveler.slice(0, 1)), document.createTextNode(traveler));
      if (canEdit) {
        const remove = element("button", "", "×");
        remove.type = "button";
        remove.dataset.deleteTraveler = String(index);
        remove.title = `${traveler}を削除`;
        chip.append(remove);
      }
      root.append(chip);
    });
    const select = document.querySelector('#expense-form select[name="paidBy"]');
    const current = select.value;
    select.replaceChildren(new Option("未定", ""));
    plan.travelers.forEach((traveler) => select.append(new Option(traveler, traveler)));
    if (plan.travelers.includes(current)) select.value = current;
  }

  function renderTripIdentity() {
    document.getElementById("trip-title-label").textContent = trip.title;
    document.getElementById("trip-destination-label").textContent = trip.destination;
    document.getElementById("trip-month").textContent = monthName(trip.start_date);
    document.getElementById("trip-day").textContent = dayNumber(trip.start_date);
    document.getElementById("trip-date-label").textContent =
      trip.start_date === trip.end_date
        ? formatDate(trip.start_date, true)
        : `${formatDate(trip.start_date, true)} — ${formatDate(trip.end_date)}`;
    tripPage.dataset.accent = trip.accent;
  }

  function renderAll() {
    renderTimeline();
    renderChecklist();
    renderExpenses();
    renderTravelers();
    renderTripIdentity();
  }

  function markSaving(state, message) {
    const label = document.getElementById("save-state");
    const sync = document.getElementById("sync-state");
    const dot = document.getElementById("sync-dot");
    if (label) label.textContent = message;
    sync.textContent = message;
    dot.dataset.state = state;
  }

  function persist() {
    saveQueue = saveQueue
      .catch(() => {})
      .then(async () => {
        setError(editError, "");
        markSaving("saving", "保存中…");
        try {
          const result = await jsonRequest(`/api/trips/${tripId}`, {
            body: JSON.stringify({
              accent: trip.accent,
              destination: trip.destination,
              endDate: trip.end_date,
              plan,
              revision: trip.revision,
              sessionId: sessionId(),
              startDate: trip.start_date,
              title: trip.title,
            }),
            headers: editHeaders,
            method: "PUT",
          });
          trip = result.trip;
          plan = result.plan;
          markSaving("saved", "保存済み");
          renderAll();
          telemetry("edited");
        } catch (requestError) {
          markSaving("error", "未保存");
          setError(editError, errorMessage(requestError.message));
          throw requestError;
        }
      });
    saveQueue.catch(() => {});
    return saveQueue;
  }

  function showView(name) {
    document.querySelectorAll("[data-view-tab]").forEach((button) => {
      button.setAttribute("aria-selected", String(button.dataset.viewTab === name));
    });
    document.querySelectorAll("[data-view-panel]").forEach((panel) => {
      panel.hidden = panel.dataset.viewPanel !== name;
    });
  }

  document.querySelector(".view-tabs").addEventListener("click", (event) => {
    const button = event.target.closest("[data-view-tab]");
    if (button) showView(button.dataset.viewTab);
  });
  document.getElementById("day-tabs").addEventListener("click", (event) => {
    const button = event.target.closest("[data-day-tab]");
    if (!button) return;
    activeDay = button.dataset.dayTab;
    renderTimeline();
  });

  document.getElementById("timeline-root").addEventListener("click", (event) => {
    const edit = event.target.closest("[data-edit-item]");
    const remove = event.target.closest("[data-delete-item]");
    if (edit) {
      const item = plan.days
        .flatMap((day) => day.items)
        .find((entry) => entry.id === edit.dataset.editItem);
      if (!item) return;
      editingItemId = item.id;
      const form = document.getElementById("item-form");
      form.elements.day.value = plan.days.find((day) =>
        day.items.some((entry) => entry.id === item.id),
      ).date;
      for (const name of ["time", "kind", "title", "place", "note", "url", "cost"]) {
        form.elements[name].value = item[name] || "";
      }
      document.getElementById("save-item").textContent = "予定を更新";
      document.getElementById("cancel-item-edit").hidden = false;
      form.scrollIntoView({ behavior: "smooth", block: "center" });
    }
    if (remove && window.confirm("この予定を削除しますか？")) {
      plan.days.forEach((day) => {
        day.items = day.items.filter((item) => item.id !== remove.dataset.deleteItem);
      });
      void persist();
    }
  });

  document.getElementById("checklist-root").addEventListener("change", (event) => {
    const input = event.target.closest("[data-toggle-check]");
    if (!input || !canEdit) return;
    const item = plan.checklist.find((entry) => entry.id === input.dataset.toggleCheck);
    if (item) {
      item.checked = input.checked;
      renderChecklist();
      void persist();
    }
  });
  document.getElementById("checklist-root").addEventListener("click", (event) => {
    const remove = event.target.closest("[data-delete-check]");
    if (!remove) return;
    plan.checklist = plan.checklist.filter((item) => item.id !== remove.dataset.deleteCheck);
    void persist();
  });
  document.getElementById("expense-root").addEventListener("click", (event) => {
    const remove = event.target.closest("[data-delete-expense]");
    if (!remove) return;
    plan.expenses = plan.expenses.filter((item) => item.id !== remove.dataset.deleteExpense);
    void persist();
  });
  document.getElementById("traveler-list").addEventListener("click", (event) => {
    const remove = event.target.closest("[data-delete-traveler]");
    if (!remove) return;
    const index = Number(remove.dataset.deleteTraveler);
    const [deleted] = plan.travelers.splice(index, 1);
    plan.expenses.forEach((expense) => {
      if (expense.paidBy === deleted) expense.paidBy = "";
    });
    void persist();
  });

  document.getElementById("item-form").addEventListener("submit", (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const values = new FormData(form);
    const url = formText(values, "url").trim();
    if (url && !url.startsWith("https://")) {
      setError(editError, "案内URLは https:// から始まるURLを入力してください。");
      return;
    }
    const item = {
      cost: Number(values.get("cost") || 0),
      id: editingItemId || makeId(),
      kind: formText(values, "kind"),
      note: formText(values, "note").trim(),
      place: formText(values, "place").trim(),
      time: formText(values, "time"),
      title: formText(values, "title").trim(),
      url,
    };
    plan.days.forEach((day) => {
      day.items = day.items.filter((entry) => entry.id !== item.id);
    });
    const day = plan.days.find((entry) => entry.date === values.get("day"));
    day.items.push(item);
    day.items.sort((a, b) => a.time.localeCompare(b.time));
    editingItemId = "";
    form.reset();
    form.elements.day.value = activeDay;
    form.elements.kind.value = "move";
    document.getElementById("save-item").textContent = "予定を追加";
    document.getElementById("cancel-item-edit").hidden = true;
    showView("itinerary");
    void persist();
  });
  document.getElementById("cancel-item-edit").addEventListener("click", () => {
    editingItemId = "";
    const form = document.getElementById("item-form");
    form.reset();
    form.elements.day.value = activeDay;
    document.getElementById("save-item").textContent = "予定を追加";
    document.getElementById("cancel-item-edit").hidden = true;
  });

  document.getElementById("check-form").addEventListener("submit", (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const values = new FormData(form);
    plan.checklist.push({
      checked: false,
      id: makeId(),
      owner: formText(values, "owner").trim(),
      text: formText(values, "text").trim(),
    });
    form.reset();
    showView("checklist");
    void persist();
  });
  document.getElementById("expense-form").addEventListener("submit", (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const values = new FormData(form);
    plan.expenses.push({
      amount: Number(values.get("amount")),
      id: makeId(),
      label: formText(values, "label").trim(),
      paidBy: formText(values, "paidBy"),
    });
    form.reset();
    showView("expenses");
    void persist();
  });
  document.getElementById("traveler-form").addEventListener("submit", (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const value = formText(new FormData(form), "traveler").trim();
    if (value && !plan.travelers.includes(value)) {
      plan.travelers.push(value);
      form.reset();
      void persist();
    }
  });

  document.getElementById("settings-form").addEventListener("submit", (event) => {
    event.preventDefault();
    const values = new FormData(event.currentTarget);
    const startDate = formText(values, "startDate");
    const endDate = formText(values, "endDate");
    const dates = dateList(startDate, endDate);
    if (!dates.length || dates.length > 14) {
      setError(editError, "旅行期間は14日以内にしてください。");
      return;
    }
    const oldDays = new Map(plan.days.map((day) => [day.date, day]));
    plan.days = dates.map((date) => oldDays.get(date) || { date, items: [], label: "" });
    trip.title = formText(values, "title").trim();
    trip.destination = formText(values, "destination").trim();
    trip.start_date = startDate;
    trip.end_date = endDate;
    activeDay = dates[0];
    document.querySelectorAll("#item-day option").forEach((option) => option.remove());
    const select = document.getElementById("item-day");
    dates.forEach((date) => select.append(new Option(formatDate(date), date)));
    void persist();
  });

  document.getElementById("copy-view-url").addEventListener("click", (event) => {
    copyText(`${location.origin}/t/${tripId}`, event.currentTarget);
    telemetry("shared");
  });
  document.getElementById("copy-edit-url").addEventListener("click", (event) => {
    copyText(`${location.origin}/t/${tripId}#${editToken}`, event.currentTarget);
    telemetry("shared");
  });
  document.getElementById("print-trip").addEventListener("click", () => {
    telemetry("printed");
    window.print();
  });
  document.getElementById("export-trip").addEventListener("click", () => {
    const blob = new Blob(
      [
        JSON.stringify(
          {
            exportedAt: new Date().toISOString(),
            plan,
            trip: {
              accent: trip.accent,
              destination: trip.destination,
              endDate: trip.end_date,
              startDate: trip.start_date,
              title: trip.title,
            },
            version: 1,
          },
          null,
          2,
        ),
      ],
      { type: "application/json" },
    );
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `tabidan-${trip.start_date}.json`;
    link.click();
    URL.revokeObjectURL(link.href);
    telemetry("exported");
  });

  function icsEscape(value) {
    return String(value)
      .replaceAll("\\", "\\\\")
      .replaceAll("\n", "\\n")
      .replaceAll(",", "\\,")
      .replaceAll(";", "\\;");
  }
  document.getElementById("calendar-trip").addEventListener("click", () => {
    const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//tabidan//JA"];
    for (const day of plan.days) {
      for (const item of day.items) {
        lines.push("BEGIN:VEVENT", `UID:${item.id}@tabidan.yhay81.com`);
        const date = day.date.replaceAll("-", "");
        if (item.time) {
          lines.push(`DTSTART:${date}T${item.time.replace(":", "")}00`, "DURATION:PT1H");
        } else {
          lines.push(`DTSTART;VALUE=DATE:${date}`, "DURATION:P1D");
        }
        lines.push(`SUMMARY:${icsEscape(item.title)}`);
        if (item.place) lines.push(`LOCATION:${icsEscape(item.place)}`);
        if (item.note) lines.push(`DESCRIPTION:${icsEscape(item.note)}`);
        if (item.url) lines.push(`URL:${item.url}`);
        lines.push("END:VEVENT");
      }
    }
    lines.push("END:VCALENDAR");
    const blob = new Blob([`${lines.join("\r\n")}\r\n`], { type: "text/calendar;charset=utf-8" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `tabidan-${trip.start_date}.ics`;
    link.click();
    URL.revokeObjectURL(link.href);
    telemetry("exported");
  });

  document.getElementById("delete-trip").addEventListener("click", async () => {
    if (!window.confirm("しおりと旅程をすべて削除します。元に戻せません。")) return;
    try {
      await jsonRequest(`/api/trips/${tripId}`, { headers: editHeaders, method: "DELETE" });
      location.assign("/");
    } catch (requestError) {
      setError(editError, errorMessage(requestError.message));
    }
  });

  if (editToken) {
    jsonRequest(`/api/trips/${tripId}/manage`, { headers: editHeaders })
      .then((bundle) => {
        canEdit = true;
        trip = bundle.trip;
        plan = bundle.plan;
        document.getElementById("editor-panel").hidden = false;
        tripPage.dataset.canEdit = "true";
        markSaving("saved", "編集できます");
        renderAll();
      })
      .catch(() => {
        document.getElementById("edit-auth-error").hidden = false;
        markSaving("error", "閲覧モード");
      });
  }
})();
