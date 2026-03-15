import{d as t,B as Y,C as M,D as F,A as i,f as c,E as D,F as T}from"./index-CenotFkT.js";import{a as W,f as B}from"./channel-config-extras-BkKp7v9q.js";function O(n,s){let a=n;for(const e of s){if(!a)return null;const l=F(a);if(l==="object"){const o=a.properties??{};if(typeof e=="string"&&o[e]){a=o[e];continue}const d=a.additionalProperties;if(typeof e=="string"&&d&&typeof d=="object"){a=d;continue}return null}if(l==="array"){if(typeof e!="number")return null;a=(Array.isArray(a.items)?a.items[0]:a.items)??null;continue}return null}return a}function H(n,s){return W(n,s)??{}}const K=["groupPolicy","streamMode","dmPolicy"];function U(n){const s=K.flatMap(a=>a in n?[[a,n[a]]]:[]);return s.length===0?null:t`
    <div class="status-list" style="margin-top: 12px;">
      ${s.map(([a,e])=>t`
          <div>
            <span class="label">${a}</span>
            <span>${B(e)}</span>
          </div>
        `)}
    </div>
  `}function V(n){const s=Y(n.schema),a=s.schema;if(!a)return t`
      <div class="callout danger">Schema unavailable. Use Raw.</div>
    `;const e=O(a,["channels",n.channelId]);if(!e)return t`
      <div class="callout danger">Channel config schema unavailable.</div>
    `;const l=n.configValue??{},o=H(l,n.channelId);return t`
    <div class="config-form">
      ${M({schema:e,value:o,path:["channels",n.channelId],hints:n.uiHints,unsupported:new Set(s.unsupportedPaths),disabled:n.disabled,showLabel:!1,onPatch:n.onPatch})}
    </div>
    ${U(o)}
  `}function f(n){const{channelId:s,props:a}=n,e=a.configSaving||a.configSchemaLoading;return t`
    <div style="margin-top: 16px;">
      ${a.configSchemaLoading?t`
              <div class="muted">Loading config schema…</div>
            `:V({channelId:s,configValue:a.configForm,schema:a.configSchema,uiHints:a.configUiHints,disabled:e,onPatch:a.onConfigPatch})}
      <div class="row" style="margin-top: 12px;">
        <button
          class="btn primary"
          ?disabled=${e||!a.configFormDirty}
          @click=${()=>a.onConfigSave()}
        >
          ${a.configSaving?"Saving…":"Save"}
        </button>
        <button
          class="btn"
          ?disabled=${e}
          @click=${()=>a.onConfigReload()}
        >
          Reload
        </button>
      </div>
    </div>
  `}function j(n){const{props:s,discord:a,accountCountLabel:e}=n;return t`
    <div class="card">
      <div class="card-title">Discord</div>
      <div class="card-sub">Bot status and channel configuration.</div>
      ${e}

      <div class="status-list" style="margin-top: 16px;">
        <div>
          <span class="label">Configured</span>
          <span>${a?.configured?"Yes":"No"}</span>
        </div>
        <div>
          <span class="label">Running</span>
          <span>${a?.running?"Yes":"No"}</span>
        </div>
        <div>
          <span class="label">Last start</span>
          <span>${a?.lastStartAt?c(a.lastStartAt):"n/a"}</span>
        </div>
        <div>
          <span class="label">Last probe</span>
          <span>${a?.lastProbeAt?c(a.lastProbeAt):"n/a"}</span>
        </div>
      </div>

      ${a?.lastError?t`<div class="callout danger" style="margin-top: 12px;">
            ${a.lastError}
          </div>`:i}

      ${a?.probe?t`<div class="callout" style="margin-top: 12px;">
            Probe ${a.probe.ok?"ok":"failed"} ·
            ${a.probe.status??""} ${a.probe.error??""}
          </div>`:i}

      ${f({channelId:"discord",props:s})}

      <div class="row" style="margin-top: 12px;">
        <button class="btn" @click=${()=>s.onRefresh(!0)}>
          Probe
        </button>
      </div>
    </div>
  `}function z(n){const{props:s,googleChat:a,accountCountLabel:e}=n;return t`
    <div class="card">
      <div class="card-title">Google Chat</div>
      <div class="card-sub">Chat API webhook status and channel configuration.</div>
      ${e}

      <div class="status-list" style="margin-top: 16px;">
        <div>
          <span class="label">Configured</span>
          <span>${a?a.configured?"Yes":"No":"n/a"}</span>
        </div>
        <div>
          <span class="label">Running</span>
          <span>${a?a.running?"Yes":"No":"n/a"}</span>
        </div>
        <div>
          <span class="label">Credential</span>
          <span>${a?.credentialSource??"n/a"}</span>
        </div>
        <div>
          <span class="label">Audience</span>
          <span>
            ${a?.audienceType?`${a.audienceType}${a.audience?` · ${a.audience}`:""}`:"n/a"}
          </span>
        </div>
        <div>
          <span class="label">Last start</span>
          <span>${a?.lastStartAt?c(a.lastStartAt):"n/a"}</span>
        </div>
        <div>
          <span class="label">Last probe</span>
          <span>${a?.lastProbeAt?c(a.lastProbeAt):"n/a"}</span>
        </div>
      </div>

      ${a?.lastError?t`<div class="callout danger" style="margin-top: 12px;">
            ${a.lastError}
          </div>`:i}

      ${a?.probe?t`<div class="callout" style="margin-top: 12px;">
            Probe ${a.probe.ok?"ok":"failed"} ·
            ${a.probe.status??""} ${a.probe.error??""}
          </div>`:i}

      ${f({channelId:"googlechat",props:s})}

      <div class="row" style="margin-top: 12px;">
        <button class="btn" @click=${()=>s.onRefresh(!0)}>
          Probe
        </button>
      </div>
    </div>
  `}function _(n){const{props:s,imessage:a,accountCountLabel:e}=n;return t`
    <div class="card">
      <div class="card-title">iMessage</div>
      <div class="card-sub">macOS bridge status and channel configuration.</div>
      ${e}

      <div class="status-list" style="margin-top: 16px;">
        <div>
          <span class="label">Configured</span>
          <span>${a?.configured?"Yes":"No"}</span>
        </div>
        <div>
          <span class="label">Running</span>
          <span>${a?.running?"Yes":"No"}</span>
        </div>
        <div>
          <span class="label">Last start</span>
          <span>${a?.lastStartAt?c(a.lastStartAt):"n/a"}</span>
        </div>
        <div>
          <span class="label">Last probe</span>
          <span>${a?.lastProbeAt?c(a.lastProbeAt):"n/a"}</span>
        </div>
      </div>

      ${a?.lastError?t`<div class="callout danger" style="margin-top: 12px;">
            ${a.lastError}
          </div>`:i}

      ${a?.probe?t`<div class="callout" style="margin-top: 12px;">
            Probe ${a.probe.ok?"ok":"failed"} ·
            ${a.probe.error??""}
          </div>`:i}

      ${f({channelId:"imessage",props:s})}

      <div class="row" style="margin-top: 12px;">
        <button class="btn" @click=${()=>s.onRefresh(!0)}>
          Probe
        </button>
      </div>
    </div>
  `}function P(n){return n?n.length<=20?n:`${n.slice(0,8)}...${n.slice(-8)}`:"n/a"}function G(n){const{props:s,nostr:a,nostrAccounts:e,accountCountLabel:l,profileFormState:o,profileFormCallbacks:d,onEditProfile:r}=n,p=e[0],v=a?.configured??p?.configured??!1,b=a?.running??p?.running??!1,h=a?.publicKey??p?.publicKey,g=a?.lastStartAt??p?.lastStartAt??null,$=a?.lastError??p?.lastError??null,w=e.length>1,E=o!=null,L=u=>{const m=u.publicKey,y=u.profile,A=y?.displayName??y?.name??u.name??u.accountId;return t`
      <div class="account-card">
        <div class="account-card-header">
          <div class="account-card-title">${A}</div>
          <div class="account-card-id">${u.accountId}</div>
        </div>
        <div class="status-list account-card-status">
          <div>
            <span class="label">Running</span>
            <span>${u.running?"Yes":"No"}</span>
          </div>
          <div>
            <span class="label">Configured</span>
            <span>${u.configured?"Yes":"No"}</span>
          </div>
          <div>
            <span class="label">Public Key</span>
            <span class="monospace" title="${m??""}">${P(m)}</span>
          </div>
          <div>
            <span class="label">Last inbound</span>
            <span>${u.lastInboundAt?c(u.lastInboundAt):"n/a"}</span>
          </div>
          ${u.lastError?t`
                <div class="account-card-error">${u.lastError}</div>
              `:i}
        </div>
      </div>
    `},I=()=>{if(E&&d)return D({state:o,callbacks:d,accountId:e[0]?.accountId??"default"});const u=p?.profile??a?.profile,{name:m,displayName:y,about:A,picture:C,nip05:x}=u??{},k=m||y||A||C||x;return t`
      <div style="margin-top: 16px; padding: 12px; background: var(--bg-secondary); border-radius: 8px;">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
          <div style="font-weight: 500;">Profile</div>
          ${v?t`
                <button
                  class="btn btn-sm"
                  @click=${r}
                  style="font-size: 12px; padding: 4px 8px;"
                >
                  Edit Profile
                </button>
              `:i}
        </div>
        ${k?t`
              <div class="status-list">
                ${C?t`
                      <div style="margin-bottom: 8px;">
                        <img
                          src=${C}
                          alt="Profile picture"
                          style="width: 48px; height: 48px; border-radius: 50%; object-fit: cover; border: 2px solid var(--border-color);"
                          @error=${R=>{R.target.style.display="none"}}
                        />
                      </div>
                    `:i}
                ${m?t`<div><span class="label">Name</span><span>${m}</span></div>`:i}
                ${y?t`<div><span class="label">Display Name</span><span>${y}</span></div>`:i}
                ${A?t`<div><span class="label">About</span><span style="max-width: 300px; overflow: hidden; text-overflow: ellipsis;">${A}</span></div>`:i}
                ${x?t`<div><span class="label">NIP-05</span><span>${x}</span></div>`:i}
              </div>
            `:t`
                <div style="color: var(--text-muted); font-size: 13px">
                  No profile set. Click "Edit Profile" to add your name, bio, and avatar.
                </div>
              `}
      </div>
    `};return t`
    <div class="card">
      <div class="card-title">Nostr</div>
      <div class="card-sub">Decentralized DMs via Nostr relays (NIP-04).</div>
      ${l}

      ${w?t`
            <div class="account-card-list">
              ${e.map(u=>L(u))}
            </div>
          `:t`
            <div class="status-list" style="margin-top: 16px;">
              <div>
                <span class="label">Configured</span>
                <span>${v?"Yes":"No"}</span>
              </div>
              <div>
                <span class="label">Running</span>
                <span>${b?"Yes":"No"}</span>
              </div>
              <div>
                <span class="label">Public Key</span>
                <span class="monospace" title="${h??""}"
                  >${P(h)}</span
                >
              </div>
              <div>
                <span class="label">Last start</span>
                <span>${g?c(g):"n/a"}</span>
              </div>
            </div>
          `}

      ${$?t`<div class="callout danger" style="margin-top: 12px;">${$}</div>`:i}

      ${I()}

      ${f({channelId:"nostr",props:s})}

      <div class="row" style="margin-top: 12px;">
        <button class="btn" @click=${()=>s.onRefresh(!1)}>Refresh</button>
      </div>
    </div>
  `}function Q(n,s){const a=s.snapshot,e=a?.channels;if(!a||!e)return!1;const l=e[n],o=typeof l?.configured=="boolean"&&l.configured,d=typeof l?.running=="boolean"&&l.running,r=typeof l?.connected=="boolean"&&l.connected,v=(a.channelAccounts?.[n]??[]).some(b=>b.configured||b.running||b.connected);return o||d||r||v}function q(n,s){return s?.[n]?.length??0}function S(n,s){const a=q(n,s);return a<2?i:t`<div class="account-count">Accounts (${a})</div>`}function J(n){const{props:s,signal:a,accountCountLabel:e}=n;return t`
    <div class="card">
      <div class="card-title">Signal</div>
      <div class="card-sub">signal-cli status and channel configuration.</div>
      ${e}

      <div class="status-list" style="margin-top: 16px;">
        <div>
          <span class="label">Configured</span>
          <span>${a?.configured?"Yes":"No"}</span>
        </div>
        <div>
          <span class="label">Running</span>
          <span>${a?.running?"Yes":"No"}</span>
        </div>
        <div>
          <span class="label">Base URL</span>
          <span>${a?.baseUrl??"n/a"}</span>
        </div>
        <div>
          <span class="label">Last start</span>
          <span>${a?.lastStartAt?c(a.lastStartAt):"n/a"}</span>
        </div>
        <div>
          <span class="label">Last probe</span>
          <span>${a?.lastProbeAt?c(a.lastProbeAt):"n/a"}</span>
        </div>
      </div>

      ${a?.lastError?t`<div class="callout danger" style="margin-top: 12px;">
            ${a.lastError}
          </div>`:i}

      ${a?.probe?t`<div class="callout" style="margin-top: 12px;">
            Probe ${a.probe.ok?"ok":"failed"} ·
            ${a.probe.status??""} ${a.probe.error??""}
          </div>`:i}

      ${f({channelId:"signal",props:s})}

      <div class="row" style="margin-top: 12px;">
        <button class="btn" @click=${()=>s.onRefresh(!0)}>
          Probe
        </button>
      </div>
    </div>
  `}function X(n){const{props:s,slack:a,accountCountLabel:e}=n;return t`
    <div class="card">
      <div class="card-title">Slack</div>
      <div class="card-sub">Socket mode status and channel configuration.</div>
      ${e}

      <div class="status-list" style="margin-top: 16px;">
        <div>
          <span class="label">Configured</span>
          <span>${a?.configured?"Yes":"No"}</span>
        </div>
        <div>
          <span class="label">Running</span>
          <span>${a?.running?"Yes":"No"}</span>
        </div>
        <div>
          <span class="label">Last start</span>
          <span>${a?.lastStartAt?c(a.lastStartAt):"n/a"}</span>
        </div>
        <div>
          <span class="label">Last probe</span>
          <span>${a?.lastProbeAt?c(a.lastProbeAt):"n/a"}</span>
        </div>
      </div>

      ${a?.lastError?t`<div class="callout danger" style="margin-top: 12px;">
            ${a.lastError}
          </div>`:i}

      ${a?.probe?t`<div class="callout" style="margin-top: 12px;">
            Probe ${a.probe.ok?"ok":"failed"} ·
            ${a.probe.status??""} ${a.probe.error??""}
          </div>`:i}

      ${f({channelId:"slack",props:s})}

      <div class="row" style="margin-top: 12px;">
        <button class="btn" @click=${()=>s.onRefresh(!0)}>
          Probe
        </button>
      </div>
    </div>
  `}function Z(n){const{props:s,telegram:a,telegramAccounts:e,accountCountLabel:l}=n,o=e.length>1,d=r=>{const v=r.probe?.bot?.username,b=r.name||r.accountId;return t`
      <div class="account-card">
        <div class="account-card-header">
          <div class="account-card-title">
            ${v?`@${v}`:b}
          </div>
          <div class="account-card-id">${r.accountId}</div>
        </div>
        <div class="status-list account-card-status">
          <div>
            <span class="label">Running</span>
            <span>${r.running?"Yes":"No"}</span>
          </div>
          <div>
            <span class="label">Configured</span>
            <span>${r.configured?"Yes":"No"}</span>
          </div>
          <div>
            <span class="label">Last inbound</span>
            <span>${r.lastInboundAt?c(r.lastInboundAt):"n/a"}</span>
          </div>
          ${r.lastError?t`
                <div class="account-card-error">
                  ${r.lastError}
                </div>
              `:i}
        </div>
      </div>
    `};return t`
    <div class="card">
      <div class="card-title">Telegram</div>
      <div class="card-sub">Bot status and channel configuration.</div>
      ${l}

      ${o?t`
            <div class="account-card-list">
              ${e.map(r=>d(r))}
            </div>
          `:t`
            <div class="status-list" style="margin-top: 16px;">
              <div>
                <span class="label">Configured</span>
                <span>${a?.configured?"Yes":"No"}</span>
              </div>
              <div>
                <span class="label">Running</span>
                <span>${a?.running?"Yes":"No"}</span>
              </div>
              <div>
                <span class="label">Mode</span>
                <span>${a?.mode??"n/a"}</span>
              </div>
              <div>
                <span class="label">Last start</span>
                <span>${a?.lastStartAt?c(a.lastStartAt):"n/a"}</span>
              </div>
              <div>
                <span class="label">Last probe</span>
                <span>${a?.lastProbeAt?c(a.lastProbeAt):"n/a"}</span>
              </div>
            </div>
          `}

      ${a?.lastError?t`<div class="callout danger" style="margin-top: 12px;">
            ${a.lastError}
          </div>`:i}

      ${a?.probe?t`<div class="callout" style="margin-top: 12px;">
            Probe ${a.probe.ok?"ok":"failed"} ·
            ${a.probe.status??""} ${a.probe.error??""}
          </div>`:i}

      ${f({channelId:"telegram",props:s})}

      <div class="row" style="margin-top: 12px;">
        <button class="btn" @click=${()=>s.onRefresh(!0)}>
          Probe
        </button>
      </div>
    </div>
  `}function aa(n){const{props:s,whatsapp:a,accountCountLabel:e}=n;return t`
    <div class="card">
      <div class="card-title">WhatsApp</div>
      <div class="card-sub">Link WhatsApp Web and monitor connection health.</div>
      ${e}

      <div class="status-list" style="margin-top: 16px;">
        <div>
          <span class="label">Configured</span>
          <span>${a?.configured?"Yes":"No"}</span>
        </div>
        <div>
          <span class="label">Linked</span>
          <span>${a?.linked?"Yes":"No"}</span>
        </div>
        <div>
          <span class="label">Running</span>
          <span>${a?.running?"Yes":"No"}</span>
        </div>
        <div>
          <span class="label">Connected</span>
          <span>${a?.connected?"Yes":"No"}</span>
        </div>
        <div>
          <span class="label">Last connect</span>
          <span>
            ${a?.lastConnectedAt?c(a.lastConnectedAt):"n/a"}
          </span>
        </div>
        <div>
          <span class="label">Last message</span>
          <span>
            ${a?.lastMessageAt?c(a.lastMessageAt):"n/a"}
          </span>
        </div>
        <div>
          <span class="label">Auth age</span>
          <span>
            ${a?.authAgeMs!=null?T(a.authAgeMs):"n/a"}
          </span>
        </div>
      </div>

      ${a?.lastError?t`<div class="callout danger" style="margin-top: 12px;">
            ${a.lastError}
          </div>`:i}

      ${s.whatsappMessage?t`<div class="callout" style="margin-top: 12px;">
            ${s.whatsappMessage}
          </div>`:i}

      ${s.whatsappQrDataUrl?t`<div class="qr-wrap">
            <img src=${s.whatsappQrDataUrl} alt="WhatsApp QR" />
          </div>`:i}

      <div class="row" style="margin-top: 14px; flex-wrap: wrap;">
        <button
          class="btn primary"
          ?disabled=${s.whatsappBusy}
          @click=${()=>s.onWhatsAppStart(!1)}
        >
          ${s.whatsappBusy?"Working…":"Show QR"}
        </button>
        <button
          class="btn"
          ?disabled=${s.whatsappBusy}
          @click=${()=>s.onWhatsAppStart(!0)}
        >
          Relink
        </button>
        <button
          class="btn"
          ?disabled=${s.whatsappBusy}
          @click=${()=>s.onWhatsAppWait()}
        >
          Wait for scan
        </button>
        <button
          class="btn danger"
          ?disabled=${s.whatsappBusy}
          @click=${()=>s.onWhatsAppLogout()}
        >
          Logout
        </button>
        <button class="btn" @click=${()=>s.onRefresh(!0)}>
          Refresh
        </button>
      </div>

      ${f({channelId:"whatsapp",props:s})}
    </div>
  `}function ua(n){const s=n.snapshot?.channels,a=s?.whatsapp??void 0,e=s?.telegram??void 0,l=s?.discord??null,o=s?.googlechat??null,d=s?.slack??null,r=s?.signal??null,p=s?.imessage??null,v=s?.nostr??null,h=na(n.snapshot).map((g,$)=>({key:g,enabled:Q(g,n),order:$})).toSorted((g,$)=>g.enabled!==$.enabled?g.enabled?-1:1:g.order-$.order);return t`
    <section class="grid grid-cols-2">
      ${h.map(g=>sa(g.key,n,{whatsapp:a,telegram:e,discord:l,googlechat:o,slack:d,signal:r,imessage:p,nostr:v,channelAccounts:n.snapshot?.channelAccounts??null}))}
    </section>

    <section class="card" style="margin-top: 18px;">
      <div class="row" style="justify-content: space-between;">
        <div>
          <div class="card-title">Channel health</div>
          <div class="card-sub">Channel status snapshots from the gateway.</div>
        </div>
        <div class="muted">${n.lastSuccessAt?c(n.lastSuccessAt):"n/a"}</div>
      </div>
      ${n.lastError?t`<div class="callout danger" style="margin-top: 12px;">
            ${n.lastError}
          </div>`:i}
      <pre class="code-block" style="margin-top: 12px;">
${n.snapshot?JSON.stringify(n.snapshot,null,2):"No snapshot yet."}
      </pre>
    </section>
  `}function na(n){return n?.channelMeta?.length?n.channelMeta.map(s=>s.id):n?.channelOrder?.length?n.channelOrder:["whatsapp","telegram","discord","googlechat","slack","signal","imessage","nostr"]}function sa(n,s,a){const e=S(n,a.channelAccounts);switch(n){case"whatsapp":return aa({props:s,whatsapp:a.whatsapp,accountCountLabel:e});case"telegram":return Z({props:s,telegram:a.telegram,telegramAccounts:a.channelAccounts?.telegram??[],accountCountLabel:e});case"discord":return j({props:s,discord:a.discord,accountCountLabel:e});case"googlechat":return z({props:s,googleChat:a.googlechat,accountCountLabel:e});case"slack":return X({props:s,slack:a.slack,accountCountLabel:e});case"signal":return J({props:s,signal:a.signal,accountCountLabel:e});case"imessage":return _({props:s,imessage:a.imessage,accountCountLabel:e});case"nostr":{const l=a.channelAccounts?.nostr??[],o=l[0],d=o?.accountId??"default",r=o?.profile??null,p=s.nostrProfileAccountId===d?s.nostrProfileFormState:null,v=p?{onFieldChange:s.onNostrProfileFieldChange,onSave:s.onNostrProfileSave,onImport:s.onNostrProfileImport,onCancel:s.onNostrProfileCancel,onToggleAdvanced:s.onNostrProfileToggleAdvanced}:null;return G({props:s,nostr:a.nostr,nostrAccounts:l,accountCountLabel:e,profileFormState:p,profileFormCallbacks:v,onEditProfile:()=>s.onNostrProfileEdit(d,r)})}default:return ta(n,s,a.channelAccounts??{})}}function ta(n,s,a){const e=la(s.snapshot,n),l=s.snapshot?.channels?.[n],o=typeof l?.configured=="boolean"?l.configured:void 0,d=typeof l?.running=="boolean"?l.running:void 0,r=typeof l?.connected=="boolean"?l.connected:void 0,p=typeof l?.lastError=="string"?l.lastError:void 0,v=a[n]??[],b=S(n,a);return t`
    <div class="card">
      <div class="card-title">${e}</div>
      <div class="card-sub">Channel status and configuration.</div>
      ${b}

      ${v.length>0?t`
            <div class="account-card-list">
              ${v.map(h=>ca(h))}
            </div>
          `:t`
            <div class="status-list" style="margin-top: 16px;">
              <div>
                <span class="label">Configured</span>
                <span>${o==null?"n/a":o?"Yes":"No"}</span>
              </div>
              <div>
                <span class="label">Running</span>
                <span>${d==null?"n/a":d?"Yes":"No"}</span>
              </div>
              <div>
                <span class="label">Connected</span>
                <span>${r==null?"n/a":r?"Yes":"No"}</span>
              </div>
            </div>
          `}

      ${p?t`<div class="callout danger" style="margin-top: 12px;">
            ${p}
          </div>`:i}

      ${f({channelId:n,props:s})}
    </div>
  `}function ea(n){return n?.channelMeta?.length?Object.fromEntries(n.channelMeta.map(s=>[s.id,s])):{}}function la(n,s){return ea(n)[s]?.label??n?.channelLabels?.[s]??s}const ia=600*1e3;function N(n){return n.lastInboundAt?Date.now()-n.lastInboundAt<ia:!1}function ra(n){return n.running?"Yes":N(n)?"Active":"No"}function oa(n){return n.connected===!0?"Yes":n.connected===!1?"No":N(n)?"Active":"n/a"}function ca(n){const s=ra(n),a=oa(n);return t`
    <div class="account-card">
      <div class="account-card-header">
        <div class="account-card-title">${n.name||n.accountId}</div>
        <div class="account-card-id">${n.accountId}</div>
      </div>
      <div class="status-list account-card-status">
        <div>
          <span class="label">Running</span>
          <span>${s}</span>
        </div>
        <div>
          <span class="label">Configured</span>
          <span>${n.configured?"Yes":"No"}</span>
        </div>
        <div>
          <span class="label">Connected</span>
          <span>${a}</span>
        </div>
        <div>
          <span class="label">Last inbound</span>
          <span>${n.lastInboundAt?c(n.lastInboundAt):"n/a"}</span>
        </div>
        ${n.lastError?t`
              <div class="account-card-error">
                ${n.lastError}
              </div>
            `:i}
      </div>
    </div>
  `}export{ua as renderChannels};
//# sourceMappingURL=channels-CjkfZ97n.js.map
