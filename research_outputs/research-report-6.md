Alright — here’s the **critical synthesis** for your **ORIGINAL RESEARCH QUERY**  
("Design for routing to vision-capable models… model detection via dynamic catalog… graceful degradation if not supported")  
using the SUCCESS results from all five sub‑queries and the provided OpenRouter docs.

---

## 1. SUB‑QUERY STATUS & ENSEMBLE COMPARISON

| Sub‑Query | Topic | Status | Consensus Points | Contradictions / Unique Info |
|-----------|-------|--------|------------------|--------------------------------|
| **1** | API methods/parameters to detect vision‑capable models | SUCCESS | `GET /models` returns per‑model metadata; vision capability indicated in fields such as `modalities` / `input_modalities` (values incl. `"image"`) or boolean `multimodal`. No explicit pre-filter API param. Filtering must be client‑side. | One model claimed docs didn’t detail `modalities`; another confirmed such fields exist in API and can be used post‑fetch. |
| **2** | Graceful degradation / fallback routing | SUCCESS | No special vision‑aware fallback built‑in. Use **Model Routing** / **Provider Routing** features, detect failure, retry with alternative (e.g., text‑only) model. All fallback control logic is client‑side. | One model stressed API‑based "availability checks" via responses; another kept recommendations more architectural. |
| **3** | Programmatic access to "Input Modalities" filter | SUCCESS | UI has this filter; no public query param documented. `input_modalities` can appear in API response; best practice is to GET full list and filter in code. | Slight naming divergence (`modalities`, `input_modalities`) and note of inconsistent field presence. |
| **4** | Built‑in fallback configurable to prefer/deprioritize vision models | SUCCESS | "Automatically handling fallbacks" exists, but no API params to prefer/deprioritize by capability. Fallbacks are decided internally without capability conditions; developers must implement external routing if capability rules matter. | None — total agreement. |
| **5** | Structured metadata for graceful degradation | SUCCESS | Generally no **guaranteed**, standardized `input_modalities`/`capabilities` field. Some models present fields/tags; presence inconsistent, so automation is brittle. Reliance often on name heuristics or trial calls. | One model asserted such structured fields are absent; another said they appear sometimes but inconsistently. Both agree lack of standardization. |

---

## 2. CROSS‑SUB‑QUERY CONSENSUS

From **Sub‑Queries 1, 3, 5**:
- Detection of vision capability is **possible** but only *post‑retrieval* of the models list.
- Relevant markers: `"input_modalities": ["text","image"]`, `"modalities"` array, boolean `multimodal`, `"tags": ["vision", ...]`.  
  However, **inconsistent** across models — not formally guaranteed in schema ([Unverified] without full docs API schema).
- No documented API `filter` parameter for capability — the website’s "Input Modalities" filter is **UI‑only**.

From **Sub‑Queries 2 & 4**:
- Built‑in fallback system exists, but **not configurable** to prioritize or exclude vision models.
- Vision‑aware graceful degradation must be coded in the client:
  - Detect whether model supports `"image"` via metadata (if present) or known model list.
  - On unsupported model or failure, reroute to a text‑only model via Model/Provider Routing.
- Presets and provider routing can formalize the preference chain.
- Error handling (`4xx/5xx` codes or model‑specific errors) is used to trigger fallback.

---

## 3. DISCREPANCIES / LIMITATIONS

- **Meta field naming:** Some answers referred to `modalities`, others `input_modalities`; both could exist or be provider‑specific. Documentation snippet did not show exact naming — must confirm via real API call.
- **Presence of structured metadata:** One interpretation suggested fields like `input_modalities` are in some responses; another said structured fields are generally absent, with hints only in `tags` or names. This suggests **partial population** and lack of documented API guarantees.
- **No API pre‑filter:** Confirmed in all — filtering happens client‑side.
- **Fallback configurability:** Universally no vision‑based routing parameter; only manual chaining of models.

---

## 4. SYNTHESIZED DESIGN GUIDANCE (Integrating SUCCESS Sub‑Queries)

### 4.1. Dynamic Detection of Vision‑Capable Models
1. **Fetch full model list** using OpenRouter API (`GET /models` or `GET /v1/models`).  
   [_Docs: OpenRouter Quickstart Guide — https://openrouter.ai/docs_]
2. **Inspect metadata** for vision capability:
   - Check for `input_modalities` or `modalities` array containing `"image"`.
   - Fall back to checking `multimodal: true` or tags/descriptions (`"vision"`, `"multimodal"`).
   - Maintain an **allow‑list** of known vision‑capable IDs (e.g., `openai/gpt-4-vision-preview`) to handle metadata gaps.
   - Example (unverified field names — must confirm with live response):
     ```json
     {
       "id": "openai/gpt-4-vision-preview",
       "input_modalities": ["text", "image"],
       "multimodal": true
     }
     ```
3. **Programmatically filter client‑side**, as no API param matches the UI "Input Modalities" filter.

### 4.2. Graceful Degradation Workflow
- **Primary path:** Use a vision‑capable model for image‑conditioned tasks.
- **Failure/Unsupported Detection:** Before sending an image:
  - Check capabilities metadata (if exists) OR
  - Attempt small test call; catch `415 Unsupported` or provider‑specific error.
- **Fallback logic:**  
  - If no vision support, switch to a text‑only model with compatible context length.
  - Use **Model Routing** or **Provider Routing** in OpenRouter to prioritize primary model but define backup.
  - Example pseudocode:
    ```python
    model_chain = ["openai/gpt-4-vision-preview", "openai/gpt-4-turbo"]
    for model in model_chain:
        if supports_images(model) or model == last_fallback:
            try:
                return call_model(model, payload)
            except ModelError:
                continue
    ```

### 4.3. Capability‑Aware Routing Constraints
- OpenRouter’s **automatic fallback** cannot be filtered by capability.
- For capability‑aware routing, handle fallback logic before sending request to OpenRouter or via a higher layer in your integration.

---

## 5. CITATIONS

- [OpenRouter Quickstart Guide | Developer Documentation | OpenRouter | Documentation — https://openrouter.ai/docs](https://openrouter.ai/docs)  
- [OpenRouter — Models Browser & Filters — https://openrouter.ai/models](https://openrouter.ai/models)

---

## 6. OVERALL CONFIDENCE

| Claim | Confidence | Basis |
|-------|------------|-------|
| API supports retrieving metadata that *can* indicate vision support (e.g., `"image"` in modalities) | **High** | Multiple sources agree; unofficial JSON examples seen in practice; not formally guaranteed. |
| No documented API parameter to pre‑filter for vision | **High** | Consensus across all sub‑queries; only UI supports such filter. |
| Metadata presence inconsistent and undocumented — must handle missing fields | **High** | Confirmed in 1, 3, and 5. |
| Built‑in fallback cannot be configured to prefer/avoid vision models | **High** | Agreement in 2 & 4; no API parameter exists. |
| Graceful degradation must be implemented client‑side | **High** | Universal consensus. |

---

**Final Expert Assessment:**  
For **routing to vision‑capable models with graceful degradation** in OpenRouter, your design must:
- Dynamically pull model metadata and inspect for `"image"` capability.
- Maintain your own fallback chain in client code — built‑in fallback is *not* vision‑aware.
- Expect incomplete metadata and prepare a known‑model allow‑list.
- No API pre‑filter exists; treat the web UI filter as informational only.

---

If you want, I can now draw a **flow diagram** showing the recommended *vision‑model detection → routing → fallback* pipeline based on these findings.  
Would you like me to produce that diagram?