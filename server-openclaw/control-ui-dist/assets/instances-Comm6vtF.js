import{i as v,A as e,d as a,K as h}from"./index-CenotFkT.js";let n=!1;function g(s){const i=!n;return a`
    <section class="card">
      <div class="row" style="justify-content: space-between;">
        <div>
          <div class="card-title">Connected Instances</div>
          <div class="card-sub">Presence beacons from the gateway and clients.</div>
        </div>
        <div class="row" style="gap: 8px;">
          <button
            class="btn btn--icon ${i?"":"active"}"
            @click=${()=>{n=!n,s.onRefresh()}}
            title=${i?"Show hosts and IPs":"Hide hosts and IPs"}
            aria-label="Toggle host visibility"
            aria-pressed=${!i}
            style="width: 36px; height: 36px;"
          >
            ${i?v.eyeOff:v.eye}
          </button>
          <button class="btn" ?disabled=${s.loading} @click=${s.onRefresh}>
            ${s.loading?"Loading…":"Refresh"}
          </button>
        </div>
      </div>
      ${s.lastError?a`<div class="callout danger" style="margin-top: 12px;">
            ${s.lastError}
          </div>`:e}
      ${s.statusMessage?a`<div class="callout" style="margin-top: 12px;">
            ${s.statusMessage}
          </div>`:e}
      <div class="list" style="margin-top: 16px;">
        ${s.entries.length===0?a`
                <div class="muted">No instances reported yet.</div>
              `:s.entries.map(l=>u(l,i))}
      </div>
    </section>
  `}function u(s,i){const l=s.lastInputSeconds!=null?`${s.lastInputSeconds}s ago`:"n/a",c=s.mode??"unknown",p=s.host??"unknown host",d=s.ip??null,$=Array.isArray(s.roles)?s.roles.filter(Boolean):[],t=Array.isArray(s.scopes)?s.scopes.filter(Boolean):[],o=t.length>0?t.length>3?`${t.length} scopes`:`scopes: ${t.join(", ")}`:null;return a`
    <div class="list-item">
      <div class="list-main">
        <div class="list-title">
          <span class="${i?"redacted":""}">${p}</span>
        </div>
        <div class="list-sub">
          ${d?a`<span class="${i?"redacted":""}">${d}</span> `:e}${c} ${s.version??""}
        </div>
        <div class="chip-row">
          <span class="chip">${c}</span>
          ${$.map(r=>a`<span class="chip">${r}</span>`)}
          ${o?a`<span class="chip">${o}</span>`:e}
          ${s.platform?a`<span class="chip">${s.platform}</span>`:e}
          ${s.deviceFamily?a`<span class="chip">${s.deviceFamily}</span>`:e}
          ${s.modelIdentifier?a`<span class="chip">${s.modelIdentifier}</span>`:e}
          ${s.version?a`<span class="chip">${s.version}</span>`:e}
        </div>
      </div>
      <div class="list-meta">
        <div>${h(s)}</div>
        <div class="muted">Last input ${l}</div>
        <div class="muted">Reason ${s.reason??""}</div>
      </div>
    </div>
  `}export{g as renderInstances};
//# sourceMappingURL=instances-Comm6vtF.js.map
