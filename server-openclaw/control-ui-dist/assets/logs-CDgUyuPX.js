import{A as s,d as i}from"./index-CenotFkT.js";const n=["trace","debug","info","warn","error","fatal"];function r(e){if(!e)return"";const t=new Date(e);return Number.isNaN(t.getTime())?e:t.toLocaleTimeString()}function g(e,t){return t?[e.message,e.subsystem,e.raw].filter(Boolean).join(" ").toLowerCase().includes(t):!0}function u(e){const t=e.filterText.trim().toLowerCase(),o=n.some(l=>!e.levelFilters[l]),a=e.entries.filter(l=>l.level&&!e.levelFilters[l.level]?!1:g(l,t)),c=t||o?"filtered":"visible";return i`
    <section class="card">
      <div class="row" style="justify-content: space-between;">
        <div>
          <div class="card-title">Logs</div>
          <div class="card-sub">Gateway file logs (JSONL).</div>
        </div>
        <div class="row" style="gap: 8px;">
          <button class="btn" ?disabled=${e.loading} @click=${e.onRefresh}>
            ${e.loading?"Loading…":"Refresh"}
          </button>
          <button
            class="btn"
            ?disabled=${a.length===0}
            @click=${()=>e.onExport(a.map(l=>l.raw),c)}
          >
            Export ${c}
          </button>
        </div>
      </div>

      <div class="filters" style="margin-top: 14px;">
        <label class="field" style="min-width: 220px;">
          <span>Filter</span>
          <input
            .value=${e.filterText}
            @input=${l=>e.onFilterTextChange(l.target.value)}
            placeholder="Search logs"
          />
        </label>
        <label class="field checkbox">
          <span>Auto-follow</span>
          <input
            type="checkbox"
            .checked=${e.autoFollow}
            @change=${l=>e.onToggleAutoFollow(l.target.checked)}
          />
        </label>
      </div>

      <div class="chip-row" style="margin-top: 12px;">
        ${n.map(l=>i`
            <label class="chip log-chip ${l}">
              <input
                type="checkbox"
                .checked=${e.levelFilters[l]}
                @change=${d=>e.onLevelToggle(l,d.target.checked)}
              />
              <span>${l}</span>
            </label>
          `)}
      </div>

      ${e.file?i`<div class="muted" style="margin-top: 10px;">File: ${e.file}</div>`:s}
      ${e.truncated?i`
              <div class="callout" style="margin-top: 10px">Log output truncated; showing latest chunk.</div>
            `:s}
      ${e.error?i`<div class="callout danger" style="margin-top: 10px;">${e.error}</div>`:s}

      <div class="log-stream" style="margin-top: 12px;" @scroll=${e.onScroll}>
        ${a.length===0?i`
                <div class="muted" style="padding: 12px">No log entries.</div>
              `:a.map(l=>i`
                <div class="log-row">
                  <div class="log-time mono">${r(l.time)}</div>
                  <div class="log-level ${l.level??""}">${l.level??""}</div>
                  <div class="log-subsystem mono">${l.subsystem??""}</div>
                  <div class="log-message mono">${l.message??l.raw}</div>
                </div>
              `)}
      </div>
    </section>
  `}export{u as renderLogs};
//# sourceMappingURL=logs-CDgUyuPX.js.map
