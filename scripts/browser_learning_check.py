"""Exercise built content script in isolated Edge with simulated extension storage.

Requires Python Playwright and installed Edge. All requests are intercepted;
no real career portal, browser profile, or live application is modified.
"""
import json
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
KEY = 'job_autofill_profile_v1'
QUESTIONS = [
    'Werden Sie jetzt oder in Zukunft eine Einwanderungspatenschaft für eine Beschäftigung bei Tesla benötigen?',
    'Ich ermächtige Tesla, mich zusätzlich zu der konkreten Stelle, für die ich mich bewerbe, für andere Stellenangebote innerhalb der nächsten 12 Monate bei Tesla zu berücksichtigen.',
    'Waren Sie schon einmal bei Tesla beschäftigt?',
    'Sind Sie ein ehemaliger Praktikant oder Auftragnehmer?',
    'Sind Sie derzeit Universitätsstudent?',
    'Sind Sie damit einverstanden, während des gesamten Bewerbungsverfahrens Textnachrichten zu empfangen, einschließlich, aber nicht beschränkt auf Einzelheiten zu Vorstellungsgesprächen, Überprüfungen vor der Einstellung und Erinnerungen?',
]
ANSWERS = ['Nein', 'Nein', 'Nein', 'Nein', 'Ja', 'Nein']


def fixture(job, aria=False):
    groups = ''
    for i, question in enumerate(QUESTIONS):
        if aria and i == 4:
            question = 'Are you currently a university student?'
        options = ''
        for label in ['Ja', 'Nein']:
            if aria and i == 4:
                label = 'Yes' if label == 'Ja' else 'No'
            ident = f'{job}-q{i}-{label}'
            if aria:
                options += f'<button type="button" role="radio" aria-checked="false" id="{ident}">{label}</button>'
            else:
                options += f'<div class="tds-form-input-radio"><input style="display:none" type="radio" name="{job}-generated-{i}" id="{ident}" value="{label}"><label for="{ident}">{label}</label></div>'
        groups += f'<div class="tds-form-item" data-q="{i}" role="radiogroup" aria-labelledby="heading-{i}"><p id="heading-{i}">{question}</p><div class="choices">{options}</div></div>'
    return f'''<!doctype html><html lang="de"><meta charset="utf-8"><title>Bewerbung</title><body>
      <h1>Bewerbung</h1><h2>Schritt 2 von 2 Rechtliche Hinweise</h2><form>
      <label for="availability">Wie ist Ihre Verfügbarkeit oder Kündigungsfrist?</label>
      <select id="availability" name="{job}-availability"><option value="">- Bitte auswählen -</option><option value="{job}-now">Unmittelbar</option><option value="{job}-later">In 3 - 4 Wochen</option></select>
      {groups}
      <label><input id="terms" name="{job}-terms" type="checkbox">Ich habe die vorstehenden Ausführungen gelesen und verstanden und akzeptiere sie als Beschäftigungsbedingungen.</label>
      <label for="legalName">Legaler Name</label><input id="legalName" name="legalName">
      <button type="submit">Senden</button></form>
      <script>
      window.submissions=0;
      document.querySelector('form').addEventListener('submit', e=>{{e.preventDefault();window.submissions++}});
      document.addEventListener('change', e=>{{if(e.target.type==='radio')e.target.closest('[data-q]').dataset.answer=e.target.value}});
      document.querySelectorAll('[role=radio]').forEach(r=>r.addEventListener('click',()=>{{
        const group=r.closest('[role=radiogroup]');group.querySelectorAll('[role=radio]').forEach(o=>o.setAttribute('aria-checked',String(o===r)));group.dataset.answer=r.textContent;
      }}));
      </script></body></html>'''


def main():
    storage = {}
    with sync_playwright() as p:
        browser = p.chromium.launch(channel='msedge', headless=True)
        context = browser.new_context()
        context.expose_binding('__read', lambda _source: storage)
        context.expose_binding('__write', lambda _source, items: storage.update(items))
        context.add_init_script('''window.chrome={runtime:{onMessage:{addListener:()=>{}}},storage:{
          onChanged:{addListener:fn=>(window.__storageListeners??=[]).push(fn)},local:{
          get:(_keys,cb)=>window.__read().then(cb),
          set:(items,cb)=>window.__write(items).then(()=>{window.__latestProfile=items.job_autofill_profile_v1;cb();for(const fn of window.__storageListeners||[])fn(Object.fromEntries(Object.entries(items).map(([k,v])=>[k,{newValue:v}])),'local')})
        }}};''')
        errors = []
        page = context.new_page()
        page.on('pageerror', lambda error: errors.append(str(error)))
        context.route('**/*', lambda route: route.fulfill(
            content_type='text/html', body=fixture('third' if 'third' in route.request.url else 'second' if 'second' in route.request.url else 'first', 'generic' in route.request.url)))

        def open_form(url):
            page.goto(url)
            page.add_script_tag(path=str(ROOT / 'dist/content/content.js'))
            page.wait_for_timeout(800)

        open_form('https://www.tesla.com/de_DE/careers/search/job/apply/first')
        assert page.locator('input[type=radio]:checked').count() == 0, 'Never guess unlearned answers'
        for i, answer in enumerate(ANSWERS):
            page.locator(f'label[for="first-q{i}-{answer}"]').click()
        page.locator('#availability').focus()
        page.locator('#availability').press('End')
        page.locator('#availability').press('Tab')
        page.locator('#terms').check()
        page.wait_for_function('()=>(window.__latestProfile?.fieldOverrides||[]).filter(o=>o.manualChoice).length>=8')
        page.wait_for_timeout(700)
        learned_count = len(storage[KEY]['fieldOverrides'])
        assert learned_count >= 8
        # Different generated names/values, same questions, same portal.
        open_form('https://www.tesla.com/de_DE/careers/search/job/apply/second')
        for i, answer in enumerate(ANSWERS):
            page.wait_for_function('(x)=>document.querySelector(`[data-q="${x.i}"]`).dataset.answer===x.answer', arg={'i': i, 'answer': answer})
        assert page.locator('#availability').input_value() == 'second-later'
        assert page.locator('#terms').is_checked(), 'Replay an explicitly chosen checkbox on the same site'
        assert page.locator('#legalName').input_value() == '', 'Memory replay must not run unrelated profile rules'
        assert page.evaluate('window.submissions') == 0
        # Multi-step portals can replace their form without changing the URL.
        # The dropdown's choices may load after the rest of the step.
        page.evaluate('''html=>{
          const next=new DOMParser().parseFromString(html,'text/html').querySelector('form');
          document.querySelector('form').innerHTML=next.innerHTML;
          const select=document.querySelector('#availability');
          const delayed=Array.from(select.options).slice(1).map(o=>o.outerHTML).join('');
          while(select.options.length>1)select.remove(1);
          setTimeout(()=>select.insertAdjacentHTML('beforeend',delayed),1400);
        }''', fixture('same-step'))
        for i, answer in enumerate(ANSWERS):
            page.wait_for_function('(x)=>document.querySelector(`[data-q="${x.i}"]`).dataset.answer===x.answer', arg={'i': i, 'answer': answer})
        page.wait_for_function('()=>document.querySelector("#availability").value==="same-step-later"')
        # A different portal renders the same questions as custom ARIA controls.
        open_form('https://generic.example.test/application/third')
        for i, answer in enumerate(ANSWERS):
            if i == 4:
                answer = 'Yes'
            page.wait_for_function('(x)=>document.querySelector(`[data-q="${x.i}"]`).dataset.answer===x.answer', arg={'i': i, 'answer': answer})
        assert page.locator('#availability').input_value() == 'third-later'
        assert not page.locator('#terms').is_checked(), 'Consent is not transferred between sites'
        # A fresh manual correction supersedes the old answer and survives revisiting.
        page.locator('#third-q4-No').click()
        page.wait_for_function('()=>window.__latestProfile?.customQA.some(q=>q.question.includes("currently a university student")&&q.answer==="No")')
        open_form('https://generic.example.test/application/third?revisit=1')
        page.wait_for_function('()=>document.querySelector("[data-q=\'4\']").dataset.answer==="No"')
        storage[KEY]['settings']['reuseLearnedAnswers'] = False
        open_form('https://generic.example.test/application/third?paused=1')
        assert page.locator('[role=radio][aria-checked=true]').count() == 0
        assert len(storage[KEY]['fieldOverrides']) >= learned_count
        page.evaluate('''async()=>{
          const items=await window.__read();items.job_autofill_profile_v1.settings.reuseLearnedAnswers=true;
          chrome.storage.local.set(items,()=>{});
        }''')
        page.wait_for_function('()=>document.querySelector("[data-q=\'4\']").dataset.answer==="No"')
        assert page.evaluate('window.submissions') == 0
        assert not errors, errors
        print(json.dumps({'result': 'passed', 'remembered_site_choices': learned_count,
            'checks': ['hidden native radios', 'long questions', 'Tesla adapter overridden by own choices',
                       'changed generated IDs', 'changed option values', 'automatic replay with general autofill off',
                       'same-URL step transition', 'delayed dropdown options', 'cross-portal ARIA radio replay', 'bilingual student question/options',
                       'manual correction retained', 'pause/resume without losing memory', 'site-only explicit checkbox', 'no submission']}, indent=2))
        context.close()
        browser.close()


if __name__ == '__main__':
    main()
