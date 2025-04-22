interface ErrorTrackingOptions {
  trackFetch?: boolean;
  trackXMLHTTPRequeust?: boolean;
}

export class Tracker {
  private logURL: string;
  private options: ErrorTrackingOptions;

  private constructor(logURL: string, options?: ErrorTrackingOptions) {
    this.logURL = logURL;
    this.options = options || {
      trackFetch: true,
      trackXMLHTTPRequeust: true,
    };
  }

  private logErrorRequest(error: unknown) {
    fetch(this.logURL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        error: error,
      }),
    });
  }

  private logFetchRequests() {
    const originalFetch = window.fetch;
    window.fetch = async (...args) => {
      const [url, options] = args;

      try {
        const response = await originalFetch(...args);
        return response;
      } catch (error) {
        this.logErrorRequest(error);
        console.error(`GREYAREA: [fetch] ${url} failed:`, error);
        throw error;
      }
    };
  }

  /**
   * Monkey‑patches XMLHttpRequest so every request is logged and
   * any error is surfaced via console.error.
   */
  private logXMLHTTPRequests() {
    const tracker = this;
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
        const xhr = this as XMLHttpRequest & {
          _url?: string;
          _method?: string;
        };

        /** Helper to build the common log prefix */
        const prefix = () =>
          `[XHR] ${xhr._method ?? "UNKNOWN"} ${xhr._url ?? "UNKNOWN"}`;

        /* ----- success / failure handlers ----- */

        // Fired for ALL completed requests (even 4xx / 5xx)
        xhr.addEventListener("load", function () {
          // Treat any non‑2xx response as an error
          if (xhr.status < 200 || xhr.status >= 300) {
            tracker.logErrorRequest(xhr.status);
          }
        });

        // Fired when the request couldn’t be completed at all
        ["error", "timeout", "abort"].forEach((evt) =>
          xhr.addEventListener(evt, function () {
            tracker.logErrorRequest(evt);
          })
        );

        return originalSend.apply(this, arguments as any);
      };
    })();
  }

  static start(baseURL: string, options?: ErrorTrackingOptions): Tracker {
    const tracker = new Tracker(baseURL, options);

    if (options?.trackFetch) tracker.logFetchRequests();
    if (options?.trackXMLHTTPRequeust) tracker.logXMLHTTPRequests();
    return tracker;
  }
}
