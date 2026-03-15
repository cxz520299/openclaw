import{A as l,d as e,J as r}from"./index-CenotFkT.js";function g(a){const s=(a.status&&typeof a.status=="object"?a.status.securityAudit:null)?.summary??null,i=s?.critical??0,d=s?.warn??0,c=s?.info??0,n=i>0?"danger":d>0?"warn":"success",o=i>0?`${i} critical`:d>0?`${d} warnings`:"No critical issues";return e`
    <section class="grid">
      <div class="card">
        <div class="row" style="justify-content: space-between;">
          <div>
            <div class="card-title">Snapshots</div>
            <div class="card-sub">Status, health, and heartbeat data.</div>
          </div>
          <button class="btn" ?disabled=${a.loading} @click=${a.onRefresh}>
            ${a.loading?"Refreshing…":"Refresh"}
          </button>
        </div>
        <div class="stack" style="margin-top: 12px;">
          <div>
            <div class="muted">Status</div>
            ${s?e`<div class="callout ${n}" style="margin-top: 8px;">
                  Security audit: ${o}${c>0?` · ${c} info`:""}. Run
                  <span class="mono">openclaw security audit --deep</span> for details.
                </div>`:l}
            <pre class="code-block">${JSON.stringify(a.status??{},null,2)}</pre>
          </div>
          <div>
            <div class="muted">Health</div>
            <pre class="code-block">${JSON.stringify(a.health??{},null,2)}</pre>
          </div>
          <div>
            <div class="muted">Last heartbeat</div>
            <pre class="code-block">${JSON.stringify(a.heartbeat??{},null,2)}</pre>
          </div>
        </div>
      </div>

      <div class="card">
        <div class="card-title">Manual RPC</div>
        <div class="card-sub">Send a raw gateway method with JSON params.</div>
        <div class="stack" style="margin-top: 16px;">
          <label class="field">
            <span>Method</span>
            <select
              .value=${a.callMethod}
              @change=${t=>a.onCallMethodChange(t.target.value)}
            >
              ${a.callMethod?l:e`
                      <option value="" disabled>Select a method…</option>
                    `}
              ${a.methods.map(t=>e`<option value=${t}>${t}</option>`)}
            </select>
          </label>
          <label class="field">
            <span>Params (JSON)</span>
            <textarea
              .value=${a.callParams}
              @input=${t=>a.onCallParamsChange(t.target.value)}
              rows="6"
            ></textarea>
          </label>
        </div>
        <div class="row" style="margin-top: 12px;">
          <button class="btn primary" @click=${a.onCall}>Call</button>
        </div>
        ${a.callError?e`<div class="callout danger" style="margin-top: 12px;">
              ${a.callError}
            </div>`:l}
        ${a.callResult?e`<pre class="code-block" style="margin-top: 12px;">${a.callResult}</pre>`:l}
      </div>
    </section>

    <section class="card" style="margin-top: 18px;">
      <div class="card-title">Models</div>
      <div class="card-sub">Catalog from models.list.</div>
      <pre class="code-block" style="margin-top: 12px;">${JSON.stringify(a.models??[],null,2)}</pre>
    </section>

    <section class="card" style="margin-top: 18px;">
      <div class="card-title">Event Log</div>
      <div class="card-sub">Latest gateway events.</div>
      ${a.eventLog.length===0?e`
              <div class="muted" style="margin-top: 12px">No events yet.</div>
            `:e`
            <div class="list debug-event-log" style="margin-top: 12px;">
              ${a.eventLog.map(t=>e`
                  <div class="list-item debug-event-log__item">
                    <div class="list-main">
                      <div class="list-title">${t.event}</div>
                      <div class="list-sub">${new Date(t.ts).toLocaleTimeString()}</div>
                    </div>
                    <div class="list-meta debug-event-log__meta">
                      <pre class="code-block debug-event-log__payload">${r(t.payload)}</pre>
                    </div>
                  </div>
                `)}
            </div>
          `}
    </section>
  `}export{g as renderDebug};
//# sourceMappingURL=debug-Cu_FU54p.js.map
