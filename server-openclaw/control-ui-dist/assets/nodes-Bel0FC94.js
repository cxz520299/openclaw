import{d as a,A as v,f as y,L as w,M as $}from"./index-CenotFkT.js";function k(e){const s=e?.agents??{},l=Array.isArray(s.list)?s.list:[],t=[];return l.forEach((i,o)=>{if(!i||typeof i!="object")return;const n=i,d=typeof n.id=="string"?n.id.trim():"";if(!d)return;const u=typeof n.name=="string"?n.name.trim():void 0,r=n.default===!0;t.push({id:d,name:u||void 0,isDefault:r,index:o,record:n})}),t}function S(e,s){const l=new Set(s),t=[];for(const i of e){if(!(Array.isArray(i.commands)?i.commands:[]).some(r=>l.has(String(r))))continue;const d=typeof i.nodeId=="string"?i.nodeId.trim():"";if(!d)continue;const u=typeof i.displayName=="string"&&i.displayName.trim()?i.displayName.trim():d;t.push({id:d,label:u===d?d:`${u} · ${d}`})}return t.sort((i,o)=>i.label.localeCompare(o.label)),t}const g="__defaults__",_=[{value:"deny",label:"Deny"},{value:"allowlist",label:"Allowlist"},{value:"full",label:"Full"}],D=[{value:"off",label:"Off"},{value:"on-miss",label:"On miss"},{value:"always",label:"Always"}];function h(e){return e==="allowlist"||e==="full"||e==="deny"?e:"deny"}function N(e){return e==="always"||e==="off"||e==="on-miss"?e:"on-miss"}function E(e){const s=e?.defaults??{};return{security:h(s.security),ask:N(s.ask),askFallback:h(s.askFallback??"deny"),autoAllowSkills:!!(s.autoAllowSkills??!1)}}function L(e){return k(e).map(s=>({id:s.id,name:s.name,isDefault:s.isDefault}))}function I(e,s){const l=L(e),t=Object.keys(s?.agents??{}),i=new Map;l.forEach(n=>i.set(n.id,n)),t.forEach(n=>{i.has(n)||i.set(n,{id:n})});const o=Array.from(i.values());return o.length===0&&o.push({id:"main",isDefault:!0}),o.sort((n,d)=>{if(n.isDefault&&!d.isDefault)return-1;if(!n.isDefault&&d.isDefault)return 1;const u=n.name?.trim()?n.name:n.id,r=d.name?.trim()?d.name:d.id;return u.localeCompare(r)}),o}function P(e,s){return e===g?g:e&&s.some(l=>l.id===e)?e:g}function R(e){const s=e.execApprovalsForm??e.execApprovalsSnapshot?.file??null,l=!!s,t=E(s),i=I(e.configForm,s),o=M(e.nodes),n=e.execApprovalsTarget;let d=n==="node"&&e.execApprovalsTargetNodeId?e.execApprovalsTargetNodeId:null;n==="node"&&d&&!o.some(f=>f.id===d)&&(d=null);const u=P(e.execApprovalsSelectedAgent,i),r=u!==g?(s?.agents??{})[u]??null:null,m=Array.isArray(r?.allowlist)?r.allowlist??[]:[];return{ready:l,disabled:e.execApprovalsSaving||e.execApprovalsLoading,dirty:e.execApprovalsDirty,loading:e.execApprovalsLoading,saving:e.execApprovalsSaving,form:s,defaults:t,selectedScope:u,selectedAgent:r,agents:i,allowlist:m,target:n,targetNodeId:d,targetNodes:o,onSelectScope:e.onExecApprovalsSelectAgent,onSelectTarget:e.onExecApprovalsTargetChange,onPatch:e.onExecApprovalsPatch,onRemove:e.onExecApprovalsRemove,onLoad:e.onLoadExecApprovals,onSave:e.onSaveExecApprovals}}function B(e){const s=e.ready,l=e.target!=="node"||!!e.targetNodeId;return a`
    <section class="card">
      <div class="row" style="justify-content: space-between; align-items: center;">
        <div>
          <div class="card-title">Exec approvals</div>
          <div class="card-sub">
            Allowlist and approval policy for <span class="mono">exec host=gateway/node</span>.
          </div>
        </div>
        <button
          class="btn"
          ?disabled=${e.disabled||!e.dirty||!l}
          @click=${e.onSave}
        >
          ${e.saving?"Saving…":"Save"}
        </button>
      </div>

      ${T(e)}

      ${s?a`
            ${F(e)}
            ${C(e)}
            ${e.selectedScope===g?v:U(e)}
          `:a`<div class="row" style="margin-top: 12px; gap: 12px;">
            <div class="muted">Load exec approvals to edit allowlists.</div>
            <button class="btn" ?disabled=${e.loading||!l} @click=${e.onLoad}>
              ${e.loading?"Loading…":"Load approvals"}
            </button>
          </div>`}
    </section>
  `}function T(e){const s=e.targetNodes.length>0,l=e.targetNodeId??"";return a`
    <div class="list" style="margin-top: 12px;">
      <div class="list-item">
        <div class="list-main">
          <div class="list-title">Target</div>
          <div class="list-sub">
            Gateway edits local approvals; node edits the selected node.
          </div>
        </div>
        <div class="list-meta">
          <label class="field">
            <span>Host</span>
            <select
              ?disabled=${e.disabled}
              @change=${t=>{if(t.target.value==="node"){const n=e.targetNodes[0]?.id??null;e.onSelectTarget("node",l||n)}else e.onSelectTarget("gateway",null)}}
            >
              <option value="gateway" ?selected=${e.target==="gateway"}>Gateway</option>
              <option value="node" ?selected=${e.target==="node"}>Node</option>
            </select>
          </label>
          ${e.target==="node"?a`
                <label class="field">
                  <span>Node</span>
                  <select
                    ?disabled=${e.disabled||!s}
                    @change=${t=>{const o=t.target.value.trim();e.onSelectTarget("node",o||null)}}
                  >
                    <option value="" ?selected=${l===""}>Select node</option>
                    ${e.targetNodes.map(t=>a`<option
                          value=${t.id}
                          ?selected=${l===t.id}
                        >
                          ${t.label}
                        </option>`)}
                  </select>
                </label>
              `:v}
        </div>
      </div>
      ${e.target==="node"&&!s?a`
              <div class="muted">No nodes advertise exec approvals yet.</div>
            `:v}
    </div>
  `}function F(e){return a`
    <div class="row" style="margin-top: 12px; gap: 8px; flex-wrap: wrap;">
      <span class="label">Scope</span>
      <div class="row" style="gap: 8px; flex-wrap: wrap;">
        <button
          class="btn btn--sm ${e.selectedScope===g?"active":""}"
          @click=${()=>e.onSelectScope(g)}
        >
          Defaults
        </button>
        ${e.agents.map(s=>{const l=s.name?.trim()?`${s.name} (${s.id})`:s.id;return a`
            <button
              class="btn btn--sm ${e.selectedScope===s.id?"active":""}"
              @click=${()=>e.onSelectScope(s.id)}
            >
              ${l}
            </button>
          `})}
      </div>
    </div>
  `}function C(e){const s=e.selectedScope===g,l=e.defaults,t=e.selectedAgent??{},i=s?["defaults"]:["agents",e.selectedScope],o=typeof t.security=="string"?t.security:void 0,n=typeof t.ask=="string"?t.ask:void 0,d=typeof t.askFallback=="string"?t.askFallback:void 0,u=s?l.security:o??"__default__",r=s?l.ask:n??"__default__",m=s?l.askFallback:d??"__default__",f=typeof t.autoAllowSkills=="boolean"?t.autoAllowSkills:void 0,A=f??l.autoAllowSkills,x=f==null;return a`
    <div class="list" style="margin-top: 16px;">
      <div class="list-item">
        <div class="list-main">
          <div class="list-title">Security</div>
          <div class="list-sub">
            ${s?"Default security mode.":`Default: ${l.security}.`}
          </div>
        </div>
        <div class="list-meta">
          <label class="field">
            <span>Mode</span>
            <select
              ?disabled=${e.disabled}
              @change=${c=>{const p=c.target.value;!s&&p==="__default__"?e.onRemove([...i,"security"]):e.onPatch([...i,"security"],p)}}
            >
              ${s?v:a`<option value="__default__" ?selected=${u==="__default__"}>
                    Use default (${l.security})
                  </option>`}
              ${_.map(c=>a`<option
                    value=${c.value}
                    ?selected=${u===c.value}
                  >
                    ${c.label}
                  </option>`)}
            </select>
          </label>
        </div>
      </div>

      <div class="list-item">
        <div class="list-main">
          <div class="list-title">Ask</div>
          <div class="list-sub">
            ${s?"Default prompt policy.":`Default: ${l.ask}.`}
          </div>
        </div>
        <div class="list-meta">
          <label class="field">
            <span>Mode</span>
            <select
              ?disabled=${e.disabled}
              @change=${c=>{const p=c.target.value;!s&&p==="__default__"?e.onRemove([...i,"ask"]):e.onPatch([...i,"ask"],p)}}
            >
              ${s?v:a`<option value="__default__" ?selected=${r==="__default__"}>
                    Use default (${l.ask})
                  </option>`}
              ${D.map(c=>a`<option
                    value=${c.value}
                    ?selected=${r===c.value}
                  >
                    ${c.label}
                  </option>`)}
            </select>
          </label>
        </div>
      </div>

      <div class="list-item">
        <div class="list-main">
          <div class="list-title">Ask fallback</div>
          <div class="list-sub">
            ${s?"Applied when the UI prompt is unavailable.":`Default: ${l.askFallback}.`}
          </div>
        </div>
        <div class="list-meta">
          <label class="field">
            <span>Fallback</span>
            <select
              ?disabled=${e.disabled}
              @change=${c=>{const p=c.target.value;!s&&p==="__default__"?e.onRemove([...i,"askFallback"]):e.onPatch([...i,"askFallback"],p)}}
            >
              ${s?v:a`<option value="__default__" ?selected=${m==="__default__"}>
                    Use default (${l.askFallback})
                  </option>`}
              ${_.map(c=>a`<option
                    value=${c.value}
                    ?selected=${m===c.value}
                  >
                    ${c.label}
                  </option>`)}
            </select>
          </label>
        </div>
      </div>

      <div class="list-item">
        <div class="list-main">
          <div class="list-title">Auto-allow skill CLIs</div>
          <div class="list-sub">
            ${s?"Allow skill executables listed by the Gateway.":x?`Using default (${l.autoAllowSkills?"on":"off"}).`:`Override (${A?"on":"off"}).`}
          </div>
        </div>
        <div class="list-meta">
          <label class="field">
            <span>Enabled</span>
            <input
              type="checkbox"
              ?disabled=${e.disabled}
              .checked=${A}
              @change=${c=>{const b=c.target;e.onPatch([...i,"autoAllowSkills"],b.checked)}}
            />
          </label>
          ${!s&&!x?a`<button
                class="btn btn--sm"
                ?disabled=${e.disabled}
                @click=${()=>e.onRemove([...i,"autoAllowSkills"])}
              >
                Use default
              </button>`:v}
        </div>
      </div>
    </div>
  `}function U(e){const s=["agents",e.selectedScope,"allowlist"],l=e.allowlist;return a`
    <div class="row" style="margin-top: 18px; justify-content: space-between;">
      <div>
        <div class="card-title">Allowlist</div>
        <div class="card-sub">Case-insensitive glob patterns.</div>
      </div>
      <button
        class="btn btn--sm"
        ?disabled=${e.disabled}
        @click=${()=>{const t=[...l,{pattern:""}];e.onPatch(s,t)}}
      >
        Add pattern
      </button>
    </div>
    <div class="list" style="margin-top: 12px;">
      ${l.length===0?a`
              <div class="muted">No allowlist entries yet.</div>
            `:l.map((t,i)=>j(e,t,i))}
    </div>
  `}function j(e,s,l){const t=s.lastUsedAt?y(s.lastUsedAt):"never",i=s.lastUsedCommand?w(s.lastUsedCommand,120):null,o=s.lastResolvedPath?w(s.lastResolvedPath,120):null;return a`
    <div class="list-item">
      <div class="list-main">
        <div class="list-title">${s.pattern?.trim()?s.pattern:"New pattern"}</div>
        <div class="list-sub">Last used: ${t}</div>
        ${i?a`<div class="list-sub mono">${i}</div>`:v}
        ${o?a`<div class="list-sub mono">${o}</div>`:v}
      </div>
      <div class="list-meta">
        <label class="field">
          <span>Pattern</span>
          <input
            type="text"
            .value=${s.pattern??""}
            ?disabled=${e.disabled}
            @input=${n=>{const d=n.target;e.onPatch(["agents",e.selectedScope,"allowlist",l,"pattern"],d.value)}}
          />
        </label>
        <button
          class="btn btn--sm danger"
          ?disabled=${e.disabled}
          @click=${()=>{if(e.allowlist.length<=1){e.onRemove(["agents",e.selectedScope,"allowlist"]);return}e.onRemove(["agents",e.selectedScope,"allowlist",l])}}
        >
          Remove
        </button>
      </div>
    </div>
  `}function M(e){return S(e,["system.execApprovals.get","system.execApprovals.set"])}function Z(e){const s=H(e),l=R(e);return a`
    ${B(l)}
    ${K(s)}
    ${O(e)}
    <section class="card">
      <div class="row" style="justify-content: space-between;">
        <div>
          <div class="card-title">Nodes</div>
          <div class="card-sub">Paired devices and live links.</div>
        </div>
        <button class="btn" ?disabled=${e.loading} @click=${e.onRefresh}>
          ${e.loading?"Loading…":"Refresh"}
        </button>
      </div>
      <div class="list" style="margin-top: 16px;">
        ${e.nodes.length===0?a`
                <div class="muted">No nodes found.</div>
              `:e.nodes.map(t=>Q(t))}
      </div>
    </section>
  `}function O(e){const s=e.devicesList??{pending:[],paired:[]},l=Array.isArray(s.pending)?s.pending:[],t=Array.isArray(s.paired)?s.paired:[];return a`
    <section class="card">
      <div class="row" style="justify-content: space-between;">
        <div>
          <div class="card-title">Devices</div>
          <div class="card-sub">Pairing requests + role tokens.</div>
        </div>
        <button class="btn" ?disabled=${e.devicesLoading} @click=${e.onDevicesRefresh}>
          ${e.devicesLoading?"Loading…":"Refresh"}
        </button>
      </div>
      ${e.devicesError?a`<div class="callout danger" style="margin-top: 12px;">${e.devicesError}</div>`:v}
      <div class="list" style="margin-top: 16px;">
        ${l.length>0?a`
              <div class="muted" style="margin-bottom: 8px;">Pending</div>
              ${l.map(i=>V(i,e))}
            `:v}
        ${t.length>0?a`
              <div class="muted" style="margin-top: 12px; margin-bottom: 8px;">Paired</div>
              ${t.map(i=>G(i,e))}
            `:v}
        ${l.length===0&&t.length===0?a`
                <div class="muted">No paired devices.</div>
              `:v}
      </div>
    </section>
  `}function V(e,s){const l=e.displayName?.trim()||e.deviceId,t=typeof e.ts=="number"?y(e.ts):"n/a",i=e.role?.trim()?`role: ${e.role}`:"role: -",o=e.isRepair?" · repair":"",n=e.remoteIp?` · ${e.remoteIp}`:"";return a`
    <div class="list-item">
      <div class="list-main">
        <div class="list-title">${l}</div>
        <div class="list-sub">${e.deviceId}${n}</div>
        <div class="muted" style="margin-top: 6px;">
          ${i} · requested ${t}${o}
        </div>
      </div>
      <div class="list-meta">
        <div class="row" style="justify-content: flex-end; gap: 8px; flex-wrap: wrap;">
          <button class="btn btn--sm primary" @click=${()=>s.onDeviceApprove(e.requestId)}>
            Approve
          </button>
          <button class="btn btn--sm" @click=${()=>s.onDeviceReject(e.requestId)}>
            Reject
          </button>
        </div>
      </div>
    </div>
  `}function G(e,s){const l=e.displayName?.trim()||e.deviceId,t=e.remoteIp?` · ${e.remoteIp}`:"",i=`roles: ${$(e.roles)}`,o=`scopes: ${$(e.scopes)}`,n=Array.isArray(e.tokens)?e.tokens:[];return a`
    <div class="list-item">
      <div class="list-main">
        <div class="list-title">${l}</div>
        <div class="list-sub">${e.deviceId}${t}</div>
        <div class="muted" style="margin-top: 6px;">${i} · ${o}</div>
        ${n.length===0?a`
                <div class="muted" style="margin-top: 6px">Tokens: none</div>
              `:a`
              <div class="muted" style="margin-top: 10px;">Tokens</div>
              <div style="display: flex; flex-direction: column; gap: 8px; margin-top: 6px;">
                ${n.map(d=>z(e.deviceId,d,s))}
              </div>
            `}
      </div>
    </div>
  `}function z(e,s,l){const t=s.revokedAtMs?"revoked":"active",i=`scopes: ${$(s.scopes)}`,o=y(s.rotatedAtMs??s.createdAtMs??s.lastUsedAtMs??null);return a`
    <div class="row" style="justify-content: space-between; gap: 8px;">
      <div class="list-sub">${s.role} · ${t} · ${i} · ${o}</div>
      <div class="row" style="justify-content: flex-end; gap: 6px; flex-wrap: wrap;">
        <button
          class="btn btn--sm"
          @click=${()=>l.onDeviceRotate(e,s.role,s.scopes)}
        >
          Rotate
        </button>
        ${s.revokedAtMs?v:a`
              <button
                class="btn btn--sm danger"
                @click=${()=>l.onDeviceRevoke(e,s.role)}
              >
                Revoke
              </button>
            `}
      </div>
    </div>
  `}function H(e){const s=e.configForm,l=Y(e.nodes),{defaultBinding:t,agents:i}=J(s),o=!!s,n=e.configSaving||e.configFormMode==="raw";return{ready:o,disabled:n,configDirty:e.configDirty,configLoading:e.configLoading,configSaving:e.configSaving,defaultBinding:t,agents:i,nodes:l,onBindDefault:e.onBindDefault,onBindAgent:e.onBindAgent,onSave:e.onSaveBindings,onLoadConfig:e.onLoadConfig,formMode:e.configFormMode}}function K(e){const s=e.nodes.length>0,l=e.defaultBinding??"";return a`
    <section class="card">
      <div class="row" style="justify-content: space-between; align-items: center;">
        <div>
          <div class="card-title">Exec node binding</div>
          <div class="card-sub">
            Pin agents to a specific node when using <span class="mono">exec host=node</span>.
          </div>
        </div>
        <button
          class="btn"
          ?disabled=${e.disabled||!e.configDirty}
          @click=${e.onSave}
        >
          ${e.configSaving?"Saving…":"Save"}
        </button>
      </div>

      ${e.formMode==="raw"?a`
              <div class="callout warn" style="margin-top: 12px">
                Switch the Config tab to <strong>Form</strong> mode to edit bindings here.
              </div>
            `:v}

      ${e.ready?a`
            <div class="list" style="margin-top: 16px;">
              <div class="list-item">
                <div class="list-main">
                  <div class="list-title">Default binding</div>
                  <div class="list-sub">Used when agents do not override a node binding.</div>
                </div>
                <div class="list-meta">
                  <label class="field">
                    <span>Node</span>
                    <select
                      ?disabled=${e.disabled||!s}
                      @change=${t=>{const o=t.target.value.trim();e.onBindDefault(o||null)}}
                    >
                      <option value="" ?selected=${l===""}>Any node</option>
                      ${e.nodes.map(t=>a`<option
                            value=${t.id}
                            ?selected=${l===t.id}
                          >
                            ${t.label}
                          </option>`)}
                    </select>
                  </label>
                  ${s?v:a`
                          <div class="muted">No nodes with system.run available.</div>
                        `}
                </div>
              </div>

              ${e.agents.length===0?a`
                      <div class="muted">No agents found.</div>
                    `:e.agents.map(t=>X(t,e))}
            </div>
          `:a`<div class="row" style="margin-top: 12px; gap: 12px;">
            <div class="muted">Load config to edit bindings.</div>
            <button class="btn" ?disabled=${e.configLoading} @click=${e.onLoadConfig}>
              ${e.configLoading?"Loading…":"Load config"}
            </button>
          </div>`}
    </section>
  `}function X(e,s){const l=e.binding??"__default__",t=e.name?.trim()?`${e.name} (${e.id})`:e.id,i=s.nodes.length>0;return a`
    <div class="list-item">
      <div class="list-main">
        <div class="list-title">${t}</div>
        <div class="list-sub">
          ${e.isDefault?"default agent":"agent"} ·
          ${l==="__default__"?`uses default (${s.defaultBinding??"any"})`:`override: ${e.binding}`}
        </div>
      </div>
      <div class="list-meta">
        <label class="field">
          <span>Binding</span>
          <select
            ?disabled=${s.disabled||!i}
            @change=${o=>{const d=o.target.value.trim();s.onBindAgent(e.index,d==="__default__"?null:d)}}
          >
            <option value="__default__" ?selected=${l==="__default__"}>
              Use default
            </option>
            ${s.nodes.map(o=>a`<option
                  value=${o.id}
                  ?selected=${l===o.id}
                >
                  ${o.label}
                </option>`)}
          </select>
        </label>
      </div>
    </div>
  `}function Y(e){return S(e,["system.run"])}function J(e){const s={id:"main",name:void 0,index:0,isDefault:!0,binding:null};if(!e||typeof e!="object")return{defaultBinding:null,agents:[s]};const t=(e.tools??{}).exec??{},i=typeof t.node=="string"&&t.node.trim()?t.node.trim():null,o=e.agents??{};if(!Array.isArray(o.list)||o.list.length===0)return{defaultBinding:i,agents:[s]};const n=k(e).map(d=>{const r=(d.record.tools??{}).exec??{},m=typeof r.node=="string"&&r.node.trim()?r.node.trim():null;return{id:d.id,name:d.name,index:d.index,isDefault:d.isDefault,binding:m}});return n.length===0&&n.push(s),{defaultBinding:i,agents:n}}function Q(e){const s=!!e.connected,l=!!e.paired,t=typeof e.displayName=="string"&&e.displayName.trim()||(typeof e.nodeId=="string"?e.nodeId:"unknown"),i=Array.isArray(e.caps)?e.caps:[],o=Array.isArray(e.commands)?e.commands:[];return a`
    <div class="list-item">
      <div class="list-main">
        <div class="list-title">${t}</div>
        <div class="list-sub">
          ${typeof e.nodeId=="string"?e.nodeId:""}
          ${typeof e.remoteIp=="string"?` · ${e.remoteIp}`:""}
          ${typeof e.version=="string"?` · ${e.version}`:""}
        </div>
        <div class="chip-row" style="margin-top: 6px;">
          <span class="chip">${l?"paired":"unpaired"}</span>
          <span class="chip ${s?"chip-ok":"chip-warn"}">
            ${s?"connected":"offline"}
          </span>
          ${i.slice(0,12).map(n=>a`<span class="chip">${String(n)}</span>`)}
          ${o.slice(0,8).map(n=>a`<span class="chip">${String(n)}</span>`)}
        </div>
      </div>
    </div>
  `}export{Z as renderNodes};
//# sourceMappingURL=nodes-Bel0FC94.js.map
