export const DEV_RUNTIME_LOG_ROUTE = "/__dev/log-runtime";
export const DEV_RUNTIME_LOG_PATH = "tmp/dev-runtime.log";

export type DevRuntimeLogLevel = "debug" | "warn" | "error";

type DevRuntimeLogEvent = {
  level: DevRuntimeLogLevel;
  source: string;
  message: string;
  details?: unknown;
  stack?: string;
  pathname?: string;
  href?: string;
};

let runtimeLoggingInstalled = false;

export function logDevEvent(
  level: DevRuntimeLogLevel,
  source: string,
  message: string,
  options: {
    details?: unknown;
    stack?: string;
  } = {},
): void {
  if (!import.meta.env.DEV) {
    return;
  }

  const payload: DevRuntimeLogEvent = {
    level,
    source,
    message,
    details: options.details === undefined ? undefined : normalizeLogValue(options.details),
    stack: options.stack,
    pathname: globalThis.location?.pathname,
    href: globalThis.location?.href,
  };

  void fetch(DEV_RUNTIME_LOG_ROUTE, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  }).catch(() => {
    // Best-effort development logging only.
  });
}

export function installDevRuntimeLogging(): void {
  if (!import.meta.env.DEV || runtimeLoggingInstalled) {
    return;
  }

  runtimeLoggingInstalled = true;

  const originalDebug = console.debug.bind(console);
  const originalWarn = console.warn.bind(console);
  const originalError = console.error.bind(console);

  console.debug = (...args: unknown[]) => {
    originalDebug(...args);
    logConsoleEvent("debug", args);
  };

  console.warn = (...args: unknown[]) => {
    originalWarn(...args);
    logConsoleEvent("warn", args);
  };

  console.error = (...args: unknown[]) => {
    originalError(...args);
    logConsoleEvent("error", args);
  };

  window.addEventListener("error", (event) => {
    const error = event.error;
    logDevEvent(
      "error",
      "window.error",
      event.message || "Unhandled window error.",
      {
        details: {
          filename: event.filename,
          lineno: event.lineno,
          colno: event.colno,
          error: error ? normalizeLogValue(error) : undefined,
        },
        stack: error instanceof Error ? error.stack : captureOriginStack("window.error"),
      },
    );
  });

  window.addEventListener("unhandledrejection", (event) => {
    const reason = event.reason;
    logDevEvent(
      "error",
      "window.unhandledrejection",
      "Unhandled promise rejection.",
      {
        details: {
          reason: normalizeLogValue(reason),
        },
        stack: reason instanceof Error ? reason.stack : captureOriginStack("window.unhandledrejection"),
      },
    );
  });

  logDevEvent("debug", "runtime-log", "Installed development runtime logging.", {
    details: {
      userAgent: globalThis.navigator?.userAgent,
    },
  });
}

function logConsoleEvent(level: DevRuntimeLogLevel, args: unknown[]): void {
  const errorArg = args.find((arg) => arg instanceof Error);
  logDevEvent(
    level,
    `console.${level}`,
    formatConsoleMessage(args),
    {
      details: {
        args: normalizeLogValue(args),
      },
      stack: errorArg instanceof Error ? errorArg.stack : captureOriginStack(`console.${level}`),
    },
  );
}

function formatConsoleMessage(args: unknown[]): string {
  const parts = args.map((arg) => {
    if (typeof arg === "string") {
      return arg;
    }
    if (arg instanceof Error) {
      return `${arg.name}: ${arg.message}`;
    }
    try {
      return JSON.stringify(normalizeLogValue(arg));
    } catch {
      return String(arg);
    }
  });
  return parts.join(" ");
}

function captureOriginStack(label: string): string | undefined {
  const stack = new Error(label).stack;
  if (!stack) {
    return undefined;
  }
  const frames = stack.split("\n");
  return frames.slice(2).join("\n");
}

function normalizeLogValue(value: unknown, seen = new WeakSet<object>()): unknown {
  if (
    value === null
    || typeof value === "string"
    || typeof value === "number"
    || typeof value === "boolean"
  ) {
    return value;
  }

  if (typeof value === "bigint") {
    return value.toString();
  }

  if (typeof value === "undefined") {
    return "[undefined]";
  }

  if (typeof value === "function") {
    return `[Function ${value.name || "anonymous"}]`;
  }

  if (value instanceof Error) {
    return {
      name: value.name,
      message: value.message,
      stack: value.stack,
      cause:
        "cause" in value
          ? normalizeLogValue((value as Error & { cause?: unknown }).cause, seen)
          : undefined,
    };
  }

  if (Array.isArray(value)) {
    return value.slice(0, 24).map((entry) => normalizeLogValue(entry, seen));
  }

  if (typeof value === "object") {
    if (seen.has(value as object)) {
      return "[Circular]";
    }
    seen.add(value as object);

    const normalizedEntries = Object.entries(value as Record<string, unknown>)
      .slice(0, 40)
      .map(([key, entryValue]) => [key, normalizeLogValue(entryValue, seen)] as const);

    return Object.fromEntries(normalizedEntries);
  }

  return String(value);
}
