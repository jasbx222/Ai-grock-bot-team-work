# Screenshots + console error check (headless Chromium, software WebGL)
import asyncio, sys, json
from playwright.async_api import async_playwright
URL = sys.argv[1] if len(sys.argv) > 1 else 'http://127.0.0.1:5180/'
OUT = 'screens'
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'])
        errors = []
        async def run(name, w, h, steps, dpr=1, mobile=False, q=''):
            ctx = await b.new_context(viewport={'width': w, 'height': h}, device_scale_factor=dpr, is_mobile=mobile, has_touch=mobile)
            pg = await ctx.new_page()
            pg.on('console', lambda m: errors.append(f'[{name}] {m.type}: {m.text}') if m.type in ('error', 'warning') else None)
            pg.on('pageerror', lambda e: errors.append(f'[{name}] pageerror: {e}'))
            await pg.goto(URL + q); await pg.wait_for_selector('body[data-ready="1"]', timeout=90000)
            await pg.wait_for_timeout(3000)
            print(name, 'tags:', await pg.evaluate("document.querySelectorAll('#labels .tag').length"), 'agents:', await pg.evaluate("Object.keys(__office.agents).length"), flush=True)
            for kind, arg in steps:
                if kind == 'js': await pg.evaluate(arg)
                elif kind == 'wait': await pg.wait_for_timeout(arg)
                elif kind == 'shot': await pg.screenshot(path=f'{OUT}/{arg}.png'); print('saved', arg, flush=True)
                elif kind == 'key': await pg.keyboard.down(arg[0]); await pg.wait_for_timeout(arg[1]); await pg.keyboard.up(arg[0])
                elif kind == 'type': await pg.fill('#chat textarea', arg); await pg.click('#chat .send')
            print(name, 'FPS(avg last samples):', await pg.evaluate("(__office.perf.history.slice(-5).reduce((a,b)=>a+b,0)/Math.max(1,__office.perf.history.slice(-5).length)).toFixed(1) + ' dpr=' + devicePixelRatio + ' quality=' + __office.quality.level"), flush=True)
            await ctx.close()
        await run('desktop', 1600, 1000, [
            ('shot', '01-overview'),
            ('js', "__office.goToAgent('marketing')"), ('wait', 2500), ('shot', '02-closeup-layla-marketing'),
            ('js', "__office.goToAgent('dev01b')"), ('wait', 2500), ('shot', '03-closeup-yousif-dev01b'),
            ('js', "__office.chat.open('messaging')"), ('wait', 2000),
            ('type', 'شلون الشغل؟'), ('wait', 3000), ('shot', '04-chat-panel-john'),
            ('js', "__office.chat.close(); __office.setMode('walk')"), ('wait', 800), ('key', ('KeyW', 900)), ('wait', 400), ('shot', '05-walk-mode'),
            ('js', "__office.walk.goTo({x:-6.9,z:-1.9},{x:-9.4,y:0.7,z:-3.6})"), ('wait', 2000), ('shot', '06-walk-fireplace-cat'),
            ('js', "__office.goToAgent('planbot')"), ('wait', 2000), ('shot', '07-walk-goto-sara-planbot'),
            ('js', "__office.walk.goTo({x:5.2,z:-4.4},{x:5.4,y:1.2,z:-6.6})"), ('wait', 2000), ('shot', '08-walk-fishtank-birds'),
        ], q='?noadapt=1')
        await run('mobile', 412, 860, [
            ('shot', '09-mobile-overview'),
            ('js', "__office.setMode('walk')"), ('wait', 1000), ('shot', '10-mobile-walk-joystick'),
        ], dpr=2, mobile=True, q='?noadapt=1')
        await run('six-agents', 1600, 1000, [('shot', '11-six-agents-auto-layout')], q='?agents=agents.sample-6.json&status=status.sample-6.json&noadapt=1')
        await b.close()
        print('CONSOLE ISSUES:', json.dumps(errors, ensure_ascii=False, indent=1) if errors else 'none')
asyncio.run(main())
