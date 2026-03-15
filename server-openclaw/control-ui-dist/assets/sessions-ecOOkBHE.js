import{A as v,d,i as S,f as R,H as U,N as w}from"./index-CenotFkT.js";const A=["","off","minimal","low","medium","high","xhigh"],G=["","off","on"],O=[{value:"",label:"inherit"},{value:"off",label:"off (explicit)"},{value:"on",label:"on"},{value:"full",label:"full"}],P=[{value:"",label:"inherit"},{value:"on",label:"on"},{value:"off",label:"off"}],D=["","off","on","stream"],F=[10,25,50,100];function V(e){if(!e)return"";const a=e.trim().toLowerCase();return a==="z.ai"||a==="z-ai"?"zai":a}function z(e){return V(e)==="zai"}function I(e){return z(e)?G:A}function L(e,a){return a?e.includes(a)?[...e]:[...e,a]:[...e]}function C(e,a){return a?e.some(l=>l.value===a)?[...e]:[...e,{value:a,label:`${a} (custom)`}]:[...e]}function K(e,a){return!a||!e||e==="off"?e:"on"}function B(e,a){return e?a&&e==="on"?"low":e:null}function H(e,a){const l=a.trim().toLowerCase();return l?e.filter(o=>{const s=(o.key??"").toLowerCase(),c=(o.label??"").toLowerCase(),i=(o.kind??"").toLowerCase(),r=(o.displayName??"").toLowerCase();return s.includes(l)||c.includes(l)||i.includes(l)||r.includes(l)}):e}function Q(e,a,l){const o=l==="asc"?1:-1;return[...e].toSorted((s,c)=>{let i=0;switch(a){case"key":i=(s.key??"").localeCompare(c.key??"");break;case"kind":i=(s.kind??"").localeCompare(c.kind??"");break;case"updated":{const r=s.updatedAt??0,u=c.updatedAt??0;i=r-u;break}case"tokens":{const r=s.totalTokens??s.inputTokens??s.outputTokens??0,u=c.totalTokens??c.inputTokens??c.outputTokens??0;i=r-u;break}}return i*o})}function j(e,a,l){const o=a*l;return e.slice(o,o+l)}function Z(e){const a=e.result?.sessions??[],l=H(a,e.searchQuery),o=Q(l,e.sortColumn,e.sortDir),s=o.length,c=Math.max(1,Math.ceil(s/e.pageSize)),i=Math.min(e.page,c-1),r=j(o,i,e.pageSize),u=(n,h)=>{const g=e.sortColumn===n,k=g&&e.sortDir==="asc"?"desc":"asc";return d`
      <th
        data-sortable
        data-sort-dir=${g?e.sortDir:""}
        @click=${()=>e.onSortChange(n,g?k:"desc")}
      >
        ${h}
        <span class="data-table-sort-icon">${S.arrowUpDown}</span>
      </th>
    `};return d`
    ${e.actionsOpenKey?d`
            <div
              class="data-table-overlay"
              @click=${()=>e.onActionsOpenChange(null)}
              aria-hidden="true"
            ></div>
          `:v}
    <section class="card" style=${e.actionsOpenKey?"position: relative; z-index: 41;":""}>
      <div class="row" style="justify-content: space-between; margin-bottom: 12px;">
        <div>
          <div class="card-title">Sessions</div>
          <div class="card-sub">${e.result?`Store: ${e.result.path}`:"Active session keys and per-session overrides."}</div>
        </div>
        <button class="btn" ?disabled=${e.loading} @click=${e.onRefresh}>
          ${e.loading?"Loading…":"Refresh"}
        </button>
      </div>

      <div class="filters" style="margin-bottom: 12px;">
        <label class="field-inline">
          <span>Active</span>
          <input
            style="width: 72px;"
            placeholder="min"
            .value=${e.activeMinutes}
            @input=${n=>e.onFiltersChange({activeMinutes:n.target.value,limit:e.limit,includeGlobal:e.includeGlobal,includeUnknown:e.includeUnknown})}
          />
        </label>
        <label class="field-inline">
          <span>Limit</span>
          <input
            style="width: 64px;"
            .value=${e.limit}
            @input=${n=>e.onFiltersChange({activeMinutes:e.activeMinutes,limit:n.target.value,includeGlobal:e.includeGlobal,includeUnknown:e.includeUnknown})}
          />
        </label>
        <label class="field-inline checkbox">
          <input
            type="checkbox"
            .checked=${e.includeGlobal}
            @change=${n=>e.onFiltersChange({activeMinutes:e.activeMinutes,limit:e.limit,includeGlobal:n.target.checked,includeUnknown:e.includeUnknown})}
          />
          <span>Global</span>
        </label>
        <label class="field-inline checkbox">
          <input
            type="checkbox"
            .checked=${e.includeUnknown}
            @change=${n=>e.onFiltersChange({activeMinutes:e.activeMinutes,limit:e.limit,includeGlobal:e.includeGlobal,includeUnknown:n.target.checked})}
          />
          <span>Unknown</span>
        </label>
      </div>

      ${e.error?d`<div class="callout danger" style="margin-bottom: 12px;">${e.error}</div>`:v}

      <div class="data-table-wrapper">
        <div class="data-table-toolbar">
          <div class="data-table-search">
            <input
              type="text"
              placeholder="Filter by key, label, kind…"
              .value=${e.searchQuery}
              @input=${n=>e.onSearchChange(n.target.value)}
            />
          </div>
        </div>

        <div class="data-table-container">
          <table class="data-table">
            <thead>
              <tr>
                ${u("key","Key")}
                <th>Label</th>
                ${u("kind","Kind")}
                ${u("updated","Updated")}
                ${u("tokens","Tokens")}
                <th>Thinking</th>
                <th>Fast</th>
                <th>Verbose</th>
                <th>Reasoning</th>
                <th style="width: 60px;"></th>
              </tr>
            </thead>
            <tbody>
              ${r.length===0?d`
                      <tr>
                        <td colspan="10" style="text-align: center; padding: 48px 16px; color: var(--muted)">
                          No sessions found.
                        </td>
                      </tr>
                    `:r.map(n=>q(n,e.basePath,e.onPatch,e.onDelete,e.onActionsOpenChange,e.actionsOpenKey,e.loading))}
            </tbody>
          </table>
        </div>

        ${s>0?d`
                <div class="data-table-pagination">
                  <div class="data-table-pagination__info">
                    ${i*e.pageSize+1}-${Math.min((i+1)*e.pageSize,s)}
                    of ${s} row${s===1?"":"s"}
                  </div>
                  <div class="data-table-pagination__controls">
                    <select
                      style="height: 32px; padding: 0 8px; font-size: 13px; border-radius: var(--radius-md); border: 1px solid var(--border); background: var(--card);"
                      .value=${String(e.pageSize)}
                      @change=${n=>e.onPageSizeChange(Number(n.target.value))}
                    >
                      ${F.map(n=>d`<option value=${n}>${n} per page</option>`)}
                    </select>
                    <button
                      ?disabled=${i<=0}
                      @click=${()=>e.onPageChange(i-1)}
                    >
                      Previous
                    </button>
                    <button
                      ?disabled=${i>=c-1}
                      @click=${()=>e.onPageChange(i+1)}
                    >
                      Next
                    </button>
                  </div>
                </div>
              `:v}
      </div>
    </section>
  `}function q(e,a,l,o,s,c,i){const r=e.updatedAt?R(e.updatedAt):"n/a",u=e.thinkingLevel??"",n=z(e.modelProvider),h=K(u,n),g=L(I(e.modelProvider),h),k=e.fastMode===!0?"on":e.fastMode===!1?"off":"",T=C(P,k),m=e.verboseLevel??"",M=C(O,m),y=e.reasoningLevel??"",N=L(D,y),$=typeof e.displayName=="string"&&e.displayName.trim().length>0?e.displayName.trim():null,E=!!($&&$!==e.key&&$!==(typeof e.label=="string"?e.label.trim():"")),f=e.kind!=="global",x=f?`${U("chat",a)}?session=${encodeURIComponent(e.key)}`:null,p=c===e.key,_=e.kind==="direct"?"data-table-badge--direct":e.kind==="group"?"data-table-badge--group":e.kind==="global"?"data-table-badge--global":"data-table-badge--unknown";return d`
    <tr>
      <td>
        <div class="mono session-key-cell">
          ${f?d`<a href=${x} class="session-link">${e.key}</a>`:e.key}
          ${E?d`<span class="muted session-key-display-name">${$}</span>`:v}
        </div>
      </td>
      <td>
        <input
          .value=${e.label??""}
          ?disabled=${i}
          placeholder="(optional)"
          style="width: 100%; max-width: 140px; padding: 6px 10px; font-size: 13px; border: 1px solid var(--border); border-radius: var(--radius-sm);"
          @change=${t=>{const b=t.target.value.trim();l(e.key,{label:b||null})}}
        />
      </td>
      <td>
        <span class="data-table-badge ${_}">${e.kind}</span>
      </td>
      <td>${r}</td>
      <td>${w(e)}</td>
      <td>
        <select
          ?disabled=${i}
          style="padding: 6px 10px; font-size: 13px; border: 1px solid var(--border); border-radius: var(--radius-sm); min-width: 90px;"
          @change=${t=>{const b=t.target.value;l(e.key,{thinkingLevel:B(b,n)})}}
        >
          ${g.map(t=>d`<option value=${t} ?selected=${h===t}>
                ${t||"inherit"}
              </option>`)}
        </select>
      </td>
      <td>
        <select
          ?disabled=${i}
          style="padding: 6px 10px; font-size: 13px; border: 1px solid var(--border); border-radius: var(--radius-sm); min-width: 90px;"
          @change=${t=>{const b=t.target.value;l(e.key,{fastMode:b===""?null:b==="on"})}}
        >
          ${T.map(t=>d`<option value=${t.value} ?selected=${k===t.value}>
                ${t.label}
              </option>`)}
        </select>
      </td>
      <td>
        <select
          ?disabled=${i}
          style="padding: 6px 10px; font-size: 13px; border: 1px solid var(--border); border-radius: var(--radius-sm); min-width: 90px;"
          @change=${t=>{const b=t.target.value;l(e.key,{verboseLevel:b||null})}}
        >
          ${M.map(t=>d`<option value=${t.value} ?selected=${m===t.value}>
                ${t.label}
              </option>`)}
        </select>
      </td>
      <td>
        <select
          ?disabled=${i}
          style="padding: 6px 10px; font-size: 13px; border: 1px solid var(--border); border-radius: var(--radius-sm); min-width: 90px;"
          @change=${t=>{const b=t.target.value;l(e.key,{reasoningLevel:b||null})}}
        >
          ${N.map(t=>d`<option value=${t} ?selected=${y===t}>
                ${t||"inherit"}
              </option>`)}
        </select>
      </td>
      <td>
        <div class="data-table-row-actions">
          <button
            type="button"
            class="data-table-row-actions__trigger"
            aria-label="Open menu"
            @click=${t=>{t.stopPropagation(),s(p?null:e.key)}}
          >
            ${S.moreHorizontal}
          </button>
          ${p?d`
                  <div class="data-table-row-actions__menu">
                    ${f?d`
                            <a
                              href=${x}
                              style="display: block; padding: 8px 12px; font-size: 13px; text-decoration: none; color: var(--text); border-radius: var(--radius-sm);"
                              @click=${()=>s(null)}
                            >
                              Open in Chat
                            </a>
                          `:v}
                    <button
                      type="button"
                      class="danger"
                      @click=${()=>{s(null),o(e.key)}}
                    >
                      Delete
                    </button>
                  </div>
                `:v}
        </div>
      </td>
    </tr>
  `}export{Z as renderSessions};
//# sourceMappingURL=sessions-ecOOkBHE.js.map
