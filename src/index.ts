interface ErrorTrackingOptions {
  trackFetch?: boolean;
  trackXMLHTTPRequeust?: boolean;
}

function logErrorRequest(logURL: string, error: unknown) {
  fetch(logURL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      error: error,
    }),
  });
}

function logFetchRequests(logURL: string) {
  const originalFetch = window.fetch;

  window.fetch = async (...args) => {
    const [url, options] = args;

    try {
      const response = await originalFetch(...args);
      return response;
    } catch (error) {
      logErrorRequest(logURL, error);
      console.error(`GREYAREA: [fetch] ${url} failed:`, error);
      throw error;
    }
  };
}

/**
 * Monkey‑patches XMLHttpRequest so every request is logged and
 * any error is surfaced via console.error.
 */
function logXMLHTTPRequests(logURL: string) {
  (function () {
    const originalOpen = XMLHttpRequest.prototype.open;
    const originalSend = XMLHttpRequest.prototype.send;

    XMLHttpRequest.prototype.open = function (
      method: string,
      url: string | URL
    ): void {
      (this as any)._url = url.toString();
      (this as any)._method = method;
      return originalOpen.apply(this, arguments as any);
    };

    XMLHttpRequest.prototype.send = function (
      body?: Document | BodyInit | null
    ): void {
      const xhr = this as XMLHttpRequest & { _url?: string; _method?: string };

      /** Helper to build the common log prefix */
      const prefix = () =>
        `[XHR] ${xhr._method ?? "UNKNOWN"} ${xhr._url ?? "UNKNOWN"}`;

      /* ----- success / failure handlers ----- */

      // Fired for ALL completed requests (even 4xx / 5xx)
      xhr.addEventListener("load", function () {
        // Treat any non‑2xx response as an error
        if (xhr.status < 200 || xhr.status >= 300) {
          logErrorRequest(logURL, xhr.status);
        }
      });

      // Fired when the request couldn’t be completed at all
      ["error", "timeout", "abort"].forEach((evt) =>
        xhr.addEventListener(evt, function () {
          logErrorRequest(logURL, evt);
        })
      );

      return originalSend.apply(this, arguments as any);
    };
  })();
}

export function trackErrors(
  logURL: string,
  opts: ErrorTrackingOptions = {
    trackFetch: true,
    trackXMLHTTPRequeust: true,
  }
) {
  // Listen for browser errors
  if (window) {
    addEventListener("error", (error) => {
      logErrorRequest(logURL, error);
    });
  }
  if (opts.trackFetch) logFetchRequests(logURL);
  if (opts.trackXMLHTTPRequeust) logXMLHTTPRequests(logURL);
}
