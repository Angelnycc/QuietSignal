"""Actual HTTP/browser coverage against disposable, generated test credentials."""
import json
import os
import shutil
import sys
from pathlib import Path
from playwright.sync_api import sync_playwright, expect

origin, access_file, temporary = sys.argv[1:]
output = Path('dist/pilot-checks')
output.mkdir(parents=True, exist_ok=True)
errors, violations = [], []

with sync_playwright() as p:
    options = {'headless': True, 'args': ['--no-sandbox', '--disable-dev-shm-usage']}
    executable = os.environ.get('CHROMIUM_EXECUTABLE') or shutil.which('chromium')
    if executable:
        options['executable_path'] = executable
    browser = p.chromium.launch(**options)
    context = browser.new_context(viewport={'width': 1440, 'height': 1080}, timezone_id='America/New_York', reduced_motion='reduce', accept_downloads=True)
    page = context.new_page()
    page.on('pageerror', lambda error: errors.append(str(error)))
    page.on('console', lambda message: violations.append(message.text) if 'Content Security Policy' in message.text else None)
    page.goto(origin + '/')
    expect(page.locator('#metric-briefs')).to_have_text('01')
    page.get_by_role('link', name='Open workspace', exact=True).click()
    expect(page.get_by_role('heading', name='Enter your evidence workspace.')).to_be_visible()
    page.locator('#access-file').set_input_files(access_file)
    page.get_by_role('button', name='Open workspace').click()
    expect(page.get_by_role('heading', name='Incident workspace', exact=True)).to_be_visible()
    expect(page.get_by_text('No distributable incident is currently supported.', exact=False)).to_be_visible()

    for scenario, count in [('correlated', 1), ('duplicate-reports', 0), ('benign-overlap', 0), ('expired', 0), ('revoked-member', 0), ('correlated', 1)]:
        page.locator('#scenario').select_option(scenario)
        page.get_by_role('button', name='Start controlled run').click()
        expect(page.locator('#run-result')).to_contain_text('admitted')
        expect(page.locator('.incident-item')).to_have_count(count)
    expect(page.locator('#run-result')).to_contain_text('3 admitted · 0 rejected')
    page.get_by_role('button', name='Acknowledge incident').click()
    expect(page.locator('.incident-item .pill')).to_have_text('ACKNOWLEDGED')
    with page.expect_download() as info:
        page.get_by_role('button', name='Download evidence brief').click()
    brief = json.loads(Path(info.value.path()).read_text())
    assert brief['synthetic'] is True
    text = json.dumps(brief)
    assert 'relay.supplier-incident.example' in text
    assert all(value not in text for value in ['demo-alpha', 'demo-bravo', 'collector-alpha', 'eventId'])
    page.locator('#toast').wait_for(state='hidden')
    page.evaluate('scrollTo(0, 0)')
    page.screenshot(path=str(output / 'workspace-desktop.png'), full_page=True)

    page.get_by_role('button', name='Sharing policy', exact=False).click()
    expect(page.get_by_role('heading', name='Enrollment & member consent')).to_be_visible()
    charlie = page.locator('.member-card').filter(has=page.get_by_text('demo-charlie', exact=True))
    charlie.get_by_role('checkbox', name='Evidence sharing permitted').uncheck()
    charlie.get_by_role('button', name='Save policy', exact=True).click()
    expect(page.locator('#toast')).to_have_text('Member policy updated')
    page.get_by_role('button', name='Incidents', exact=False).click()
    expect(page.locator('.incident-item')).to_have_count(0)
    page.get_by_role('button', name='Sharing policy', exact=False).click()
    charlie = page.locator('.member-card').filter(has=page.get_by_text('demo-charlie', exact=True))
    charlie.get_by_role('checkbox', name='Evidence sharing permitted').check()
    charlie.get_by_role('button', name='Save policy', exact=True).click()
    expect(page.locator('#toast')).to_have_text('Member policy updated')
    alpha = page.locator('.member-card').filter(has=page.get_by_text('demo-alpha', exact=True))
    with page.expect_download() as info:
        alpha.get_by_role('button', name='Issue access file').click()
    participant_file = Path(temporary) / 'participant-test-access.json'
    info.value.save_as(participant_file)

    # The policy form must survive background polling and browser tab switches.
    domains = page.get_by_role('textbox', name='Approved domains (one per line)')
    domains.fill('unsaved.example')
    page.evaluate("document.dispatchEvent(new Event('visibilitychange'))")
    expect(domains).to_have_value('unsaved.example')

    page.get_by_role('button', name='Collectors', exact=False).click()
    collector = page.get_by_role('row').filter(has=page.get_by_text('collector-charlie', exact=True))
    collector.get_by_role('button', name='Revoke collector').click()
    expect(collector.get_by_role('button', name='Restore collector')).to_be_visible()
    page.get_by_role('button', name='Incidents', exact=False).click()
    expect(page.locator('.incident-item')).to_have_count(0)
    page.get_by_role('button', name='Collectors', exact=False).click()
    page.get_by_role('row').filter(has=page.get_by_text('collector-charlie', exact=True)).get_by_role('button', name='Restore collector').click()
    page.get_by_role('button', name='Audit trail', exact=False).click()
    expect(page.get_by_text('Local audit trail', exact=True)).to_be_visible()
    expect(page.locator('.audit-integrity')).to_contain_text('Hash chain intact')
    page.get_by_role('button', name='Incidents', exact=False).click()
    expect(page.locator('.incident-item')).to_have_count(1)

    participant = browser.new_context(viewport={'width': 390, 'height': 844}, timezone_id='America/New_York', reduced_motion='reduce')
    member = participant.new_page()
    member.on('pageerror', lambda error: errors.append(str(error)))
    member.goto(origin + '/app')
    member.locator('#access-file').set_input_files(participant_file)
    member.get_by_role('button', name='Open workspace').click()
    expect(member.locator('.incident-item')).to_have_count(1)
    expect(member.get_by_role('button', name='Collectors', exact=False)).not_to_be_visible()
    expect(member.locator('#run-controls')).not_to_be_visible()
    expect(member.locator('.incident-item .pill')).to_have_text('NEEDS INVESTIGATION')
    member.screenshot(path=str(output / 'workspace-mobile.png'), full_page=True)
    assert member.evaluate('document.documentElement.scrollWidth <= innerWidth')
    blocked = member.request.get(origin + '/api/pilot/members')
    assert blocked.status == 403
    member.get_by_role('button', name='Sharing policy', exact=False).click()
    member.get_by_role('checkbox', name='Allow my organization’s evidence in approved consortium briefs').uncheck()
    member.get_by_role('button', name='Save sharing preference').click()
    expect(member.locator('#toast')).to_have_text('Your sharing consent was updated')
    page.get_by_role('button', name='Refresh', exact=True).click()
    expect(page.locator('.incident-item')).to_have_count(0)
    member.get_by_role('button', name='Audit trail', exact=False).click()
    expect(member.locator('.audit-integrity')).to_contain_text('Hash chain intact')
    assert 'demo-bravo' not in member.locator('#page-content').inner_text()
    member.get_by_role('button', name='Sign out', exact=True).click()
    expect(member.locator('#login-form')).to_be_visible()
    assert member.request.get(origin + '/api/pilot/incidents').status == 401

    for width in [360, 390, 768, 1024, 1440]:
        page.set_viewport_size({'width': width, 'height': 1000})
        assert page.evaluate('document.documentElement.scrollWidth <= innerWidth'), f'overflow at {width}'
    assert not errors, errors
    assert not violations, violations
    browser.close()
print('Pilot browser checks passed: real HTTP, five signed scenarios, review/download, consent, collector revocation, participant isolation, audit, sign-out, responsive layout and CSP.')
