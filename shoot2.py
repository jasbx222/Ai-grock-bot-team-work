import asyncio, sys, json
from playwright.async_api import async_playwright
BASE = 'http://127.0.0.1:5180/'
RUNS = [
  ('m-home-cats', 412, 860, '', None),
  ('d-home-cats', 1440, 900, '', None),
  ('d-gather-cats', 1440, 900, '?gather=1', 'wait6'),
  ('m-01-home', 412, 860, '', None),
  ('d-02-home', 1440, 900, '', None),
  ('d-03-gather', 1440, 900, '?gather=1', 'wait6'),
  ('m-04-chat', 412, 860, '?chat=messaging', None),
  ('d-05-walk', 1440, 900, '?walk=1', 'walk'),
  ('d-06-six-agents', 1440, 900, '?agents=agents.sample-6.json&status=status.sample-6.json', None),
  ('d-07-overview', 1440, 900, '', 'overview'),
]
only = sys.argv[1:]
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--no-sandbox', '--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'])
        for name, w, h, q, act in RUNS:
            if only and name not in only: continue
            ctx = await b.new_context(viewport={'width': w, 'height': h}, device_scale_factor=2 if w < 600 else 1, locale='ar-IQ', timezone_id='Asia/Baghdad')
            pg = await ctx.new_page(); errs = []
            pg.on('console', lambda m: errs.append(m.text) if m.type == 'error' else None)
            pg.on('pageerror', lambda e: errs.append(str(e)))
            pg.on('requestfailed', lambda r: errs.append('FAIL ' + r.url))
            pg.on('response', lambda r: errs.append(f'{r.status} {r.url}') if r.status >= 400 else None)
            await pg.goto(BASE + q); await pg.wait_for_timeout(3500)
            if act == 'wait6': await pg.wait_for_timeout(5000)
            if act == 'overview': await pg.click('#resetBtn'); await pg.wait_for_timeout(2500)
            if act == 'walk':
                await pg.keyboard.down('d'); await pg.wait_for_timeout(1200); await pg.keyboard.up('d')
                await pg.keyboard.down('w'); await pg.wait_for_timeout(900); await pg.keyboard.up('w'); await pg.wait_for_timeout(1500)
            await pg.screenshot(path=f'screens/{name}.png')
            info = await pg.evaluate('window.__office')
            print(name, json.dumps(info), 'errors:', errs)
            await ctx.close()
        await b.close()
asyncio.run(main())
