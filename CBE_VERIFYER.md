 Provider: Commercial Bank of Ethiopia (CBE)

### Overview & URL Shapes
CBE has the most diverse receipt URL surface in Ethiopia. All shapes map to one of two backends: the **Nuxt Public JSON Backend** or the **Legacy Port 100 PDF Backend**.

| Input Shape | Pattern | Upstream Backend |
| :--- | :--- | :--- |
| **Nuxt Token / v2 ID** | `https://mbreciept.cbe.com.et/v2-<token>` or typed `v2-...` | JSON Backend (`/api/v1/transactions/public/transaction-detail/`) |
| **Plain Short Token** | `https://mbreciept.cbe.com.et/<alphanumeric>` (16+ chars) | JSON Backend (`/api/v1/transactions/public/transaction-detail/`) |
| **Dashed Reference ID** | `https://mbreciept.cbe.com.et/FT...-12345678` | PDF Backend (dash stripped $\to$ port 100) |
| **Branch Receipt URL** | `https://apps.cbe.com.et:100/BranchReceipt/FT...&12345678` | PDF Backend (requires `&` delimiter) |
| **Legacy Direct App URL**| `https://apps.cbe.com.et:100/?id=FT...12345678` | PDF Backend (FT ref + 8-digit account suffix) |

> [!IMPORTANT]
> A raw FT reference alone (e.g. `FT2401019999`) cannot be queried in CBE without the 8-digit account number suffix. If passed without 8 digits, CBE returns `"Receipt link is not correct"`. `v2-...` tokens, QR codes, or full receipt URLs work standalone.

---

### Reverse-Engineered Nuxt Frontend Headers
CBE’s official web client (`_nuxt/D7WMxg0z.js`) queries the JSON backend. Requests without the specific application identification headers are rejected:

```javascript
/**
 * Authoritative CBE JSON Transaction Lookup
 */
async function fetchCbeJsonReceipt(token) {
  const endpoint = `https://mb.cbe.com.et/api/v1/transactions/public/transaction-detail/${encodeURIComponent(token)}`;

  const response = await fetch(endpoint, {
    method: 'GET',
    headers: {
      'Accept': 'application/json',
      'X-App-ID': 'd1292e42-7400-49de-a2d3-9731caa4c819',
      'X-App-Version': '0a01980b-9859-1369-8198-59f403820000',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0.0.0 Safari/537.36'
    }
  });

  if (response.status === 404) {
    return { notFound: true };
  }

  return response.json();
}
```

---

### Routing & Bidirectional Fallback
To ensure 100% resolution reliability across both systems:
1. **Token Analysis:**
   - If the token matches `/^FT[A-Z0-9]+-\d+$/i`, strip the dash and call the Port 100 PDF backend.
   - If the token starts with `v2-` or is an alphanumeric hash, call the JSON backend.
2. **Bidirectional Fallback:**
   - If the JSON backend returns 404 or fails, immediately try the PDF endpoint.
   - If the PDF endpoint returns 404 or fails, verify against the JSON endpoint.
3. **PDF Text Extraction:**
   - When resolving via Port 100, read the binary stream and parse with a PDF stream parser to extract standard transaction fields.


CBE_RECEIPT_BASE_URL=https://mbreciept.cbe.com.et
CBE_BRANCH_RECEIPT_BASE_URL=https://apps.cbe.com.et:100/BranchReceipt/
CBE_API_BASE_URL=https://mb.cbe.com.et/api/v1/transactions/public/transaction-detail/
CBE_APP_ID=d1292e42-7400-49de-a2d3-9731caa4c819
CBE_APP_VERSION=0a01980b-9859-1369-8198-59f403820000