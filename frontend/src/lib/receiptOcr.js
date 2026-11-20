import { getCurrencyDecimalPlaces } from "./currency";
import { createWorker } from "tesseract.js";

function parseAmount(value, decimalPlaces) {
  if (/[-−()]/.test(value)) {
    return null;
  }
  const cleaned = value.replace(/[^\d.,]/g, "");
  const lastComma = cleaned.lastIndexOf(",");
  const lastPeriod = cleaned.lastIndexOf(".");

  let normalized = cleaned;
  if (lastComma > lastPeriod) {
    const decimalDigits = cleaned.length - lastComma - 1;
    normalized =
      decimalDigits > 0 && decimalDigits <= Math.max(2, decimalPlaces)
        ? cleaned.replace(/\./g, "").replace(",", ".")
        : cleaned.replace(/,/g, "");
  } else if (lastPeriod >= 0) {
    const decimalDigits = cleaned.length - lastPeriod - 1;
    normalized =
      decimalDigits > Math.max(2, decimalPlaces)
        ? cleaned.replace(/\./g, "")
        : cleaned.replace(/,/g, "");
  }

  const amount = Number(normalized);
  return Number.isFinite(amount) && amount > 0 ? amount : null;
}

function findAmount(text, decimalPlaces) {
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const isDateLine = (line) =>
    /\bdate\b|\b\d{1,2}[-/.]\d{1,2}[-/.](?:\d{2}|\d{4})\b|\b20\d{2}[-/.]\d{1,2}[-/.]\d{1,2}\b/i.test(
      line,
    );
  const withoutDates = (line) =>
    line.replace(
      /\b(?:20\d{2}[-/.]\d{1,2}[-/.]\d{1,2}|\d{1,2}[-/.]\d{1,2}[-/.]20\d{2})\b/g,
      "",
    );
  const amountsInLine = (line) => {
    const values =
      withoutDates(line).match(
        /[-−]?\(?\d{1,3}(?:[.,\s]\d{3})+(?:[.,]\d{1,3})?\)?[-−]?|[-−]?\(?\d+(?:[.,]\d{1,3})?\)?[-−]?/g,
      ) || [];
    return values
      .reverse()
      .map((value) => parseAmount(value.trim(), decimalPlaces))
      .filter((amount) => amount !== null);
  };

  const totalLinePatterns = [
    /\b(?:amount|total)\s+paid\b/i,
    /\b(?:grand|final)\s+total\b/i,
    /\btotal\b/i,
    /\bamount\s+due\b/i,
    /\bbalance\s+due\b/i,
  ];
  let hasInvalidTotal = false;
  for (const pattern of totalLinePatterns) {
    const totalLines = lines.filter(
      (line) => pattern.test(line) && !/sub\s*total/i.test(line),
    );
    for (const line of totalLines.reverse()) {
      const amounts = amountsInLine(line);
      if (amounts.length) {
        return {
          amount: amounts[amounts.length - 1],
          status: "labelled-total",
        };
      }
      if (/\d/.test(withoutDates(line))) {
        hasInvalidTotal = true;
      }
    }
  }

  if (hasInvalidTotal) {
    return { amount: null, status: "invalid-total" };
  }

  const candidates = [
    ...new Set(
      lines
        .filter(
          (line) =>
            !isDateLine(line) &&
            !/\b(?:sub\s*total|tax|vat|discount|change|tendered|cash tender)\b/i.test(
              line,
            ),
        )
        .flatMap((line) => amountsInLine(line)),
    ),
  ];
  if (candidates.length === 1) {
    return { amount: candidates[0], status: "single-candidate" };
  }
  return {
    amount: null,
    status: candidates.length > 1 ? "ambiguous" : "missing",
  };
}

function findDate(text) {
  const isoDate = text.match(/\b(20\d{2})[-/.](\d{1,2})[-/.](\d{1,2})\b/);
  if (isoDate) {
    const date = makeDate(isoDate[1], isoDate[2], isoDate[3]);
    return { date, status: date ? "found" : "invalid" };
  }

  const numericDate = text.match(/\b(\d{1,2})[-/.](\d{1,2})[-/.](20\d{2})\b/);
  if (numericDate) {
    const first = Number(numericDate[1]);
    const second = Number(numericDate[2]);
    if (first > 12 && second <= 12) {
      const date = makeDate(numericDate[3], second, first);
      return { date, status: date ? "found" : "invalid" };
    }
    if (second > 12 && first <= 12) {
      const date = makeDate(numericDate[3], first, second);
      return { date, status: date ? "found" : "invalid" };
    }
    return { date: null, status: "ambiguous" };
  }

  const namedDate = text.match(
    /\b(Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+(\d{1,2}),?\s+(20\d{2})\b/i,
  );
  if (namedDate) {
    const month = new Date(`${namedDate[1]} 1, ${namedDate[3]}`).getMonth() + 1;
    const date = makeDate(namedDate[3], month, namedDate[2]);
    return { date, status: date ? "found" : "invalid" };
  }

  return { date: null, status: "missing" };
}

function makeDate(yearValue, monthValue, dayValue) {
  const year = Number(yearValue);
  const month = Number(monthValue);
  const day = Number(dayValue);
  const candidate = new Date(Date.UTC(year, month - 1, day));

  if (
    candidate.getUTCFullYear() !== year ||
    candidate.getUTCMonth() !== month - 1 ||
    candidate.getUTCDate() !== day
  ) {
    return null;
  }

  return [
    String(year).padStart(4, "0"),
    String(month).padStart(2, "0"),
    String(day).padStart(2, "0"),
  ].join("-");
}

function findMerchant(text) {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim().replace(/\s+/g, " "))
    .filter(Boolean)
    .slice(0, 8);
  return (
    lines.find((line) => {
      const letters = (line.match(/[A-Za-z]/g) || []).length;
      return (
        line.length <= 80 &&
        letters >= 3 &&
        letters / line.length >= 0.35 &&
        !/^(?:receipt|invoice|tax\s+invoice|cash\s+receipt|(?:grand\s+)?total|sub\s*total|amount\s+due|balance\s+due|date\s*[:#]|gst(?:in)?\b|vat\b|invoice\s*(?:no|number|#)|receipt\s*(?:no|number|#)|order\s*(?:no|number|#)|cashier\b|terminal\b|customer copy\b|thank\s+you\b|served\s+by\b)/i.test(
          line,
        )
      );
    }) || ""
  );
}

const DISTINCT_CURRENCY_SYMBOLS = [
  ["₹", "INR"],
  ["€", "EUR"],
  ["£", "GBP"],
  ["₩", "KRW"],
  ["₽", "RUB"],
  ["₪", "ILS"],
  ["฿", "THB"],
  ["₫", "VND"],
  ["₱", "PHP"],
  ["R$", "BRL"],
  ["₺", "TRY"],
  ["₦", "NGN"],
  ["₴", "UAH"],
];

const AMBIGUOUS_CURRENCY_MARKERS = [/\$/, /[¥￥]/, /\bkr\b/i, /\bRs\.?\b/i];

function findCurrency(text, supportedCurrencyCodes) {
  const supported = new Set(
    supportedCurrencyCodes.map((code) => code.toUpperCase()),
  );
  const amountLines = text
    .split(/\r?\n/)
    .filter((line) => /\d/.test(line));
  const explicitCodes = new Set();

  amountLines.forEach((line) => {
    (line.match(/\b[A-Z]{3}\b/gi) || []).forEach((code) => {
      const normalizedCode = code.toUpperCase();
      if (supported.has(normalizedCode)) {
        explicitCodes.add(normalizedCode);
      }
    });
  });

  if (explicitCodes.size === 1) {
    return { code: [...explicitCodes][0], status: "found" };
  }
  if (explicitCodes.size > 1) {
    return { code: null, status: "ambiguous" };
  }

  const symbolCodes = new Set();
  amountLines.forEach((line) => {
    DISTINCT_CURRENCY_SYMBOLS.forEach(([symbol, code]) => {
      if (supported.has(code) && line.includes(symbol)) {
        symbolCodes.add(code);
      }
    });
  });
  if (symbolCodes.size === 1) {
    return { code: [...symbolCodes][0], status: "found" };
  }
  if (
    amountLines.some((line) =>
      AMBIGUOUS_CURRENCY_MARKERS.some((marker) => marker.test(line)),
    )
  ) {
    return { code: null, status: "ambiguous" };
  }
  return {
    code: null,
    status: symbolCodes.size > 1 ? "ambiguous" : "missing",
  };
}

export function parseReceiptText(
  text,
  currencyCode = "USD",
  supportedCurrencyCodes = [],
) {
  const currency = findCurrency(text, supportedCurrencyCodes);
  const decimalPlaces = getCurrencyDecimalPlaces(
    currency.code || currencyCode,
  );
  const amount = findAmount(text, decimalPlaces);
  const date = findDate(text);
  return {
    amount: amount.amount,
    amountStatus: amount.status,
    date: date.date,
    dateStatus: date.status,
    description: findMerchant(text),
    currencyCode: currency.code,
    currencyStatus: currency.status,
  };
}

function normalizeCategoryText(value) {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function findCategory(categories, names) {
  for (const name of names) {
    const category = categories.find((item) => {
      const categoryName = normalizeCategoryText(item.name);
      return (
        categoryName === name ||
        categoryName.startsWith(`${name} `) ||
        categoryName.endsWith(` ${name}`)
      );
    });
    if (category) {
      return category.id;
    }
  }
  return "";
}

export function suggestReceiptCategoryId(text, merchant, categories) {
  const normalizedText = normalizeCategoryText(`${merchant}\n${text}`);
  const paddedText = ` ${normalizedText} `;
  const specificCategory = categories.find((category) => {
    const name = normalizeCategoryText(category.name);
    return (
      name.length >= 4 &&
      !/^(?:other|other expense|other income)$/.test(name) &&
      paddedText.includes(` ${name} `)
    );
  });
  if (specificCategory) {
    return specificCategory.id;
  }

  const suggestionRules = [
    {
      pattern:
        /\b(?:grocer(?:y|ies)|super\s*market|hypermarket|fresh market|farmers market|grocery market|produce|dairy|whole foods|trader joe'?s|aldi|lidl|tesco|carrefour|kroger|safeway|costco|walmart)\b/i,
      categories: ["groceries", "grocery", "food"],
    },
    {
      pattern:
        /\b(?:restaurant|cafe|coffee|pizza|burger|diner|food court|meal|takeaway|take out|delivery|bakery|bistro|starbucks|mcdonald'?s|domino'?s|subway|kfc|burger king|taco bell|pizza hut|doordash|uber eats|foodpanda|swiggy|zomato|grubhub)\b/i,
      categories: ["food", "dining out", "dining", "restaurant", "cafe"],
    },
    {
      pattern:
        /\b(?:pharmacy|chemist|drugstore|medicine|medication|prescription|walgreens|cvs|boots pharmacy)\b/i,
      categories: ["healthcare", "health", "medical", "pharmacy"],
    },
    {
      pattern:
        /\b(?:petrol|fuel|gas station|service station|shell|chevron|exxon|bp|mobil)\b/i,
      categories: ["transport", "transportation", "fuel", "vehicle", "auto"],
    },
    {
      pattern:
        /\b(?:retail|clothing|apparel|department store|electronics|shopping|target|amazon|best buy|home depot)\b/i,
      categories: ["shopping", "retail"],
    },
  ];

  for (const rule of suggestionRules) {
    if (rule.pattern.test(normalizedText)) {
      const categoryId = findCategory(categories, rule.categories);
      if (categoryId) {
        return categoryId;
      }
    }
  }

  return "";
}

function getErrorType(error) {
  const message =
    typeof error === "string"
      ? error.toLowerCase()
      : typeof error?.message === "string"
        ? error.message.toLowerCase()
        : "";
  if (/network|fetch|http|response code/.test(message)) {
    return "network-error";
  }
  if (/traineddata|language/.test(message)) {
    return "language-data-error";
  }
  if (/tesseractcore|wasm|core/.test(message)) {
    return "core-load-error";
  }
  if (/image|decode|bitmap|loadimage/.test(message)) {
    return "image-decode-error";
  }
  return typeof error?.name === "string" ? error.name : typeof error;
}

function logOcrFailure(stage, errorType) {
  console.error("[receipt-ocr] pipeline failed", {
    stage,
    errorType: typeof errorType === "string" ? errorType : getErrorType(errorType),
  });
}

export async function scanReceipt(
  file,
  onProgress,
  currencyCode = "USD",
  supportedCurrencyCodes = [],
  signal,
) {
  let worker;
  let terminationPromise;
  let abortHandler;
  let rejectCancellation;
  let stage = "initialize-worker";
  let hasFailure = false;
  let failure;
  let result;
  const terminateWorker = () => {
    if (!worker) {
      return Promise.resolve();
    }
    if (!terminationPromise) {
      terminationPromise = worker.terminate();
    }
    return terminationPromise;
  };

  try {
    if (signal?.aborted) {
      const error = new Error("Receipt scan was cancelled.");
      error.name = "AbortError";
      throw error;
    }
    worker = await createWorker("eng", 1, {
      workerPath:
        "https://cdn.jsdelivr.net/npm/tesseract.js@7.0.0/dist/worker.min.js",
      langPath:
        "https://cdn.jsdelivr.net/npm/@tesseract.js-data/eng@1.0.0/4.0.0_best_int",
      corePath: "https://cdn.jsdelivr.net/npm/tesseract.js-core@7.0.0",
      gzip: true,
      logger: ({ status, progress }) => {
        if (typeof status === "string") {
          stage = status;
        }
        if (status === "recognizing text" && Number.isFinite(progress)) {
          onProgress(Math.round(progress * 100));
        }
      },
    });
    if (signal?.aborted) {
      const error = new Error("Receipt scan was cancelled.");
      error.name = "AbortError";
      throw error;
    }

    stage = "decode-and-recognize-image";
    const recognition = worker.recognize(file);
    let recognitionResult = recognition;
    if (signal) {
      const cancellation = new Promise((resolve, reject) => {
        rejectCancellation = reject;
      });
      abortHandler = () => {
        void terminateWorker().then(
          () => {
            const error = new Error("Receipt scan was cancelled.");
            error.name = "AbortError";
            rejectCancellation(error);
          },
          rejectCancellation,
        );
      };
      signal.addEventListener("abort", abortHandler, { once: true });
      if (signal.aborted) {
        abortHandler();
      }
      recognitionResult = Promise.race([recognition, cancellation]);
    }

    let data;
    try {
      ({ data } = await recognitionResult);
    } finally {
      if (abortHandler) {
        signal.removeEventListener("abort", abortHandler);
      }
    }
    const text = typeof data.text === "string" ? data.text : "";
    stage = "parse-recognized-text";
    const suggestions = parseReceiptText(
      text,
      currencyCode,
      supportedCurrencyCodes,
    );
    result = {
      text,
      suggestions,
    };
  } catch (error) {
    hasFailure = true;
    failure = error;
    if (!signal?.aborted && error?.name !== "AbortError") {
      logOcrFailure(stage, error);
    }
  }

  if (worker) {
    try {
      await terminateWorker();
    } catch (error) {
      if (!signal?.aborted) {
        logOcrFailure("terminate-worker", error);
      }
      if (!hasFailure) {
        hasFailure = true;
        failure = error;
      }
    }
  }

  if (hasFailure) {
    throw failure;
  }

  return result;
}
