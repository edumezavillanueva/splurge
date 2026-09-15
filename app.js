const STORAGE_KEY = "splurge_v1_state";

const DEFAULTS = {
  dailyBudget: 70,
  nextDailyBudget: null,
  todayBalance: 70,
  splurgeBalance: 0,
  bankBalanceCLP: 1100000,
  cashBalanceEUR: 270,
  exchangeRate: 1110,
  expenseMode: "essential",
  paymentMethod: "debit",
  lastProcessedDate: null,
  manuallyClosedDate: null,
  transactions: []
};

const TRIP_START = new Date(2026, 8, 22);
const TRIP_END = new Date(2026, 9, 14);

let state = loadState();

const els = {
  daysRemaining: document.getElementById("daysRemaining"),

  bankBalance: document.getElementById("bankBalance"),
  bankBalanceEur: document.getElementById("bankBalanceEur"),
  cashBalance: document.getElementById("cashBalance"),
  exchangeRateText: document.getElementById("exchangeRateText"),
  editBalancesBtn: document.getElementById("editBalancesBtn"),

  todayBalance: document.getElementById("todayBalance"),
  todayProgressBar: document.getElementById("todayProgressBar"),
  closePreview: document.getElementById("closePreview"),

  splurgeCard: document.getElementById("splurgeCard"),
  splurgeBalance: document.getElementById("splurgeBalance"),

  essentialModeBtn: document.getElementById("essentialModeBtn"),
  splurgeModeBtn: document.getElementById("splurgeModeBtn"),

  expenseForm: document.getElementById("expenseForm"),
  categorySection: document.getElementById("categorySection"),
  expenseCategory: document.getElementById("expenseCategory"),
  descriptionGroup: document.getElementById("descriptionGroup"),
  expenseDescription: document.getElementById("expenseDescription"),
  expenseAmount: document.getElementById("expenseAmount"),

  debitPaymentBtn: document.getElementById("debitPaymentBtn"),
  cashPaymentBtn: document.getElementById("cashPaymentBtn"),

  historyList: document.getElementById("historyList"),
  undoBtn: document.getElementById("undoBtn"),

  closeDayBtn: document.getElementById("closeDayBtn"),
  exportBtn: document.getElementById("exportBtn"),
  resetAppBtn: document.getElementById("resetAppBtn"),

  balancesDialog: document.getElementById("balancesDialog"),
  balancesForm: document.getElementById("balancesForm"),
  bankBalanceInput: document.getElementById("bankBalanceInput"),
  cashBalanceInput: document.getElementById("cashBalanceInput"),
  exchangeRateInput: document.getElementById("exchangeRateInput"),
  cancelBalancesBtn: document.getElementById("cancelBalancesBtn")
};


/* =========================================================
   UTILIDADES
   ========================================================= */

function cloneDefaults() {
  return JSON.parse(JSON.stringify(DEFAULTS));
}

function localDateKey(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function parseDateKey(key) {
  const [year, month, day] = key.split("-").map(Number);
  return new Date(year, month - 1, day);
}

function addDays(date, number) {
  const copy = new Date(date);
  copy.setDate(copy.getDate() + number);
  return copy;
}

function roundMoney(value) {
  return Math.round((Number(value) + Number.EPSILON) * 100) / 100;
}

function formatEUR(value) {
  const number = new Intl.NumberFormat("es-CL", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2
  }).format(Math.abs(value));

  const sign = value < 0 ? "−" : "";

  return `${sign}€${number}`;
}

function formatCLP(value) {
  return new Intl.NumberFormat("es-CL", {
    style: "currency",
    currency: "CLP",
    maximumFractionDigits: 0
  }).format(Math.round(value));
}

function formatDate(dateString) {
  const date = parseDateKey(dateString);

  return new Intl.DateTimeFormat("es-CL", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric"
  }).format(date);
}

function formatTime(timestamp) {
  return new Intl.DateTimeFormat("es-CL", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  }).format(new Date(timestamp));
}

function escapeHTML(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}


/* =========================================================
   ESTADO / ALMACENAMIENTO
   ========================================================= */

function loadState() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);

    if (!saved) {
      const fresh = cloneDefaults();
      fresh.lastProcessedDate = localDateKey();
      return fresh;
    }

    const parsed = JSON.parse(saved);

    return {
      ...cloneDefaults(),
      ...parsed,
      transactions: Array.isArray(parsed.transactions)
        ? parsed.transactions
        : []
    };
  } catch (error) {
    console.error("No se pudo leer el estado guardado:", error);

    const fresh = cloneDefaults();
    fresh.lastProcessedDate = localDateKey();

    return fresh;
  }
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}


/* =========================================================
   CONTADOR DEL VIAJE
   ========================================================= */

function updateDaysRemaining() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const start = new Date(TRIP_START);
  const end = new Date(TRIP_END);

  start.setHours(0, 0, 0, 0);
  end.setHours(0, 0, 0, 0);

  if (today < start || today > end) {
    els.daysRemaining.classList.add("hidden");
    return;
  }

  const msPerDay = 24 * 60 * 60 * 1000;

  const remaining =
    Math.round((end - today) / msPerDay) + 1;

  els.daysRemaining.textContent =
    remaining === 1
      ? "1 día restante"
      : `${remaining} días restantes`;

  els.daysRemaining.classList.remove("hidden");
}


/* =========================================================
   CIERRE AUTOMÁTICO DE DÍA
   ========================================================= */

function processPendingDays() {
  const todayKey = localDateKey();

  if (!state.lastProcessedDate) {
    state.lastProcessedDate = todayKey;
    saveState();
    return;
  }

  if (state.lastProcessedDate === todayKey) {
    return;
  }

  let cursor = parseDateKey(state.lastProcessedDate);
  const today = parseDateKey(todayKey);

  while (cursor < today) {
    const cursorKey = localDateKey(cursor);

    if (state.manuallyClosedDate !== cursorKey) {
      closeBudgetDay(cursorKey, true);
    }

    cursor = addDays(cursor, 1);

    if (state.nextDailyBudget !== null) {
      state.dailyBudget = state.nextDailyBudget;
      state.nextDailyBudget = null;
    }

    state.todayBalance = state.dailyBudget;
    state.manuallyClosedDate = null;
  }

  state.lastProcessedDate = todayKey;
  saveState();
}


/* =========================================================
   CIERRE DE DÍA
   ========================================================= */

function closeBudgetDay(dateKey, automatic = false) {
  const leftover = Math.max(0, state.todayBalance);

  if (leftover > 0) {
    state.splurgeBalance = roundMoney(
      state.splurgeBalance + leftover
    );

    state.transactions.push({
      id: crypto.randomUUID(),
      timestamp: Date.now(),
      date: dateKey,
      type: "day-close",
      category: "Cierre del día",
      description: automatic
        ? "Cierre automático"
        : "Cierre manual",
      amountEUR: leftover,
      paymentMethod: null,
      exchangeRate: state.exchangeRate,
      clpEstimate: null,
      todayBefore: state.todayBalance,
      splurgeBefore: roundMoney(
        state.splurgeBalance - leftover
      ),
      bankBefore: state.bankBalanceCLP,
      cashBefore: state.cashBalanceEUR
    });
  }

  state.todayBalance = 0;
}


/* =========================================================
   RENDER GENERAL
   ========================================================= */

function render() {
  renderBalances();
  renderToday();
  renderSplurge();
  renderExpenseMode();
  renderPaymentMethod();
  renderHistory();
  updateDaysRemaining();

  saveState();
}


/* =========================================================
   SALDOS REALES
   ========================================================= */

function renderBalances() {
  els.bankBalance.textContent =
    formatCLP(state.bankBalanceCLP);

  const eurEquivalent =
    state.exchangeRate > 0
      ? state.bankBalanceCLP / state.exchangeRate
      : 0;

  els.bankBalanceEur.textContent =
    `≈ ${formatEUR(eurEquivalent)}`;

  els.cashBalance.textContent =
    formatEUR(state.cashBalanceEUR);

  els.exchangeRateText.textContent =
    `€1 ≈ ${formatCLP(state.exchangeRate)} · referencia`;
}


/* =========================================================
   HOY
   ========================================================= */

function renderToday() {
  els.todayBalance.textContent =
    formatEUR(state.todayBalance);

  const percent =
    state.dailyBudget > 0
      ? Math.max(
          0,
          Math.min(
            100,
            (state.todayBalance / state.dailyBudget) * 100
          )
        )
      : 0;

  els.todayProgressBar.style.width =
    `${percent}%`;

  const budgetLabel =
    document.querySelector(".today-card .section-heading small");

  if (budgetLabel) {
    budgetLabel.textContent =
      `de ${formatEUR(state.dailyBudget)} diarios`;
  }

  const transferable =
    Math.max(0, state.todayBalance);

  els.closePreview.textContent =
    `Al cerrar hoy → +${formatEUR(
      transferable
    )} a SPLURGE`;
}


/* =========================================================
   SPLURGE
   ========================================================= */

function renderSplurge() {
  els.splurgeBalance.textContent =
    formatEUR(state.splurgeBalance);

  els.splurgeCard.classList.toggle(
    "negative",
    state.splurgeBalance < 0
  );
}


/* =========================================================
   MODO DE GASTO
   ========================================================= */

function setExpenseMode(mode) {
  state.expenseMode = mode;

  if (mode === "splurge") {
    els.expenseDescription.placeholder =
      "¿En qué cayó?";
  } else {
    els.expenseDescription.placeholder =
      "¿Qué fue?";
  }

  renderExpenseMode();
  saveState();
}

function renderExpenseMode() {
  const essential =
    state.expenseMode === "essential";

  els.essentialModeBtn.classList.toggle(
    "active",
    essential
  );

  els.splurgeModeBtn.classList.toggle(
    "active",
    !essential
  );

  els.categorySection.classList.toggle(
    "hidden",
    !essential
  );

  if (!essential) {
    els.descriptionGroup.classList.remove("hidden");
  } else {
    const isOther =
      els.expenseCategory.value === "Otro";

    els.descriptionGroup.classList.toggle(
      "hidden",
      !isOther
    );
  }
}


/* =========================================================
   MEDIO DE PAGO
   ========================================================= */

function setPaymentMethod(method) {
  state.paymentMethod = method;
  renderPaymentMethod();
  saveState();
}

function renderPaymentMethod() {
  const debit =
    state.paymentMethod === "debit";

  els.debitPaymentBtn.classList.toggle(
    "active",
    debit
  );

  els.cashPaymentBtn.classList.toggle(
    "active",
    !debit
  );
}


/* =========================================================
   REGISTRAR GASTO
   ========================================================= */

function registerExpense(event) {
  event.preventDefault();

  const amount =
    roundMoney(
      Number(
        String(els.expenseAmount.value)
          .replace(",", ".")
      )
    );

  if (!Number.isFinite(amount) || amount <= 0) {
    alert("Ingresa un monto válido.");
    return;
  }

  const isEssential =
    state.expenseMode === "essential";

  const category =
    isEssential
      ? els.expenseCategory.value
      : "SPLURGE";

  const description =
    els.expenseDescription.value.trim();

  if (
    isEssential &&
    category === "Otro" &&
    !description
  ) {
    alert("Cuéntame qué fue ese gasto.");
    els.expenseDescription.focus();
    return;
  }

  const transaction = {
    id: crypto.randomUUID(),
    timestamp: Date.now(),
    date: localDateKey(),

    type: isEssential
      ? "essential"
      : "splurge",

    category,
    description,

    amountEUR: amount,

    paymentMethod:
      state.paymentMethod,

    exchangeRate:
      state.exchangeRate,

    clpEstimate:
      state.paymentMethod === "debit"
        ? Math.round(
            amount * state.exchangeRate
          )
        : null,

    todayBefore:
      state.todayBalance,

    splurgeBefore:
      state.splurgeBalance,

    bankBefore:
      state.bankBalanceCLP,

    cashBefore:
      state.cashBalanceEUR
  };


  /* PRESUPUESTO */

  if (isEssential) {
    if (amount <= state.todayBalance) {
      state.todayBalance =
        roundMoney(
          state.todayBalance - amount
        );
    } else {
      const excess =
        roundMoney(
          amount - state.todayBalance
        );

      state.todayBalance = 0;

      state.splurgeBalance =
        roundMoney(
          state.splurgeBalance - excess
        );
    }
  } else {
    state.splurgeBalance =
      roundMoney(
        state.splurgeBalance - amount
      );
  }


  /* DINERO REAL */

  if (state.paymentMethod === "debit") {
    const clp =
      Math.round(
        amount * state.exchangeRate
      );

    state.bankBalanceCLP =
      Math.round(
        state.bankBalanceCLP - clp
      );
  } else {
    state.cashBalanceEUR =
      roundMoney(
        state.cashBalanceEUR - amount
      );
  }


  state.transactions.push(transaction);

  els.expenseAmount.value = "";
  els.expenseDescription.value = "";

  render();
}


/* =========================================================
   HISTORIAL
   ========================================================= */

function renderHistory() {
  const transactions =
    state.transactions
      .filter(
        item =>
          item.type !== "day-close"
      )
      .slice()
      .reverse()
      .slice(0, 12);

  els.undoBtn.disabled =
    state.transactions.length === 0;

  if (!transactions.length) {
    els.historyList.innerHTML =
      `<div class="empty-history">
        Todavía no hay movimientos.
      </div>`;

    return;
  }

  els.historyList.innerHTML =
    transactions
      .map(item => {
        const title =
          item.description ||
          item.category;

        const payment =
          item.paymentMethod === "cash"
            ? "Efectivo"
            : "Débito";

        const typeLabel =
          item.type === "splurge"
            ? "SPLURGE"
            : item.category;

        return `
          <div class="history-item ${
            item.type === "splurge"
              ? "splurge"
              : ""
          }">

            <div class="history-main">

              <div class="history-title">
                ${escapeHTML(title)}
              </div>

              <div class="history-meta">
                ${escapeHTML(typeLabel)}
                ·
                ${payment}
                ·
                ${formatDate(item.date)}
                ${formatTime(item.timestamp)}
              </div>

            </div>

            <div class="history-amount">
              −${formatEUR(item.amountEUR)}
            </div>

          </div>
        `;
      })
      .join("");
}


/* =========================================================
   DESHACER
   ========================================================= */

function undoLastTransaction() {
  const last =
    state.transactions.pop();

  if (!last) {
    return;
  }

  state.todayBalance =
    last.todayBefore;

  state.splurgeBalance =
    last.splurgeBefore;

  state.bankBalanceCLP =
    last.bankBefore;

  state.cashBalanceEUR =
    last.cashBefore;

  if (last.type === "day-close") {
    state.manuallyClosedDate = null;
  }

  render();
}


/* =========================================================
   CERRAR EL DÍA MANUALMENTE
   ========================================================= */

function manualCloseDay() {
  const todayKey = localDateKey();

  if (
    state.manuallyClosedDate === todayKey
  ) {
    alert("Este día ya fue cerrado.");
    return;
  }

  const transferable =
    Math.max(0, state.todayBalance);

  const confirmed =
    confirm(
      `Se transferirán ${formatEUR(
        transferable
      )} a SPLURGE y HOY quedará en €0.\n\n¿Cerrar el día?`
    );

  if (!confirmed) {
    return;
  }

  closeBudgetDay(
    todayKey,
    false
  );

  state.manuallyClosedDate =
    todayKey;

  render();
}


/* =========================================================
   EDITAR SALDOS Y PRESUPUESTO
   ========================================================= */

function openBalancesDialog() {
  els.bankBalanceInput.value =
    state.bankBalanceCLP;

  els.cashBalanceInput.value =
    state.cashBalanceEUR;

  els.exchangeRateInput.value =
    state.exchangeRate;

  ensureDailyBudgetField();

  const dailyInput =
    document.getElementById(
      "dailyBudgetInput"
    );

  dailyInput.value =
    state.dailyBudget;

  els.balancesDialog.showModal();
}

function ensureDailyBudgetField() {
  if (
    document.getElementById(
      "dailyBudgetInput"
    )
  ) {
    return;
  }

  const exchangeGroup =
    els.exchangeRateInput.closest(
      ".form-group"
    );

  const group =
    document.createElement("div");

  group.className =
    "form-group";

  group.innerHTML = `
    <label for="dailyBudgetInput">
      Presupuesto diario · EUR
    </label>

    <input
      id="dailyBudgetInput"
      type="number"
      min="1"
      step="0.01"
      inputmode="decimal"
    >
  `;

  exchangeGroup.insertAdjacentElement(
    "afterend",
    group
  );
}

function saveBalances(event) {
  event.preventDefault();

  const bank =
    Number(
      els.bankBalanceInput.value
    );

  const cash =
    Number(
      els.cashBalanceInput.value
    );

  const rate =
    Number(
      els.exchangeRateInput.value
    );

  const dailyInput =
    document.getElementById(
      "dailyBudgetInput"
    );

  const newDaily =
    roundMoney(
      Number(dailyInput.value)
    );

  if (
    !Number.isFinite(bank) ||
    !Number.isFinite(cash) ||
    !Number.isFinite(rate) ||
    !Number.isFinite(newDaily) ||
    bank < 0 ||
    cash < 0 ||
    rate <= 0 ||
    newDaily <= 0
  ) {
    alert("Revisa los valores ingresados.");
    return;
  }

  state.bankBalanceCLP =
    Math.round(bank);

  state.cashBalanceEUR =
    roundMoney(cash);

  state.exchangeRate =
    Math.round(rate);


  if (newDaily !== state.dailyBudget) {
    const applyToday =
      confirm(
        `Cambiar presupuesto diario de ${formatEUR(
          state.dailyBudget
        )} a ${formatEUR(
          newDaily
        )}.\n\nAceptar = aplicar desde HOY.\nCancelar = aplicar desde MAÑANA.`
      );

    if (applyToday) {
      const todayKey = localDateKey();

      const essentialSpentToday =
        roundMoney(
          state.transactions
            .filter(item =>
              item.type === "essential" &&
              item.date === todayKey
            )
            .reduce(
              (sum, item) =>
                sum + Number(item.amountEUR || 0),
              0
            )
        );

      const oldExcess =
        roundMoney(
          Math.max(
            0,
            essentialSpentToday -
            state.dailyBudget
          )
        );

      const newExcess =
        roundMoney(
          Math.max(
            0,
            essentialSpentToday -
            newDaily
          )
        );

      const splurgeAdjustment =
        roundMoney(
          oldExcess - newExcess
        );

      state.splurgeBalance =
        roundMoney(
          state.splurgeBalance +
          splurgeAdjustment
        );

      state.dailyBudget =
        newDaily;

      state.todayBalance =
        roundMoney(
          Math.max(
            0,
            newDaily -
            essentialSpentToday
          )
        );

      state.nextDailyBudget = null;
    } else {
      state.nextDailyBudget =
        newDaily;
    }
  }

  els.balancesDialog.close();

  render();
}


/* =========================================================
   EXPORTAR CSV
   ========================================================= */

function exportCSV() {
  const rows = [
    [
      "Fecha",
      "Hora",
      "Tipo",
      "Categoría",
      "Descripción",
      "Monto EUR",
      "Medio de pago",
      "Tipo de cambio CLP/EUR",
      "CLP estimado"
    ]
  ];

  state.transactions
    .filter(
      item =>
        item.type === "essential" ||
        item.type === "splurge"
    )
    .forEach(item => {
      rows.push([
        item.date,
        formatTime(item.timestamp),

        item.type === "splurge"
          ? "SPLURGE"
          : "Esencial",

        item.type === "splurge"
          ? ""
          : item.category,

        item.description || "",

        item.amountEUR
          .toFixed(2)
          .replace(".", ","),

        item.paymentMethod === "cash"
          ? "Efectivo"
          : "Débito",

        item.exchangeRate,

        item.clpEstimate ?? ""
      ]);
    });

  const csv =
    rows
      .map(row =>
        row
          .map(value => {
            const text =
              String(value ?? "")
                .replaceAll('"', '""');

            return `"${text}"`;
          })
          .join(";")
      )
      .join("\n");

  const blob =
    new Blob(
      [
        "\uFEFF",
        csv
      ],
      {
        type:
          "text/csv;charset=utf-8;"
      }
    );

  const url =
    URL.createObjectURL(blob);

  const link =
    document.createElement("a");

  link.href = url;

  link.download =
    `SPLURGE_${localDateKey()}.csv`;

  document.body.appendChild(link);

  link.click();
  link.remove();

  URL.revokeObjectURL(url);
}


/* =========================================================
   RESET PROTEGIDO
   ========================================================= */

function resetApp() {
  const password =
    prompt(
      "Contraseña para restablecer SPLURGE:"
    );

  if (password === null) {
    return;
  }

  /*
    La contraseña se construye por partes
    para que no aparezca escrita directamente
    como una sola cadena en el archivo.
  */

  const expected =
    ["Edu", "210879", "#"].join("");

  if (password !== expected) {
    alert("Contraseña incorrecta.");
    return;
  }

  const confirmed =
    confirm(
      "¿Restablecer SPLURGE a sus valores iniciales?\n\nSe eliminarán todos los movimientos y cambios realizados."
    );

  if (!confirmed) {
    return;
  }

  state = cloneDefaults();

  state.lastProcessedDate =
    localDateKey();

  localStorage.removeItem(
    STORAGE_KEY
  );

  saveState();

  render();

  alert("SPLURGE fue restablecido.");
}


/* =========================================================
   EVENTOS
   ========================================================= */

els.essentialModeBtn.addEventListener(
  "click",
  () => setExpenseMode("essential")
);

els.splurgeModeBtn.addEventListener(
  "click",
  () => setExpenseMode("splurge")
);

els.debitPaymentBtn.addEventListener(
  "click",
  () => setPaymentMethod("debit")
);

els.cashPaymentBtn.addEventListener(
  "click",
  () => setPaymentMethod("cash")
);

els.expenseCategory.addEventListener(
  "change",
  () => {
    renderExpenseMode();

    if (
      els.expenseCategory.value ===
      "Otro"
    ) {
      els.expenseDescription.focus();
    }
  }
);

els.expenseForm.addEventListener(
  "submit",
  registerExpense
);

els.undoBtn.addEventListener(
  "click",
  undoLastTransaction
);

els.closeDayBtn.addEventListener(
  "click",
  manualCloseDay
);

els.exportBtn.addEventListener(
  "click",
  exportCSV
);

els.editBalancesBtn.addEventListener(
  "click",
  openBalancesDialog
);

els.cancelBalancesBtn.addEventListener(
  "click",
  () =>
    els.balancesDialog.close()
);

els.balancesForm.addEventListener(
  "submit",
  saveBalances
);

els.resetAppBtn.addEventListener(
  "click",
  resetApp
);


/* =========================================================
   SERVICE WORKER
   ========================================================= */

if ("serviceWorker" in navigator) {
  window.addEventListener(
    "load",
    () => {
      navigator.serviceWorker
        .register("./sw.js")
        .catch(error => {
          console.warn(
            "Service Worker no disponible todavía:",
            error
          );
        });
    }
  );
}


/* =========================================================
   INICIO
   ========================================================= */

processPendingDays();
render();
