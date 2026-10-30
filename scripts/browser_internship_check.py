"""Regression for the reported internship step; uses isolated Edge and fake storage.

All URLs are intercepted locally. No live application or personal profile is used.
"""
import json
from playwright.sync_api import sync_playwright
from browser_learning_check import ROOT, KEY, fixture


def internship_fixture(job, custom=False):
    def dropdown(ident, question, options):
        if not custom:
            choices = ''.join(f'<option value="{job}-{ident}-{i}">{text}</option>' for i, text in enumerate(options))
            control = f'<select id="{ident}" name="{job}-{ident}"><option value="">- Bitte auswählen -</option>{choices}</select>'
        else:
            choices = ''.join(f'<div role="option" data-value="{job}-{ident}-{i}" tabindex="0">{text}</div>' for i, text in enumerate(options))
            control = f'<button type="button" id="{ident}" name="{job}-{ident}" role="combobox" aria-haspopup="listbox" aria-controls="{ident}-options" aria-expanded="false">- Bitte auswählen -</button><div role="listbox" id="{ident}-options" hidden>{choices}</div>'
        return f'<div class="tds-form-item"><label for="{ident}">{question}</label>{control}</div>'
    return f'''<!doctype html><html lang="de"><meta charset="utf-8"><title>Bewerbung</title><body>
      <nav>Stellenangebote erkunden Search jobs</nav><h1>Bewerbung</h1>
      <p>Machine Learning Intern, Generative SI Applications</p><h2>Schritt 2 von 3 Berufserfahrung</h2>
      <form><div class="tds-form-item"><label for="intern-start">Wann stehen Sie für ein Praktikum zur Verfügung?</label>
      <input type="date" id="intern-start" name="{job}-start_date" value="2026-10-30"></div>
      {dropdown('months', 'Wie viele Monate stehen Ihnen für ein Praktikum zur Verfügung?', ['3 Monate', '6 Monate'])}
      {dropdown('schedule', 'Sind Sie für ein Praktikum als Voll- oder Teilzeitkraft verfügbar?', ['Vollzeit', 'Teilzeit'])}
      <div class="tds-form-item"><p>Müssen Sie im Rahmen Ihres Praktikums eine Abschlussarbeit oder einen Bericht für Ihre Hochschule schreiben?</p>
      <div><label><input type="radio" name="{job}-thesis" id="thesis-yes" value="yes">Ja</label>
      <label><input type="radio" name="{job}-thesis" id="thesis-no" value="no">Nein</label></div></div>
      {dropdown('source', 'Wie haben Sie von uns erfahren?', ['LinkedIn', 'Andere'])}
      <button type="button" id="next">Weiter</button></form><script>
      window.submissions=0;
      document.querySelector('form').addEventListener('submit',e=>{{e.preventDefault();window.submissions++}});
      document.querySelectorAll('[role=combobox]').forEach(trigger=>{{
        const list=document.getElementById(trigger.getAttribute('aria-controls'));
        trigger.addEventListener('click',()=>{{list.hidden=!list.hidden;trigger.setAttribute('aria-expanded',String(!list.hidden))}});
        list.querySelectorAll('[role=option]').forEach(option=>option.addEventListener('click',()=>{{trigger.textContent=option.textContent;trigger.dataset.value=option.dataset.value;list.hidden=true;trigger.setAttribute('aria-expanded','false')}}));
      }});
      </script></body></html>'''


def main():
    checks = []
    with sync_playwright() as p:
        browser = p.chromium.launch(channel='msedge', headless=True)
        for custom in (False, True):
            mode = 'custom' if custom else 'native'
            storage, errors = {}, []
            context = browser.new_context()
            context.expose_binding('__read', lambda _source: storage)
            context.expose_binding('__write', lambda _source, items: storage.update(items))
            context.add_init_script('''window.chrome={runtime:{onMessage:{addListener:fn=>(window.__handlers??=[]).push(fn)}},storage:{
              onChanged:{addListener:fn=>(window.__storageListeners??=[]).push(fn)},local:{
              get:(_keys,cb)=>window.__read().then(cb),
              set:(items,cb)=>window.__write(items).then(()=>{window.__latestProfile=items.job_autofill_profile_v1;cb();for(const fn of window.__storageListeners||[])fn(Object.fromEntries(Object.entries(items).map(([k,v])=>[k,{newValue:v}])),'local')})
            }}};''')
            context.route('**/*', lambda route: route.fulfill(content_type='text/html', body=fixture('seed')
                if 'seed' in route.request.url else internship_fixture('intern-second' if 'second' in route.request.url else 'intern-first', custom)))
            page = context.new_page()
            page.set_default_timeout(10000)
            page.on('pageerror', lambda error: errors.append(str(error)))

            def open_form(slug):
                page.goto('https://www.tesla.com/de_DE/careers/search/job/apply/' + slug)
                page.add_script_tag(path=str(ROOT / 'dist/content/content.js'))
                page.wait_for_timeout(800)

            open_form('seed')
            preserved_qa = {'id': 'existing-knowledge', 'question': 'Existing saved question', 'answer': 'Keep this answer', 'keywords': ['existing']}
            storage[KEY]['customQA'].append(preserved_qa)
            baseline = json.loads(json.dumps(storage))
            open_form('internship-first')
            status = page.evaluate('()=>new Promise(resolve=>window.__handlers.forEach(fn=>fn({action:"GET_PAGE_STATUS"},{},resolve)))')
            assert status['isApplication'], status
            assert page.locator('#intern-start').input_value() == '2026-10-30'
            page.locator('#intern-start').focus()
            page.locator('#intern-start').press('ArrowUp')
            page.locator('#intern-start').press('Tab')
            chosen_date = page.locator('#intern-start').input_value()
            assert chosen_date != '2026-10-30'
            for ident in ['months', 'schedule', 'source']:
                if custom:
                    page.locator('#' + ident).click()
                    page.locator('#' + ident + '-options [role=option]').last.click()
                else:
                    page.locator('#' + ident).focus()
                    page.locator('#' + ident).press('End')
                    page.locator('#' + ident).press('Tab')
            page.locator('#thesis-yes').check()
            page.locator('#next').click()
            page.wait_for_function('''()=>{
              const p=window.__latestProfile;
              if(!p)return false;
              return ['Wann stehen Sie für ein Praktikum zur Verfügung?', 'Wie viele Monate stehen Ihnen für ein Praktikum zur Verfügung?',
                'Sind Sie für ein Praktikum als Voll- oder Teilzeitkraft verfügbar?',
                'Müssen Sie im Rahmen Ihres Praktikums eine Abschlussarbeit oder einen Bericht für Ihre Hochschule schreiben?',
                'Wie haben Sie von uns erfahren?'].every(q=>p.fieldOverrides.some(o=>o.question===q));
            }''')
            open_form('internship-second')
            page.wait_for_function('(value)=>document.querySelector("#intern-start").value===value', arg=chosen_date)
            for ident, text in [('months', '6 Monate'), ('schedule', 'Teilzeit'), ('source', 'Andere')]:
                page.wait_for_function('(x)=>{const el=document.getElementById(x.id);return (el.tagName==="SELECT"?el.selectedOptions[0].text:el.textContent)===x.text}', arg={'id': ident, 'text': text})
            assert page.locator('#thesis-yes').is_checked()
            assert page.evaluate('window.submissions') == 0
            if not custom:
                # Some portals reveal a pre-rendered step by changing only a
                # hidden/class attribute; no new DOM nodes arrive on Next.
                page.evaluate('''html=>{
                  document.querySelector('form').hidden=true;
                  const step=document.createElement('section');step.id='future-step';step.hidden=true;
                  step.innerHTML=new DOMParser().parseFromString(html,'text/html').querySelector('form').outerHTML;
                  document.body.append(step);
                }''', internship_fixture('hidden-step'))
                page.wait_for_timeout(500)
                page.evaluate('''()=>{
                  document.getElementById('future-step').hidden=false;
                  const timer=setInterval(()=>document.body.classList.toggle('animation-frame'),80);
                  setTimeout(()=>clearInterval(timer),4500);
                }''')
                page.wait_for_function('(value)=>document.querySelector("#future-step input[type=date]").value===value', arg=chosen_date, timeout=2500)
                page.wait_for_function('()=>Array.from(document.querySelectorAll("#future-step select")).map(s=>s.selectedOptions[0].text).join("|")==="6 Monate|Teilzeit|Andere"')
                assert page.locator('#future-step #thesis-yes').is_checked()
            assert preserved_qa in storage[KEY]['customQA']
            assert len(storage[KEY]['customQA']) >= len(baseline[KEY]['customQA'])
            assert not errors, errors
            checks.append(mode + ': recognized, five answers learned, changed IDs replayed, page-default date replaced, prior learning preserved, no submission')
            context.close()
        browser.close()
    print(json.dumps({'result': 'passed', 'internship_checks': checks}, indent=2))


if __name__ == '__main__':
    main()
