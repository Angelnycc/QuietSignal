"""Exercise the self-contained website without a server or API credentials.

Requires Python Playwright and Chromium. Run `bun run build:web` first.
"""
import json
import os
from pathlib import Path
import shutil
from playwright.sync_api import sync_playwright

project = Path(__file__).resolve().parents[1]
document = project / 'dist/index.html'
if not document.exists():
    raise SystemExit('Build the website first with bun run build:web')
artifacts = project / 'dist/website-checks'
artifacts.mkdir(parents=True, exist_ok=True)

with sync_playwright() as playwright:
    executable = os.environ.get('CHROMIUM_EXECUTABLE') or shutil.which('chromium')
    options = {'headless': True, 'args': ['--no-sandbox', '--disable-dev-shm-usage']}
    if executable:
        options['executable_path'] = executable
    browser = playwright.chromium.launch(**options)
    context = browser.new_context(
        viewport={'width': 1440, 'height': 1000},
        timezone_id='America/New_York', reduced_motion='reduce', accept_downloads=True,
    )
    page = context.new_page()
    errors, requests = [], []
    page.on('pageerror', lambda error: errors.append(str(error)))
    page.on('request', lambda request: requests.append(request.url))
    # The managed cloud browser disallows file navigation. Exercise the exact
    # exported HTML contents without changing browser policy.
    page.set_content(document.read_text())
    page.get_by_role('heading', name='Evidence shared with the demo participant').wait_for()
    assert page.locator('#metric-members').inner_text() == '≥ 3'
    assert page.locator('#metric-briefs').inner_text() == '01'
    for label in ['One company, 50 reports', 'Shared destination only', 'Expired evidence', 'Revoked member']:
        page.get_by_role('button', name=label, exact=True).click()
        page.get_by_text('No evidence brief is available under the demo sharing policy.').wait_for()
        assert page.get_by_role('heading', name='No corroborated warning', exact=True).is_visible()
        assert page.locator('#export-brief').is_disabled()
        assert page.locator('#metric-briefs').inner_text() == '00'
    # Disclosure controls withhold both the visible brief and downloadable data.
    page.get_by_role('button', name='Reset demo').click()
    for control in ['consent', 'recipient']:
        page.locator('#' + control).uncheck()
        assert page.locator('#export-brief').is_disabled()
        assert page.locator('#metric-briefs').inner_text() == '00'
        assert 'Disclosure withheld' in page.locator('#explanation').inner_text()
        page.locator('#' + control).check()
        page.get_by_role('heading', name='Evidence shared with the demo participant').wait_for()
    page.get_by_role('button', name='Reset demo').click()
    page.get_by_role('heading', name='Evidence shared with the demo participant').wait_for()
    with page.expect_download() as download:
        page.locator('#export-brief').click()
    exported = json.loads(Path(download.value.path()).read_text())
    assert exported['evidenceBriefs'][0]['synthetic'] is True
    assert exported['evidenceBriefs'][0]['indicator']['value'] == 'relay.supplier-incident.example'
    for withheld in ['demo-alpha', 'collector-alpha', 'demo-event-', 'privateFindings']:
        assert withheld not in json.dumps(exported)
        assert withheld not in document.read_text()

    page.get_by_role('tab', name='What stays out').click()
    assert page.locator('#withheld-panel').is_visible()
    page.get_by_role('tab', name='What stays out').press('ArrowLeft')
    assert page.locator('#shared-panel').is_visible()
    assert page.locator('#shared-tab').get_attribute('aria-selected') == 'true'
    page.get_by_text('Can I explore without an account?', exact=True).click()
    assert page.locator('.faq-list details[open]').count() == 1
    page.get_by_text('Can I explore without an account?', exact=True).click()
    for anchor in page.locator('a[href^="#"]').evaluate_all('(links) => links.map(a => a.getAttribute("href").slice(1))'):
        assert page.locator('[id="' + anchor + '"]').count() == 1, anchor

    page.locator('#toast').wait_for(state='hidden')
    for width in [360, 390, 768, 1024, 1440]:
        page.set_viewport_size({'width': width, 'height': 1000})
        assert not page.evaluate('document.documentElement.scrollWidth > window.innerWidth'), width
    page.evaluate('document.activeElement.blur(); window.scrollTo(0, 0)')
    page.screenshot(path=str(artifacts / 'desktop.png'), full_page=True)
    page.screenshot(path=str(artifacts / 'hero.png'))
    page.set_viewport_size({'width': 390, 'height': 844})
    page.get_by_role('button', name='Menu +', exact=True).click()
    assert page.locator('#primary-nav').is_visible()
    page.keyboard.press('Escape')
    assert page.locator('#menu-toggle').get_attribute('aria-expanded') == 'false'
    page.get_by_role('button', name='Menu +', exact=True).click()
    page.locator('#primary-nav').get_by_role('link', name='Dashboard', exact=True).click()
    assert page.locator('#menu-toggle').get_attribute('aria-expanded') == 'false'
    page.evaluate('document.activeElement.blur(); window.scrollTo(0, 0)')
    page.screenshot(path=str(artifacts / 'mobile.png'), full_page=True)
    assert not errors, errors
    assert not [url for url in requests if url.startswith(('http:', 'https:'))], requests
    browser.close()
print('Website checks passed: five scenarios, evidence export, keyboard tabs, FAQ, anchors, mobile menu, five viewport widths, and zero external network requests.')
