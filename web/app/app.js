'use strict'
const state = { session: null, view: 'incidents', incidents: [], selected: null, busy: false }
const $ = (id) => document.getElementById(id)
const node = (tag, className, text) => {
  const e = document.createElement(tag)
  if (className) e.className = className
  if (text !== undefined) e.textContent = String(text)
  return e
}
const date = (value) =>
  new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZoneName: 'short',
  }).format(new Date(value))
let toastTimer,
  renderVersion = 0
function syncNavigation() {
  document
    .querySelectorAll('[data-view]')
    .forEach((b) => b.classList.toggle('active', b.dataset.view === state.view))
  $('page-title').textContent = {
    incidents: 'Incident workspace',
    collectors: 'Registered collectors',
    policies: 'Sharing policy',
    audit: 'Audit trail',
  }[state.view]
}
function toast(message, error = false) {
  $('toast').textContent = message
  $('toast').className = 'toast' + (error ? ' error' : '')
  $('toast').hidden = false
  clearTimeout(toastTimer)
  toastTimer = setTimeout(() => ($('toast').hidden = true), 4500)
}
function showLogin() {
  renderVersion++
  state.view = 'incidents'
  syncNavigation()
  state.session = null
  state.incidents = []
  state.selected = null
  $('workspace-view').hidden = true
  $('login-view').hidden = false
  $('page-content').replaceChildren()
  $('access-token').value = ''
  $('access-file').value = ''
}
async function api(path, method = 'GET', body) {
  const headers = {}
  if (body !== undefined) headers['Content-Type'] = 'application/json'
  if (method !== 'GET' && state.session) headers['X-QS-CSRF'] = state.session.csrf
  const response = await fetch('/api/pilot' + path, {
    method,
    headers,
    credentials: 'same-origin',
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  const result = await response.json()
  if (!response.ok) {
    if (response.status === 401) showLogin()
    throw new Error(result.error?.message || 'Workspace request failed')
  }
  return result
}
function download(value, name) {
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(value, null, 2)], { type: 'application/json' })
  )
  const a = node('a')
  a.href = url
  a.download = name
  document.body.append(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
function button(text, handler, primary = false) {
  const b = node('button', primary ? 'primary' : 'secondary', text)
  b.type = 'button'
  b.addEventListener('click', async () => {
    b.disabled = true
    try {
      await handler()
    } catch (e) {
      toast(e.message, true)
    } finally {
      b.disabled = false
    }
  })
  return b
}
function panel(title, description) {
  const box = node('section', 'panel')
  const head = node('div', 'panel-title')
  const copy = node('div')
  copy.append(node('h2', '', title))
  if (description) copy.append(node('p', '', description))
  head.append(copy)
  box.append(head)
  return box
}
function setView(name) {
  state.view = name
  state.selected = null
  document
    .querySelectorAll('[data-view]')
    .forEach((b) => b.classList.toggle('active', b.dataset.view === name))
  $('page-title').textContent = {
    incidents: 'Incident workspace',
    collectors: 'Registered collectors',
    policies: 'Sharing policy',
    audit: 'Audit trail',
  }[name]
  loadView().catch((e) => toast(e.message, true))
}
async function loadSession() {
  const session = await api('/session')
  if (!session.authenticated) {
    showLogin()
    return
  }
  state.session = session
  $('login-view').hidden = true
  $('workspace-view').hidden = false
  $('role-label').textContent =
    session.role === 'operator' ? 'LOCAL WORKSPACE OPERATOR' : 'PARTICIPANT WORKSPACE'
  $('identity').textContent =
    session.role === 'operator' ? 'Operator preview' : session.organization.name
  document
    .querySelectorAll('.operator-only')
    .forEach((e) => (e.hidden = session.role !== 'operator'))
  if (session.role !== 'operator' && state.view === 'collectors') state.view = 'incidents'
  syncNavigation()
  await loadView()
}
async function loadView() {
  if (!state.session) return
  const version = ++renderVersion
  const root = node('div')
  $('page-content').classList.add('loading')
  try {
    if (state.view === 'incidents') await renderIncidents(root)
    else if (state.view === 'collectors') await renderCollectors(root)
    else if (state.view === 'policies') await renderPolicies(root)
    else if (state.view === 'audit') await renderAudit(root)
    if (version === renderVersion && state.session)
      $('page-content').replaceChildren(...root.childNodes)
  } finally {
    if (version === renderVersion) $('page-content').classList.remove('loading')
  }
}
async function renderIncidents(root) {
  const result = await api('/incidents')
  state.incidents = result.incidents
  root.replaceChildren()
  const stats = node('div', 'stat-grid')
  for (const [label, value, note] of [
    ['Available briefs', result.incidents.length, 'Current evidence permissions'],
    [
      'Review scope',
      result.operatorPreview ? 'Preview' : 'Your org',
      result.operatorPreview
        ? 'Operator preview of releasable evidence'
        : 'Authenticated participant',
    ],
    ['Collector checks', 'Ed25519', 'Registered-key authentication'],
  ]) {
    const card = node('div', 'stat')
    card.append(node('span', '', label), node('strong', '', value), node('p', '', note))
    stats.append(card)
  }
  root.append(stats)
  const grid = node('div', 'incident-layout')
  const list = panel('Incident feed', 'Only currently releasable, unexpired evidence appears here.')
  const detail = node('section', 'panel detail')
  detail.id = 'incident-detail'
  grid.append(list, detail)
  root.append(grid)
  if (!result.incidents.length) {
    list.append(
      node(
        'p',
        'empty',
        'No distributable incident is currently supported. An operator can start a controlled run. Expired evidence, consent changes, and revoked collectors can remove a brief from this feed.'
      )
    )
    detail.append(
      node('h2', '', 'Your evidence boundary is active'),
      node(
        'p',
        'empty',
        'No full logs or contributor identities are returned to this participant view.'
      )
    )
    return
  }
  for (const incident of result.incidents) {
    const row = node('button', 'incident-item')
    row.type = 'button'
    row.setAttribute(
      'aria-label',
      'Open incident ' + incident.brief.supplier.name + ' ' + incident.brief.supplier.version
    )
    row.append(
      node(
        'span',
        'pill',
        incident.reviewStatus === 'acknowledged' ? 'ACKNOWLEDGED' : 'NEEDS INVESTIGATION'
      ),
      node('h3', '', incident.brief.supplier.name + ' ' + incident.brief.supplier.version),
      node('p', '', incident.brief.indicator.value),
      node(
        'div',
        'subtle',
        'At least ' +
          incident.brief.corroboration.organizationsAtLeast +
          ' organizations · evidence expires ' +
          date(incident.brief.expiresAtMs)
      )
    )
    row.addEventListener('click', async () => {
      try {
        state.selected = incident.id
        const response = await api('/incidents/' + incident.id)
        if (state.view !== 'incidents' || state.selected !== incident.id || !detail.isConnected)
          return
        await showDetail(detail, response.incident)
        list
          .querySelectorAll('.incident-item')
          .forEach((r) => r.classList.toggle('selected', r === row))
      } catch (e) {
        toast(e.message, true)
        await loadView()
      }
    })
    list.append(row)
  }
  const selected = result.incidents.find((i) => i.id === state.selected) || result.incidents[0]
  state.selected = selected.id
  await showDetail(detail, selected)
}
async function showDetail(root, incident) {
  root.replaceChildren()
  root.append(
    node(
      'div',
      'eyebrow',
      incident.operatorPreview
        ? 'OPERATOR PREVIEW · SYNTHETIC EVIDENCE'
        : 'APPROVED PARTICIPANT EVIDENCE'
    ),
    node('h2', '', incident.brief.supplier.name + ' ' + incident.brief.supplier.version),
    node('code', '', incident.id)
  )
  const b = incident.brief
  const rows = [
    ['Indicator', b.indicator.value],
    ['Pattern', 'Update → new outbound destination → unusual child process'],
    [
      'Corroboration',
      'At least ' +
        b.corroboration.organizationsAtLeast +
        ' organizations; at least ' +
        b.corroboration.sequenceOrganizationsAtLeast +
        ' supporting sequences',
    ],
    ['Search window', date(b.correlationWindow.startMs) + ' – ' + date(b.correlationWindow.endMs)],
    ['Collector check', incident.collectorVerification],
    ['Assessment', 'Corroborated investigation lead. Maliciousness is not established.'],
    ['Evidence expiry', date(b.expiresAtMs)],
    ['Review', incident.reviewStatus],
  ]
  const dl = node('dl')
  for (const [label, value] of rows) dl.append(node('dt', '', label), node('dd', '', value))
  root.append(
    dl,
    node(
      'p',
      'privacy-note',
      'Contributor identities, full logs, exact source-event times, and unrelated activity are omitted. Downloaded evidence cannot be recalled from a recipient’s device.'
    )
  )
  const actions = node('div', 'detail-actions')
  if (incident.reviewStatus !== 'acknowledged')
    actions.append(
      button(
        'Acknowledge incident',
        async () => {
          await api('/incidents/' + incident.id + '/acknowledge', 'POST', {})
          toast('Incident acknowledged for your workspace')
          await loadView()
        },
        true
      )
    )
  actions.append(
    button('Download evidence brief', async () => {
      const evidence = await api('/incidents/' + incident.id + '/download')
      download(evidence, 'quietsignal-pilot-brief.json')
      toast('Approved fictional brief downloaded')
    })
  )
  root.append(actions)
}
async function renderCollectors(root) {
  const [result, members] = await Promise.all([api('/collectors'), api('/members')])
  root.replaceChildren()
  const box = panel(
    'Collector registry',
    'Public keys bind each collector to one enrolled organization. Private keys never appear in this response.'
  )
  const wrap = node('div', 'table-wrap')
  const table = node('table')
  const head = node('tr')
  for (const name of ['Collector', 'Organization', 'Public-key fingerprint', 'State', 'Action'])
    head.append(node('th', '', name))
  table.append(head)
  for (const collector of result.collectors) {
    const row = node('tr')
    row.append(
      node('td', '', collector.id),
      node('td', '', collector.organization_id),
      node('td', '', collector.fingerprint),
      node('td', '', collector.active ? 'Active' : 'Revoked')
    )
    const cell = node('td')
    cell.append(
      button(collector.active ? 'Revoke collector' : 'Restore collector', async () => {
        await api('/collectors/' + collector.id, 'PATCH', { active: !collector.active })
        toast('Collector registry updated')
        await loadView()
      })
    )
    row.append(cell)
    table.append(row)
  }
  wrap.append(table)
  box.append(wrap)
  root.append(box)
  const formBox = panel(
    'Register an external test collector',
    'Only an operator can register a key. Supply a base64 SPKI Ed25519 public key; never upload a private key.'
  )
  const form = node('form', 'form-grid')
  const idInput = node('input')
  idInput.required = true
  idInput.pattern = '[a-z][a-z0-9-]{0,63}'
  idInput.placeholder = 'collector-lab'
  const org = node('select')
  for (const member of members.members) {
    const option = node('option', '', member.name)
    option.value = member.id
    org.append(option)
  }
  const key = node('textarea')
  key.required = true
  key.placeholder = 'Base64 Ed25519 public key'
  for (const [labelText, input, wide] of [
    ['Collector ID', idInput, false],
    ['Organization', org, false],
    ['Public key', key, true],
  ]) {
    const label = node('label', wide ? 'wide' : '', labelText)
    label.append(input)
    form.append(label)
  }
  const submit = node('button', 'primary', 'Register public key')
  submit.type = 'submit'
  form.append(submit)
  form.addEventListener('submit', async (e) => {
    e.preventDefault()
    submit.disabled = true
    try {
      await api('/collectors', 'POST', {
        id: idInput.value,
        organizationId: org.value,
        publicKey: key.value.trim(),
      })
      toast('Collector registered')
      await loadView()
    } catch (error) {
      toast(error.message, true)
    } finally {
      submit.disabled = false
    }
  })
  formBox.append(form)
  root.append(formBox)
}
async function renderPolicies(root) {
  root.replaceChildren()
  if (state.session.role === 'participant') {
    const { organization } = await api('/profile')
    const box = panel(
      'Your organization’s evidence-sharing consent',
      'This controls whether your evidence can support a released member brief. It does not disable aggregate processing.'
    )
    const label = node('label', 'consent-toggle')
    const check = node('input')
    check.type = 'checkbox'
    check.checked = !!organization.sharing
    label.append(
      check,
      document.createTextNode('Allow my organization’s evidence in approved consortium briefs')
    )
    box.append(
      label,
      button(
        'Save sharing preference',
        async () => {
          await api('/consent', 'POST', { shareEvidence: check.checked })
          toast('Your sharing consent was updated')
        },
        true
      )
    )
    root.append(box)
    return
  }
  const [result, policies] = await Promise.all([api('/members'), api('/policy')])
  const box = panel(
    'Enrollment & member consent',
    'Enrollment is issued by the local operator. It does not independently verify that a test identity is a real business.'
  )
  const cards = node('div', 'member-grid')
  for (const member of result.members) {
    const card = node('article', 'member-card')
    card.append(node('h3', '', member.name), node('code', '', member.id))
    const active = node('input')
    active.type = 'checkbox'
    active.checked = !!member.active
    const sharing = node('input')
    sharing.type = 'checkbox'
    sharing.checked = !!member.sharing
    for (const [text, input] of [
      ['Membership active', active],
      ['Evidence sharing permitted', sharing],
    ]) {
      const label = node('label', 'check')
      label.append(input, document.createTextNode(text))
      card.append(label)
    }
    const actions = node('div', 'actions')
    actions.append(
      button(
        'Save policy',
        async () => {
          await api('/members/' + member.id, 'PATCH', {
            active: active.checked,
            sharing: sharing.checked,
          })
          toast('Member policy updated')
          await loadView()
        },
        true
      ),
      button('Issue access file', async () => {
        const credential = await api('/members/' + member.id + '/access', 'POST', {})
        download(credential, member.id + '-access.json')
        toast('Private participant access file issued. Keep it secure.')
      }),
      button('Revoke access files', async () => {
        await api('/members/' + member.id + '/revoke-access', 'POST', {})
        toast('Participant keys and sessions revoked')
      })
    )
    card.append(actions)
    cards.append(card)
  }
  box.append(cards)
  root.append(box)
  const register = panel(
    'Enroll a test organization',
    'New members begin with evidence sharing disabled.'
  )
  const memberForm = node('form', 'form-grid')
  const memberId = node('input')
  memberId.required = true
  memberId.placeholder = 'demo-delta'
  memberId.pattern = '[a-z][a-z0-9-]{0,63}'
  const memberName = node('input')
  memberName.required = true
  memberName.placeholder = 'Test organization delta'
  for (const [text, input] of [
    ['Organization ID', memberId],
    ['Display name', memberName],
  ]) {
    const label = node('label', '', text)
    label.append(input)
    memberForm.append(label)
  }
  const memberSubmit = node('button', 'primary', 'Enroll organization')
  memberSubmit.type = 'submit'
  memberForm.append(memberSubmit)
  memberForm.addEventListener('submit', async (e) => {
    e.preventDefault()
    try {
      await api('/members', 'POST', { id: memberId.value, name: memberName.value })
      toast('Test organization enrolled')
      await loadView()
    } catch (error) {
      toast(error.message, true)
    }
  })
  register.append(memberForm)
  root.append(register)
  const release = panel(
    'Evidence release allowlist',
    'Only the approved domains, software versions, and recipients can contribute to a delivered brief. Changes are effective on the next request.'
  )
  const form = node('form', 'form-grid')
  const domains = node('textarea')
  domains.value = policies.disclosure.approvedDomains.join('\n')
  const recipients = node('textarea')
  recipients.value = policies.disclosure.recipients.join('\n')
  for (const [labelText, input] of [
    ['Approved domains (one per line)', domains],
    ['Eligible organization IDs (one per line)', recipients],
  ]) {
    const label = node('label', '', labelText)
    label.append(input)
    form.append(label)
  }
  const save = node('button', 'primary', 'Apply disclosure policy')
  save.type = 'submit'
  form.append(save)
  form.addEventListener('submit', async (e) => {
    e.preventDefault()
    save.disabled = true
    try {
      const split = (value) =>
        value
          .split(/\r?\n/)
          .map((s) => s.trim())
          .filter(Boolean)
      await api('/policy', 'PUT', {
        ...policies.disclosure,
        version: 'pilot-policy-' + crypto.randomUUID(),
        approvedDomains: split(domains.value),
        recipients: split(recipients.value),
      })
      toast('Disclosure policy applied')
      await loadView()
    } catch (error) {
      toast(error.message, true)
    } finally {
      save.disabled = false
    }
  })
  release.append(form)
  root.append(release)
}
async function renderAudit(root) {
  const result = await api('/audit')
  root.replaceChildren()
  const box = panel(
    'Local audit trail',
    'A hash-linked record of pilot actions. It is not externally anchored and cannot prevent a database owner from rewriting history.'
  )
  box.append(
    node(
      'p',
      'audit-integrity',
      result.integrity.valid
        ? 'Hash chain intact · ' + result.integrity.eventCount + ' recorded actions'
        : 'Audit integrity check failed'
    )
  )
  const wrap = node('div', 'table-wrap')
  const table = node('table')
  const head = node('tr')
  for (const label of ['Recorded', 'Action', 'Scope', 'Target']) head.append(node('th', '', label))
  table.append(head)
  for (const event of result.events) {
    const row = node('tr')
    row.append(
      node('td', '', date(event.at)),
      node('td', 'audit-action', event.action),
      node('td', '', event.actor || 'Your actions'),
      node('td', 'audit-target', event.target || '—')
    )
    table.append(row)
  }
  wrap.append(table)
  box.append(wrap)
  root.append(box)
}
$('login-form').addEventListener('submit', async (event) => {
  event.preventDefault()
  $('login-error').textContent = ''
  const submit = $('login-form').querySelector('button')
  submit.disabled = true
  try {
    let token = $('access-token').value
    const file = $('access-file').files[0]
    if (file) {
      if (file.size > 4096) throw new Error('Access file is too large')
      const access = JSON.parse(await file.text())
      token = access.accessToken
    }
    if (typeof token !== 'string' || token.length < 32)
      throw new Error('Choose a valid local access file')
    await api('/login', 'POST', { accessToken: token })
    $('access-token').value = ''
    $('access-file').value = ''
    await loadSession()
  } catch (error) {
    $('login-error').textContent =
      error instanceof SyntaxError ? 'The access file is not valid JSON' : error.message
  } finally {
    submit.disabled = false
  }
})
$('run-form').addEventListener('submit', async (event) => {
  event.preventDefault()
  if (state.busy) return
  state.busy = true
  const submit = $('run-form').querySelector('button')
  submit.disabled = true
  $('run-result').textContent = 'Submitting signed controlled observations…'
  try {
    const result = await api('/simulate', 'POST', {
      scenario: $('scenario').value,
      resetTestMembership: $('reset-members').checked,
    })
    $('run-result').textContent =
      result.accepted +
      ' admitted · ' +
      result.rejected +
      ' rejected · ' +
      result.duplicates +
      ' idempotent retries. Earlier runs remain in local storage.'
    state.view = 'incidents'
    syncNavigation()
    await loadView()
    toast('Controlled run completed')
  } catch (error) {
    $('run-result').textContent = error.message
    toast(error.message, true)
  } finally {
    state.busy = false
    submit.disabled = false
  }
})
$('refresh').addEventListener('click', () =>
  loadSession().catch((error) => toast(error.message, true))
)
$('logout').addEventListener('click', async () => {
  try {
    await api('/logout', 'POST', {})
  } finally {
    showLogin()
  }
})
document
  .querySelectorAll('[data-view]')
  .forEach((button) => button.addEventListener('click', () => setView(button.dataset.view)))
document.addEventListener('visibilitychange', () => {
  if (!document.hidden && state.session && !state.busy && state.view === 'incidents')
    loadSession().catch((error) => toast(error.message, true))
})
setInterval(() => {
  if (!document.hidden && state.session && !state.busy && state.view === 'incidents')
    loadView().catch((error) => toast(error.message, true))
}, 15000)
loadSession().catch((error) => {
  $('login-error').textContent = error.message
})
