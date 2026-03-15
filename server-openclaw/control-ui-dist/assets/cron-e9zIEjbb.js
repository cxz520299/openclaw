import{A as s,G as n,g as P,d as t,h as H,H as K,I as y,f as R}from"./index-CenotFkT.js";const m=e=>e??s;function O(){return[{value:"ok",label:n("cron.runs.runStatusOk")},{value:"error",label:n("cron.runs.runStatusError")},{value:"skipped",label:n("cron.runs.runStatusSkipped")}]}function U(){return[{value:"delivered",label:n("cron.runs.deliveryDelivered")},{value:"not-delivered",label:n("cron.runs.deliveryNotDelivered")},{value:"unknown",label:n("cron.runs.deliveryUnknown")},{value:"not-requested",label:n("cron.runs.deliveryNotRequested")}]}function j(e,r,l){const c=new Set(e);return l?c.add(r):c.delete(r),Array.from(c)}function F(e,r){return e.length===0?r:e.length<=2?e.join(", "):`${e[0]} +${e.length-1}`}function q(e){const r=["last",...e.channels.filter(Boolean)],l=e.form.deliveryChannel?.trim();l&&!r.includes(l)&&r.push(l);const c=new Set;return r.filter(d=>c.has(d)?!1:(c.add(d),!0))}function E(e,r){if(r==="last")return"last";const l=e.channelMeta?.find(c=>c.id===r);return l?.label?l.label:e.channelLabels?.[r]??r}function _(e){return t`
    <div class="field cron-filter-dropdown" data-filter=${e.id}>
      <span>${e.title}</span>
      <details class="cron-filter-dropdown__details">
        <summary class="btn cron-filter-dropdown__trigger">
          <span>${e.summary}</span>
        </summary>
        <div class="cron-filter-dropdown__panel">
          <div class="cron-filter-dropdown__list">
            ${e.options.map(r=>t`
                <label class="cron-filter-dropdown__option">
                  <input
                    type="checkbox"
                    value=${r.value}
                    .checked=${e.selected.includes(r.value)}
                    @change=${l=>{const c=l.target;e.onToggle(r.value,c.checked)}}
                  />
                  <span>${r.label}</span>
                </label>
              `)}
          </div>
          <div class="row">
            <button class="btn" type="button" @click=${e.onClear}>${n("cron.runs.clear")}</button>
          </div>
        </div>
      </details>
    </div>
  `}function g(e,r){const l=Array.from(new Set(r.map(c=>c.trim()).filter(Boolean)));return l.length===0?s:t`<datalist id=${e}>
    ${l.map(c=>t`<option value=${c}></option> `)}
  </datalist>`}function u(e){return`cron-error-${e}`}function B(e){return e==="name"?"cron-name":e==="scheduleAt"?"cron-schedule-at":e==="everyAmount"?"cron-every-amount":e==="cronExpr"?"cron-cron-expr":e==="staggerAmount"?"cron-stagger-amount":e==="payloadText"?"cron-payload-text":e==="payloadModel"?"cron-payload-model":e==="payloadThinking"?"cron-payload-thinking":e==="timeoutSeconds"?"cron-timeout-seconds":e==="failureAlertAfter"?"cron-failure-alert-after":e==="failureAlertCooldownSeconds"?"cron-failure-alert-cooldown-seconds":"cron-delivery-to"}function N(e,r,l){return e==="payloadText"?r.payloadKind==="systemEvent"?n("cron.form.mainTimelineMessage"):n("cron.form.assistantTaskPrompt"):e==="deliveryTo"?l==="webhook"?n("cron.form.webhookUrl"):n("cron.form.to"):{name:n("cron.form.fieldName"),scheduleAt:n("cron.form.runAt"),everyAmount:n("cron.form.every"),cronExpr:n("cron.form.expression"),staggerAmount:n("cron.form.staggerWindow"),payloadText:n("cron.form.assistantTaskPrompt"),payloadModel:n("cron.form.model"),payloadThinking:n("cron.form.thinking"),timeoutSeconds:n("cron.form.timeoutSeconds"),deliveryTo:n("cron.form.to"),failureAlertAfter:"Failure alert after",failureAlertCooldownSeconds:"Failure alert cooldown"}[e]}function z(e,r,l){const c=["name","scheduleAt","everyAmount","cronExpr","staggerAmount","payloadText","payloadModel","payloadThinking","timeoutSeconds","deliveryTo","failureAlertAfter","failureAlertCooldownSeconds"],d=[];for(const a of c){const b=e[a];b&&d.push({key:a,label:N(a,r,l),message:b,inputId:B(a)})}return d}function Q(e){const r=document.getElementById(e);r instanceof HTMLElement&&(typeof r.scrollIntoView=="function"&&r.scrollIntoView({block:"center",behavior:"smooth"}),r.focus())}function i(e,r=!1){return t`<span>
    ${e}
    ${r?t`
            <span class="cron-required-marker" aria-hidden="true">*</span>
            <span class="cron-required-sr">${n("cron.form.requiredSr")}</span>
          `:s}
  </span>`}function re(e){const r=!!e.editingJobId,l=e.form.payloadKind==="agentTurn",c=e.form.scheduleKind==="cron",d=q(e),a=e.runsJobId==null?void 0:e.jobs.find(o=>o.id===e.runsJobId),b=e.runsScope==="all"?n("cron.jobList.allJobs"):a?.name??e.runsJobId??n("cron.jobList.selectJob"),k=e.runs.toSorted((o,$)=>e.runsSortDir==="asc"?o.ts-$.ts:$.ts-o.ts),A=O(),p=U(),M=A.filter(o=>e.runsStatuses.includes(o.value)).map(o=>o.label),D=p.filter(o=>e.runsDeliveryStatuses.includes(o.value)).map(o=>o.label),J=F(M,n("cron.runs.allStatuses")),L=F(D,n("cron.runs.allDelivery")),x=e.form.sessionTarget==="isolated"&&e.form.payloadKind==="agentTurn",v=e.form.deliveryMode==="announce"&&!x?"none":e.form.deliveryMode,h=z(e.fieldErrors,e.form,v),w=!e.busy&&h.length>0,I=e.jobsQuery.trim().length>0||e.jobsEnabledFilter!=="all"||e.jobsScheduleKindFilter!=="all"||e.jobsLastStatusFilter!=="all"||e.jobsSortBy!=="nextRunAtMs"||e.jobsSortDir!=="asc",C=w&&!e.canSubmit?h.length===1?n("cron.form.fixFields",{count:String(h.length)}):n("cron.form.fixFieldsPlural",{count:String(h.length)}):"";return t`
    <section class="card cron-summary-strip">
      <div class="cron-summary-strip__left">
        <div class="cron-summary-item">
          <div class="cron-summary-label">${n("cron.summary.enabled")}</div>
          <div class="cron-summary-value">
            <span class=${`chip ${e.status?.enabled?"chip-ok":"chip-danger"}`}>
              ${e.status?e.status.enabled?n("cron.summary.yes"):n("cron.summary.no"):n("common.na")}
            </span>
          </div>
        </div>
        <div class="cron-summary-item">
          <div class="cron-summary-label">${n("cron.summary.jobs")}</div>
          <div class="cron-summary-value">${e.status?.jobs??n("common.na")}</div>
        </div>
        <div class="cron-summary-item cron-summary-item--wide">
          <div class="cron-summary-label">${n("cron.summary.nextWake")}</div>
          <div class="cron-summary-value">${P(e.status?.nextWakeAtMs??null)}</div>
        </div>
      </div>
      <div class="cron-summary-strip__actions">
        <button class="btn" ?disabled=${e.loading} @click=${e.onRefresh}>
          ${e.loading?n("cron.summary.refreshing"):n("cron.summary.refresh")}
        </button>
        ${e.error?t`<span class="muted">${e.error}</span>`:s}
      </div>
    </section>

    <section class="cron-workspace">
      <div class="cron-workspace-main">
        <section class="card">
          <div class="row" style="justify-content: space-between; align-items: flex-start; gap: 12px;">
            <div>
              <div class="card-title">${n("cron.jobs.title")}</div>
              <div class="card-sub">${n("cron.jobs.subtitle")}</div>
            </div>
            <div class="muted">${n("cron.jobs.shownOf",{shown:String(e.jobs.length),total:String(e.jobsTotal)})}</div>
          </div>
          <div class="filters" style="margin-top: 12px;">
            <label class="field cron-filter-search">
              <span>${n("cron.jobs.searchJobs")}</span>
              <input
                .value=${e.jobsQuery}
                placeholder=${n("cron.jobs.searchPlaceholder")}
                @input=${o=>e.onJobsFiltersChange({cronJobsQuery:o.target.value})}
              />
            </label>
            <label class="field">
              <span>${n("cron.jobs.enabled")}</span>
              <select
                .value=${e.jobsEnabledFilter}
                @change=${o=>e.onJobsFiltersChange({cronJobsEnabledFilter:o.target.value})}
              >
                <option value="all">${n("cron.jobs.all")}</option>
                <option value="enabled">${n("common.enabled")}</option>
                <option value="disabled">${n("common.disabled")}</option>
              </select>
            </label>
            <label class="field">
              <span>${n("cron.jobs.schedule")}</span>
              <select
                data-test-id="cron-jobs-schedule-filter"
                .value=${e.jobsScheduleKindFilter}
                @change=${o=>e.onJobsFiltersChange({cronJobsScheduleKindFilter:o.target.value})}
              >
                <option value="all">${n("cron.jobs.all")}</option>
                <option value="at">${n("cron.form.at")}</option>
                <option value="every">${n("cron.form.every")}</option>
                <option value="cron">${n("cron.form.cronOption")}</option>
              </select>
            </label>
            <label class="field">
              <span>${n("cron.jobs.lastRun")}</span>
              <select
                data-test-id="cron-jobs-last-status-filter"
                .value=${e.jobsLastStatusFilter}
                @change=${o=>e.onJobsFiltersChange({cronJobsLastStatusFilter:o.target.value})}
              >
                <option value="all">${n("cron.jobs.all")}</option>
                <option value="ok">${n("cron.runs.runStatusOk")}</option>
                <option value="error">${n("cron.runs.runStatusError")}</option>
                <option value="skipped">${n("cron.runs.runStatusSkipped")}</option>
              </select>
            </label>
            <label class="field">
              <span>${n("cron.jobs.sort")}</span>
              <select
                .value=${e.jobsSortBy}
                @change=${o=>e.onJobsFiltersChange({cronJobsSortBy:o.target.value})}
              >
                <option value="nextRunAtMs">${n("cron.jobs.nextRun")}</option>
                <option value="updatedAtMs">${n("cron.jobs.recentlyUpdated")}</option>
                <option value="name">${n("cron.jobs.name")}</option>
              </select>
            </label>
            <label class="field">
              <span>${n("cron.jobs.direction")}</span>
              <select
                .value=${e.jobsSortDir}
                @change=${o=>e.onJobsFiltersChange({cronJobsSortDir:o.target.value})}
              >
                <option value="asc">${n("cron.jobs.ascending")}</option>
                <option value="desc">${n("cron.jobs.descending")}</option>
              </select>
            </label>
            <label class="field">
              <span>${n("cron.jobs.reset")}</span>
              <button
                class="btn"
                data-test-id="cron-jobs-filters-reset"
                ?disabled=${!I}
                @click=${e.onJobsFiltersReset}
              >
                ${n("cron.jobs.reset")}
              </button>
            </label>
          </div>
          ${e.jobs.length===0?t`
                  <div class="muted" style="margin-top: 12px">${n("cron.jobs.noMatching")}</div>
                `:t`
                  <div class="list" style="margin-top: 12px;">
                    ${e.jobs.map(o=>V(o,e))}
                  </div>
                `}
          ${e.jobsHasMore?t`
                  <div class="row" style="margin-top: 12px">
                    <button
                      class="btn"
                      ?disabled=${e.loading||e.jobsLoadingMore}
                      @click=${e.onLoadMoreJobs}
                    >
                      ${e.jobsLoadingMore?n("cron.jobs.loading"):n("cron.jobs.loadMore")}
                    </button>
                  </div>
                `:s}
        </section>

        <section class="card">
          <div class="row" style="justify-content: space-between; align-items: flex-start; gap: 12px;">
            <div>
              <div class="card-title">${n("cron.runs.title")}</div>
              <div class="card-sub">
                ${e.runsScope==="all"?n("cron.runs.subtitleAll"):n("cron.runs.subtitleJob",{title:b})}
              </div>
            </div>
            <div class="muted">${n("cron.jobs.shownOf",{shown:String(k.length),total:String(e.runsTotal)})}</div>
          </div>
          <div class="cron-run-filters">
            <div class="cron-run-filters__row cron-run-filters__row--primary">
              <label class="field">
                <span>${n("cron.runs.scope")}</span>
                <select
                  .value=${e.runsScope}
                  @change=${o=>e.onRunsFiltersChange({cronRunsScope:o.target.value})}
                >
                  <option value="all">${n("cron.runs.allJobs")}</option>
                  <option value="job" ?disabled=${e.runsJobId==null}>${n("cron.runs.selectedJob")}</option>
                </select>
              </label>
              <label class="field cron-run-filter-search">
                <span>${n("cron.runs.searchRuns")}</span>
                <input
                  .value=${e.runsQuery}
                  placeholder=${n("cron.runs.searchPlaceholder")}
                  @input=${o=>e.onRunsFiltersChange({cronRunsQuery:o.target.value})}
                />
              </label>
              <label class="field">
                <span>${n("cron.jobs.sort")}</span>
                <select
                  .value=${e.runsSortDir}
                  @change=${o=>e.onRunsFiltersChange({cronRunsSortDir:o.target.value})}
                >
                  <option value="desc">${n("cron.runs.newestFirst")}</option>
                  <option value="asc">${n("cron.runs.oldestFirst")}</option>
                </select>
              </label>
            </div>
            <div class="cron-run-filters__row cron-run-filters__row--secondary">
              ${_({id:"status",title:n("cron.runs.status"),summary:J,options:A,selected:e.runsStatuses,onToggle:(o,$)=>{const S=j(e.runsStatuses,o,$);e.onRunsFiltersChange({cronRunsStatuses:S})},onClear:()=>{e.onRunsFiltersChange({cronRunsStatuses:[]})}})}
              ${_({id:"delivery",title:n("cron.runs.delivery"),summary:L,options:p,selected:e.runsDeliveryStatuses,onToggle:(o,$)=>{const S=j(e.runsDeliveryStatuses,o,$);e.onRunsFiltersChange({cronRunsDeliveryStatuses:S})},onClear:()=>{e.onRunsFiltersChange({cronRunsDeliveryStatuses:[]})}})}
            </div>
          </div>
          ${e.runsScope==="job"&&e.runsJobId==null?t`
                  <div class="muted" style="margin-top: 12px">${n("cron.runs.selectJobHint")}</div>
                `:k.length===0?t`
                    <div class="muted" style="margin-top: 12px">${n("cron.runs.noMatching")}</div>
                  `:t`
                    <div class="list" style="margin-top: 12px;">
                      ${k.map(o=>ne(o,e.basePath))}
                    </div>
                  `}
          ${(e.runsScope==="all"||e.runsJobId!=null)&&e.runsHasMore?t`
                  <div class="row" style="margin-top: 12px">
                    <button
                      class="btn"
                      ?disabled=${e.runsLoadingMore}
                      @click=${e.onLoadMoreRuns}
                    >
                      ${e.runsLoadingMore?n("cron.jobs.loading"):n("cron.runs.loadMore")}
                    </button>
                  </div>
                `:s}
        </section>
      </div>

      <section class="card cron-workspace-form">
        <div class="card-title">${r?n("cron.form.editJob"):n("cron.form.newJob")}</div>
        <div class="card-sub">
          ${r?n("cron.form.updateSubtitle"):n("cron.form.createSubtitle")}
        </div>
        <div class="cron-form">
          <div class="cron-required-legend">
            <span class="cron-required-marker" aria-hidden="true">*</span> ${n("cron.form.required")}
          </div>
          <section class="cron-form-section">
            <div class="cron-form-section__title">${n("cron.form.basics")}</div>
            <div class="cron-form-section__sub">${n("cron.form.basicsSub")}</div>
            <div class="form-grid cron-form-grid">
              <label class="field">
                ${i(n("cron.form.fieldName"),!0)}
                <input
                  id="cron-name"
                  .value=${e.form.name}
                  placeholder=${n("cron.form.namePlaceholder")}
                  aria-invalid=${e.fieldErrors.name?"true":"false"}
                  aria-describedby=${m(e.fieldErrors.name?u("name"):void 0)}
                  @input=${o=>e.onFormChange({name:o.target.value})}
                />
                ${f(e.fieldErrors.name,u("name"))}
              </label>
              <label class="field">
                <span>${n("cron.form.description")}</span>
                <input
                  .value=${e.form.description}
                  placeholder=${n("cron.form.descriptionPlaceholder")}
                  @input=${o=>e.onFormChange({description:o.target.value})}
                />
              </label>
              <label class="field">
                ${i(n("cron.form.agentId"))}
                <input
                  id="cron-agent-id"
                  .value=${e.form.agentId}
                  list="cron-agent-suggestions"
                  ?disabled=${e.form.clearAgent}
                  @input=${o=>e.onFormChange({agentId:o.target.value})}
                  placeholder=${n("cron.form.agentPlaceholder")}
                />
                <div class="cron-help">${n("cron.form.agentHelp")}</div>
              </label>
              <label class="field checkbox cron-checkbox cron-checkbox-inline">
                <input
                  type="checkbox"
                  .checked=${e.form.enabled}
                  @change=${o=>e.onFormChange({enabled:o.target.checked})}
                />
                <span class="field-checkbox__label">${n("cron.summary.enabled")}</span>
              </label>
            </div>
          </section>

          <section class="cron-form-section">
            <div class="cron-form-section__title">${n("cron.form.schedule")}</div>
            <div class="cron-form-section__sub">${n("cron.form.scheduleSub")}</div>
            <div class="form-grid cron-form-grid">
              <label class="field cron-span-2">
                ${i(n("cron.form.schedule"))}
                <select
                  id="cron-schedule-kind"
                  .value=${e.form.scheduleKind}
                  @change=${o=>e.onFormChange({scheduleKind:o.target.value})}
                >
                  <option value="every">${n("cron.form.every")}</option>
                  <option value="at">${n("cron.form.at")}</option>
                  <option value="cron">${n("cron.form.cronOption")}</option>
                </select>
              </label>
            </div>
            ${W(e)}
          </section>

          <section class="cron-form-section">
            <div class="cron-form-section__title">${n("cron.form.execution")}</div>
            <div class="cron-form-section__sub">${n("cron.form.executionSub")}</div>
            <div class="form-grid cron-form-grid">
              <label class="field">
                ${i(n("cron.form.session"))}
                <select
                  id="cron-session-target"
                  .value=${e.form.sessionTarget}
                  @change=${o=>e.onFormChange({sessionTarget:o.target.value})}
                >
                  <option value="main">${n("cron.form.main")}</option>
                  <option value="isolated">${n("cron.form.isolated")}</option>
                </select>
                <div class="cron-help">${n("cron.form.sessionHelp")}</div>
              </label>
              <label class="field">
                ${i(n("cron.form.wakeMode"))}
                <select
                  id="cron-wake-mode"
                  .value=${e.form.wakeMode}
                  @change=${o=>e.onFormChange({wakeMode:o.target.value})}
                >
                  <option value="now">${n("cron.form.now")}</option>
                  <option value="next-heartbeat">${n("cron.form.nextHeartbeat")}</option>
                </select>
                <div class="cron-help">${n("cron.form.wakeModeHelp")}</div>
              </label>
              <label class="field ${l?"":"cron-span-2"}">
                ${i(n("cron.form.payloadKind"))}
                <select
                  id="cron-payload-kind"
                  .value=${e.form.payloadKind}
                  @change=${o=>e.onFormChange({payloadKind:o.target.value})}
                >
                  <option value="systemEvent">${n("cron.form.systemEvent")}</option>
                  <option value="agentTurn">${n("cron.form.agentTurn")}</option>
                </select>
                <div class="cron-help">
                  ${e.form.payloadKind==="systemEvent"?n("cron.form.systemEventHelp"):n("cron.form.agentTurnHelp")}
                </div>
              </label>
              ${l?t`
                      <label class="field">
                        ${i(n("cron.form.timeoutSeconds"))}
                        <input
                          id="cron-timeout-seconds"
                          .value=${e.form.timeoutSeconds}
                          placeholder=${n("cron.form.timeoutPlaceholder")}
                          aria-invalid=${e.fieldErrors.timeoutSeconds?"true":"false"}
                          aria-describedby=${m(e.fieldErrors.timeoutSeconds?u("timeoutSeconds"):void 0)}
                          @input=${o=>e.onFormChange({timeoutSeconds:o.target.value})}
                        />
                        <div class="cron-help">${n("cron.form.timeoutHelp")}</div>
                        ${f(e.fieldErrors.timeoutSeconds,u("timeoutSeconds"))}
                      </label>
                    `:s}
            </div>
            <label class="field cron-span-2">
              ${i(e.form.payloadKind==="systemEvent"?n("cron.form.mainTimelineMessage"):n("cron.form.assistantTaskPrompt"),!0)}
              <textarea
                id="cron-payload-text"
                .value=${e.form.payloadText}
                aria-invalid=${e.fieldErrors.payloadText?"true":"false"}
                aria-describedby=${m(e.fieldErrors.payloadText?u("payloadText"):void 0)}
                @input=${o=>e.onFormChange({payloadText:o.target.value})}
                rows="4"
              ></textarea>
              ${f(e.fieldErrors.payloadText,u("payloadText"))}
            </label>
          </section>

          <section class="cron-form-section">
            <div class="cron-form-section__title">${n("cron.form.deliverySection")}</div>
            <div class="cron-form-section__sub">${n("cron.form.deliverySub")}</div>
            <div class="form-grid cron-form-grid">
              <label class="field ${v==="none"?"cron-span-2":""}">
                ${i(n("cron.form.resultDelivery"))}
                <select
                  id="cron-delivery-mode"
                  .value=${v}
                  @change=${o=>e.onFormChange({deliveryMode:o.target.value})}
                >
                  ${x?t`
                          <option value="announce">${n("cron.form.announceDefault")}</option>
                        `:s}
                  <option value="webhook">${n("cron.form.webhookPost")}</option>
                  <option value="none">${n("cron.form.noneInternal")}</option>
                </select>
                <div class="cron-help">${n("cron.form.deliveryHelp")}</div>
              </label>
              ${v!=="none"?t`
                      <label class="field ${v==="webhook"?"cron-span-2":""}">
                        ${i(v==="webhook"?n("cron.form.webhookUrl"):n("cron.form.channel"),v==="webhook")}
                        ${v==="webhook"?t`
                                <input
                                  id="cron-delivery-to"
                                  .value=${e.form.deliveryTo}
                                  list="cron-delivery-to-suggestions"
                                  aria-invalid=${e.fieldErrors.deliveryTo?"true":"false"}
                                  aria-describedby=${m(e.fieldErrors.deliveryTo?u("deliveryTo"):void 0)}
                                  @input=${o=>e.onFormChange({deliveryTo:o.target.value})}
                                  placeholder=${n("cron.form.webhookPlaceholder")}
                                />
                              `:t`
                                <select
                                  id="cron-delivery-channel"
                                  .value=${e.form.deliveryChannel||"last"}
                                  @change=${o=>e.onFormChange({deliveryChannel:o.target.value})}
                                >
                                  ${d.map(o=>t`<option value=${o}>
                                        ${E(e,o)}
                                      </option>`)}
                                </select>
                              `}
                        ${v==="announce"?t`
                                <div class="cron-help">${n("cron.form.channelHelp")}</div>
                              `:t`
                                <div class="cron-help">${n("cron.form.webhookHelp")}</div>
                              `}
                      </label>
                      ${v==="announce"?t`
                              <label class="field cron-span-2">
                                ${i(n("cron.form.to"))}
                                <input
                                  id="cron-delivery-to"
                                  .value=${e.form.deliveryTo}
                                  list="cron-delivery-to-suggestions"
                                  @input=${o=>e.onFormChange({deliveryTo:o.target.value})}
                                  placeholder=${n("cron.form.toPlaceholder")}
                                />
                                <div class="cron-help">${n("cron.form.toHelp")}</div>
                              </label>
                            `:s}
                      ${v==="webhook"?f(e.fieldErrors.deliveryTo,u("deliveryTo")):s}
                    `:s}
            </div>
          </section>

          <details class="cron-advanced">
            <summary class="cron-advanced__summary">${n("cron.form.advanced")}</summary>
            <div class="cron-help">${n("cron.form.advancedHelp")}</div>
            <div class="form-grid cron-form-grid">
              <label class="field checkbox cron-checkbox">
                <input
                  type="checkbox"
                  .checked=${e.form.deleteAfterRun}
                  @change=${o=>e.onFormChange({deleteAfterRun:o.target.checked})}
                />
                <span class="field-checkbox__label">${n("cron.form.deleteAfterRun")}</span>
                <div class="cron-help">${n("cron.form.deleteAfterRunHelp")}</div>
              </label>
              <label class="field checkbox cron-checkbox">
                <input
                  type="checkbox"
                  .checked=${e.form.clearAgent}
                  @change=${o=>e.onFormChange({clearAgent:o.target.checked})}
                />
                <span class="field-checkbox__label">${n("cron.form.clearAgentOverride")}</span>
                <div class="cron-help">${n("cron.form.clearAgentHelp")}</div>
              </label>
              <label class="field cron-span-2">
                ${i("Session key")}
                <input
                  id="cron-session-key"
                  .value=${e.form.sessionKey}
                  @input=${o=>e.onFormChange({sessionKey:o.target.value})}
                  placeholder="agent:main:main"
                />
                <div class="cron-help">
                  Optional routing key for job delivery and wake routing.
                </div>
              </label>
              ${c?t`
                      <label class="field checkbox cron-checkbox cron-span-2">
                        <input
                          type="checkbox"
                          .checked=${e.form.scheduleExact}
                          @change=${o=>e.onFormChange({scheduleExact:o.target.checked})}
                        />
                        <span class="field-checkbox__label">${n("cron.form.exactTiming")}</span>
                        <div class="cron-help">${n("cron.form.exactTimingHelp")}</div>
                      </label>
                      <div class="cron-stagger-group cron-span-2">
                        <label class="field">
                          ${i(n("cron.form.staggerWindow"))}
                          <input
                            id="cron-stagger-amount"
                            .value=${e.form.staggerAmount}
                            ?disabled=${e.form.scheduleExact}
                            aria-invalid=${e.fieldErrors.staggerAmount?"true":"false"}
                            aria-describedby=${m(e.fieldErrors.staggerAmount?u("staggerAmount"):void 0)}
                            @input=${o=>e.onFormChange({staggerAmount:o.target.value})}
                            placeholder=${n("cron.form.staggerPlaceholder")}
                          />
                          ${f(e.fieldErrors.staggerAmount,u("staggerAmount"))}
                        </label>
                        <label class="field">
                          <span>${n("cron.form.staggerUnit")}</span>
                          <select
                            .value=${e.form.staggerUnit}
                            ?disabled=${e.form.scheduleExact}
                            @change=${o=>e.onFormChange({staggerUnit:o.target.value})}
                          >
                            <option value="seconds">${n("cron.form.seconds")}</option>
                            <option value="minutes">${n("cron.form.minutes")}</option>
                          </select>
                        </label>
                      </div>
                    `:s}
              ${l?t`
                      <label class="field cron-span-2">
                        ${i("Account ID")}
                        <input
                          id="cron-delivery-account-id"
                          .value=${e.form.deliveryAccountId}
                          list="cron-delivery-account-suggestions"
                          ?disabled=${v!=="announce"}
                          @input=${o=>e.onFormChange({deliveryAccountId:o.target.value})}
                          placeholder="default"
                        />
                        <div class="cron-help">
                          Optional channel account ID for multi-account setups.
                        </div>
                      </label>
                      <label class="field checkbox cron-checkbox cron-span-2">
                        <input
                          type="checkbox"
                          .checked=${e.form.payloadLightContext}
                          @change=${o=>e.onFormChange({payloadLightContext:o.target.checked})}
                        />
                        <span class="field-checkbox__label">Light context</span>
                        <div class="cron-help">
                          Use lightweight bootstrap context for this agent job.
                        </div>
                      </label>
                      <label class="field">
                        ${i(n("cron.form.model"))}
                        <input
                          id="cron-payload-model"
                          .value=${e.form.payloadModel}
                          list="cron-model-suggestions"
                          @input=${o=>e.onFormChange({payloadModel:o.target.value})}
                          placeholder=${n("cron.form.modelPlaceholder")}
                        />
                        <div class="cron-help">${n("cron.form.modelHelp")}</div>
                      </label>
                      <label class="field">
                        ${i(n("cron.form.thinking"))}
                        <input
                          id="cron-payload-thinking"
                          .value=${e.form.payloadThinking}
                          list="cron-thinking-suggestions"
                          @input=${o=>e.onFormChange({payloadThinking:o.target.value})}
                          placeholder=${n("cron.form.thinkingPlaceholder")}
                        />
                        <div class="cron-help">${n("cron.form.thinkingHelp")}</div>
                      </label>
                    `:s}
              ${l?t`
                      <label class="field cron-span-2">
                        ${i("Failure alerts")}
                        <select
                          .value=${e.form.failureAlertMode}
                          @change=${o=>e.onFormChange({failureAlertMode:o.target.value})}
                        >
                          <option value="inherit">Inherit global setting</option>
                          <option value="disabled">Disable for this job</option>
                          <option value="custom">Custom per-job settings</option>
                        </select>
                        <div class="cron-help">
                          Control when this job sends repeated-failure alerts.
                        </div>
                      </label>
                      ${e.form.failureAlertMode==="custom"?t`
                              <label class="field">
                                ${i("Alert after")}
                                <input
                                  id="cron-failure-alert-after"
                                  .value=${e.form.failureAlertAfter}
                                  aria-invalid=${e.fieldErrors.failureAlertAfter?"true":"false"}
                                  aria-describedby=${m(e.fieldErrors.failureAlertAfter?u("failureAlertAfter"):void 0)}
                                  @input=${o=>e.onFormChange({failureAlertAfter:o.target.value})}
                                  placeholder="2"
                                />
                                <div class="cron-help">Consecutive errors before alerting.</div>
                                ${f(e.fieldErrors.failureAlertAfter,u("failureAlertAfter"))}
                              </label>
                              <label class="field">
                                ${i("Cooldown (seconds)")}
                                <input
                                  id="cron-failure-alert-cooldown-seconds"
                                  .value=${e.form.failureAlertCooldownSeconds}
                                  aria-invalid=${e.fieldErrors.failureAlertCooldownSeconds?"true":"false"}
                                  aria-describedby=${m(e.fieldErrors.failureAlertCooldownSeconds?u("failureAlertCooldownSeconds"):void 0)}
                                  @input=${o=>e.onFormChange({failureAlertCooldownSeconds:o.target.value})}
                                  placeholder="3600"
                                />
                                <div class="cron-help">Minimum seconds between alerts.</div>
                                ${f(e.fieldErrors.failureAlertCooldownSeconds,u("failureAlertCooldownSeconds"))}
                              </label>
                              <label class="field">
                                ${i("Alert channel")}
                                <select
                                  .value=${e.form.failureAlertChannel||"last"}
                                  @change=${o=>e.onFormChange({failureAlertChannel:o.target.value})}
                                >
                                  ${d.map(o=>t`<option value=${o}>
                                        ${E(e,o)}
                                      </option>`)}
                                </select>
                              </label>
                              <label class="field">
                                ${i("Alert to")}
                                <input
                                  .value=${e.form.failureAlertTo}
                                  list="cron-delivery-to-suggestions"
                                  @input=${o=>e.onFormChange({failureAlertTo:o.target.value})}
                                  placeholder="+1555... or chat id"
                                />
                                <div class="cron-help">
                                  Optional recipient override for failure alerts.
                                </div>
                              </label>
                              <label class="field">
                                ${i("Alert mode")}
                                <select
                                  .value=${e.form.failureAlertDeliveryMode||"announce"}
                                  @change=${o=>e.onFormChange({failureAlertDeliveryMode:o.target.value})}
                                >
                                  <option value="announce">Announce (via channel)</option>
                                  <option value="webhook">Webhook (HTTP POST)</option>
                                </select>
                              </label>
                              <label class="field">
                                ${i("Alert account ID")}
                                <input
                                  .value=${e.form.failureAlertAccountId}
                                  @input=${o=>e.onFormChange({failureAlertAccountId:o.target.value})}
                                  placeholder="Account ID for multi-account setups"
                                />
                              </label>
                            `:s}
                    `:s}
              ${v!=="none"?t`
                      <label class="field checkbox cron-checkbox cron-span-2">
                        <input
                          type="checkbox"
                          .checked=${e.form.deliveryBestEffort}
                          @change=${o=>e.onFormChange({deliveryBestEffort:o.target.checked})}
                        />
                        <span class="field-checkbox__label">${n("cron.form.bestEffortDelivery")}</span>
                        <div class="cron-help">${n("cron.form.bestEffortHelp")}</div>
                      </label>
                    `:s}
            </div>
          </details>
        </div>
        ${w?t`
                <div class="cron-form-status" role="status" aria-live="polite">
                  <div class="cron-form-status__title">${n("cron.form.cantAddYet")}</div>
                  <div class="cron-help">${n("cron.form.fillRequired")}</div>
                  <ul class="cron-form-status__list">
                    ${h.map(o=>t`
                        <li>
                          <button
                            type="button"
                            class="cron-form-status__link"
                            @click=${()=>Q(o.inputId)}
                          >
                            ${o.label}: ${n(o.message)}
                          </button>
                        </li>
                      `)}
                  </ul>
                </div>
              `:s}
        <div class="row cron-form-actions">
          <button class="btn primary" ?disabled=${e.busy||!e.canSubmit} @click=${e.onAdd}>
            ${e.busy?n("cron.form.saving"):r?n("cron.form.saveChanges"):n("cron.form.addJob")}
          </button>
          ${C?t`<div class="cron-submit-reason" aria-live="polite">${C}</div>`:s}
          ${r?t`
                  <button class="btn" ?disabled=${e.busy} @click=${e.onCancelEdit}>
                    ${n("cron.form.cancel")}
                  </button>
                `:s}
        </div>
      </section>
    </section>

    ${g("cron-agent-suggestions",e.agentSuggestions)}
    ${g("cron-model-suggestions",e.modelSuggestions)}
    ${g("cron-thinking-suggestions",e.thinkingSuggestions)}
    ${g("cron-tz-suggestions",e.timezoneSuggestions)}
    ${g("cron-delivery-to-suggestions",e.deliveryToSuggestions)}
    ${g("cron-delivery-account-suggestions",e.accountSuggestions)}
  `}function W(e){const r=e.form;return r.scheduleKind==="at"?t`
      <label class="field cron-span-2" style="margin-top: 12px;">
        ${i(n("cron.form.runAt"),!0)}
        <input
          id="cron-schedule-at"
          type="datetime-local"
          .value=${r.scheduleAt}
          aria-invalid=${e.fieldErrors.scheduleAt?"true":"false"}
          aria-describedby=${m(e.fieldErrors.scheduleAt?u("scheduleAt"):void 0)}
          @input=${l=>e.onFormChange({scheduleAt:l.target.value})}
        />
        ${f(e.fieldErrors.scheduleAt,u("scheduleAt"))}
      </label>
    `:r.scheduleKind==="every"?t`
      <div class="form-grid cron-form-grid" style="margin-top: 12px;">
        <label class="field">
          ${i(n("cron.form.every"),!0)}
          <input
            id="cron-every-amount"
            .value=${r.everyAmount}
            aria-invalid=${e.fieldErrors.everyAmount?"true":"false"}
            aria-describedby=${m(e.fieldErrors.everyAmount?u("everyAmount"):void 0)}
            @input=${l=>e.onFormChange({everyAmount:l.target.value})}
            placeholder=${n("cron.form.everyAmountPlaceholder")}
          />
          ${f(e.fieldErrors.everyAmount,u("everyAmount"))}
        </label>
        <label class="field">
          <span>${n("cron.form.unit")}</span>
          <select
            .value=${r.everyUnit}
            @change=${l=>e.onFormChange({everyUnit:l.target.value})}
          >
            <option value="minutes">${n("cron.form.minutes")}</option>
            <option value="hours">${n("cron.form.hours")}</option>
            <option value="days">${n("cron.form.days")}</option>
          </select>
        </label>
      </div>
    `:t`
    <div class="form-grid cron-form-grid" style="margin-top: 12px;">
      <label class="field">
        ${i(n("cron.form.expression"),!0)}
        <input
          id="cron-cron-expr"
          .value=${r.cronExpr}
          aria-invalid=${e.fieldErrors.cronExpr?"true":"false"}
          aria-describedby=${m(e.fieldErrors.cronExpr?u("cronExpr"):void 0)}
          @input=${l=>e.onFormChange({cronExpr:l.target.value})}
          placeholder=${n("cron.form.expressionPlaceholder")}
        />
        ${f(e.fieldErrors.cronExpr,u("cronExpr"))}
      </label>
      <label class="field">
        <span>${n("cron.form.timezoneOptional")}</span>
        <input
          .value=${r.cronTz}
          list="cron-tz-suggestions"
          @input=${l=>e.onFormChange({cronTz:l.target.value})}
          placeholder=${n("cron.form.timezonePlaceholder")}
        />
        <div class="cron-help">${n("cron.form.timezoneHelp")}</div>
      </label>
      <div class="cron-help cron-span-2">${n("cron.form.jitterHelp")}</div>
    </div>
  `}function f(e,r){return e?t`<div id=${m(r)} class="cron-help cron-error">${n(e)}</div>`:s}function V(e,r){const c=`list-item list-item-clickable cron-job${r.runsJobId===e.id?" list-item-selected":""}`,d=a=>{r.onLoadRuns(e.id),a()};return t`
    <div class=${c} @click=${()=>r.onLoadRuns(e.id)}>
      <div class="list-main">
        <div class="list-title">${e.name}</div>
        <div class="list-sub">${H(e)}</div>
        ${G(e)}
        ${e.agentId?t`<div class="muted cron-job-agent">${n("cron.jobDetail.agent")}: ${e.agentId}</div>`:s}
      </div>
      <div class="list-meta">
        ${X(e)}
      </div>
      <div class="cron-job-footer">
        <div class="chip-row cron-job-chips">
          <span class=${`chip ${e.enabled?"chip-ok":"chip-danger"}`}>
            ${e.enabled?n("cron.jobList.enabled"):n("cron.jobList.disabled")}
          </span>
          <span class="chip">${e.sessionTarget}</span>
          <span class="chip">${e.wakeMode}</span>
        </div>
        <div class="row cron-job-actions">
          <button
            class="btn"
            ?disabled=${r.busy}
            @click=${a=>{a.stopPropagation(),d(()=>r.onEdit(e))}}
          >
            ${n("cron.jobList.edit")}
          </button>
          <button
            class="btn"
            ?disabled=${r.busy}
            @click=${a=>{a.stopPropagation(),d(()=>r.onClone(e))}}
          >
            ${n("cron.jobList.clone")}
          </button>
          <button
            class="btn"
            ?disabled=${r.busy}
            @click=${a=>{a.stopPropagation(),d(()=>r.onToggle(e,!e.enabled))}}
          >
            ${e.enabled?n("cron.jobList.disable"):n("cron.jobList.enable")}
          </button>
          <button
            class="btn"
            ?disabled=${r.busy}
            @click=${a=>{a.stopPropagation(),d(()=>r.onRun(e,"force"))}}
          >
            ${n("cron.jobList.run")}
          </button>
          <button
            class="btn"
            ?disabled=${r.busy}
            @click=${a=>{a.stopPropagation(),d(()=>r.onRun(e,"due"))}}
          >
            Run if due
          </button>
          <button
            class="btn"
            ?disabled=${r.busy}
            @click=${a=>{a.stopPropagation(),r.onLoadRuns(e.id)}}
          >
            ${n("cron.jobList.history")}
          </button>
          <button
            class="btn danger"
            ?disabled=${r.busy}
            @click=${a=>{a.stopPropagation(),d(()=>r.onRemove(e))}}
          >
            ${n("cron.jobList.remove")}
          </button>
        </div>
      </div>
    </div>
  `}function G(e){if(e.payload.kind==="systemEvent")return t`<div class="cron-job-detail">
      <span class="cron-job-detail-label">${n("cron.jobDetail.system")}</span>
      <span class="muted cron-job-detail-value">${e.payload.text}</span>
    </div>`;const r=e.delivery,l=r?.mode==="webhook"?r.to?` (${r.to})`:"":r?.channel||r?.to?` (${r.channel??"last"}${r.to?` -> ${r.to}`:""})`:"";return t`
    <div class="cron-job-detail">
      <span class="cron-job-detail-label">${n("cron.jobDetail.prompt")}</span>
      <span class="muted cron-job-detail-value">${e.payload.message}</span>
    </div>
    ${r?t`<div class="cron-job-detail">
            <span class="cron-job-detail-label">${n("cron.jobDetail.delivery")}</span>
            <span class="muted cron-job-detail-value">${r.mode}${l}</span>
          </div>`:s}
  `}function T(e){return typeof e!="number"||!Number.isFinite(e)?n("common.na"):R(e)}function Y(e,r=Date.now()){const l=R(e);return e>r?n("cron.runEntry.next",{rel:l}):n("cron.runEntry.due",{rel:l})}function X(e){const r=e.state?.lastStatus,l=r==="ok"?"cron-job-status-ok":r==="error"?"cron-job-status-error":r==="skipped"?"cron-job-status-skipped":"cron-job-status-na",c=r==="ok"?n("cron.runs.runStatusOk"):r==="error"?n("cron.runs.runStatusError"):r==="skipped"?n("cron.runs.runStatusSkipped"):n("common.na"),d=e.state?.nextRunAtMs,a=e.state?.lastRunAtMs;return t`
    <div class="cron-job-state">
      <div class="cron-job-state-row">
        <span class="cron-job-state-key">${n("cron.jobState.status")}</span>
        <span class=${`cron-job-status-pill ${l}`}>${c}</span>
      </div>
      <div class="cron-job-state-row">
        <span class="cron-job-state-key">${n("cron.jobState.next")}</span>
        <span class="cron-job-state-value" title=${y(d)}>
          ${T(d)}
        </span>
      </div>
      <div class="cron-job-state-row">
        <span class="cron-job-state-key">${n("cron.jobState.last")}</span>
        <span class="cron-job-state-value" title=${y(a)}>
          ${T(a)}
        </span>
      </div>
    </div>
  `}function Z(e){switch(e){case"ok":return n("cron.runs.runStatusOk");case"error":return n("cron.runs.runStatusError");case"skipped":return n("cron.runs.runStatusSkipped");default:return n("cron.runs.runStatusUnknown")}}function ee(e){switch(e){case"delivered":return n("cron.runs.deliveryDelivered");case"not-delivered":return n("cron.runs.deliveryNotDelivered");case"not-requested":return n("cron.runs.deliveryNotRequested");case"unknown":return n("cron.runs.deliveryUnknown");default:return n("cron.runs.deliveryUnknown")}}function ne(e,r){const l=typeof e.sessionKey=="string"&&e.sessionKey.trim().length>0?`${K("chat",r)}?session=${encodeURIComponent(e.sessionKey)}`:null,c=Z(e.status??"unknown"),d=ee(e.deliveryStatus??"not-requested"),a=e.usage,b=a&&typeof a.total_tokens=="number"?`${a.total_tokens} tokens`:a&&typeof a.input_tokens=="number"&&typeof a.output_tokens=="number"?`${a.input_tokens} in / ${a.output_tokens} out`:null;return t`
    <div class="list-item cron-run-entry">
      <div class="list-main cron-run-entry__main">
        <div class="list-title cron-run-entry__title">
          ${e.jobName??e.jobId}
          <span class="muted"> · ${c}</span>
        </div>
        <div class="list-sub cron-run-entry__summary">${e.summary??e.error??n("cron.runEntry.noSummary")}</div>
        <div class="chip-row" style="margin-top: 6px;">
          <span class="chip">${d}</span>
          ${e.model?t`<span class="chip">${e.model}</span>`:s}
          ${e.provider?t`<span class="chip">${e.provider}</span>`:s}
          ${b?t`<span class="chip">${b}</span>`:s}
        </div>
      </div>
      <div class="list-meta cron-run-entry__meta">
        <div>${y(e.ts)}</div>
        ${typeof e.runAtMs=="number"?t`<div class="muted">${n("cron.runEntry.runAt")} ${y(e.runAtMs)}</div>`:s}
        <div class="muted">${e.durationMs??0}ms</div>
        ${typeof e.nextRunAtMs=="number"?t`<div class="muted">${Y(e.nextRunAtMs)}</div>`:s}
        ${l?t`<div><a class="session-link" href=${l}>${n("cron.runEntry.openRunChat")}</a></div>`:s}
        ${e.error?t`<div class="muted">${e.error}</div>`:s}
        ${e.deliveryError?t`<div class="muted">${e.deliveryError}</div>`:s}
      </div>
    </div>
  `}export{re as renderCron};
//# sourceMappingURL=cron-e9zIEjbb.js.map
