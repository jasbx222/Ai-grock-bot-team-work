# screenshots of both views: python3 shots.py [prefix]
import asyncio, sys
from playwright.async_api import async_playwright
URL = 'http://127.0.0.1:5181/'
PRE = sys.argv[1] if len(sys.argv) > 1 else 'test'
ONLY = sys.argv[2] if len(sys.argv) > 2 else ''
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'])
        for name, w, h, dpr, mob in [('1440x900', 1440, 900, 1, False), ('390x844', 390, 844, 2, True)]:
            if ONLY and ONLY != name: continue
            ctx = await b.new_context(viewport={'width': w, 'height': h}, device_scale_factor=dpr, is_mobile=mob, has_touch=mob)
            pg = await ctx.new_page(); pg.on('console', lambda m: m.type in ('error', 'warning') and print('  console:', m.type, m.text[:300])); pg.on('pageerror', lambda e: print('  pageerror:', e))
            await pg.goto(URL + '?nosw=1'); await pg.wait_for_function("window.__office && window.__office.agents > 0", timeout=90000)
            await pg.wait_for_timeout(1200); await pg.screenshot(path=f'screens/{PRE}_{name}_inside_welcome.png')
            await pg.wait_for_timeout(3500); await pg.screenshot(path=f'screens/{PRE}_{name}_inside_hearts.png')
            print(name, await pg.evaluate("JSON.stringify(window.__office)"))
            await pg.evaluate("__officeApi.enterRoom('r2')"); await pg.wait_for_timeout(4000); await pg.screenshot(path=f'screens/{PRE}_{name}_inside_room_walkin.png')
            await pg.wait_for_timeout(5000); await pg.screenshot(path=f'screens/{PRE}_{name}_inside_room_cuddle.png')
            await pg.wait_for_timeout(14000); await pg.screenshot(path=f'screens/{PRE}_{name}_inside_room.png')
            print(' room:', await pg.evaluate("JSON.stringify([...__officeApi.scene.S.agents.values()].map(a => [a.id, a.mode]))"))
            await pg.evaluate("__officeApi.gather(true); __officeApi.enterRoom('hall')"); await pg.wait_for_timeout(1500); await pg.screenshot(path=f'screens/{PRE}_{name}_inside_hall_walking.png')
            await pg.wait_for_timeout(7000); await pg.screenshot(path=f'screens/{PRE}_{name}_inside_hall_gathered.png')
            print(' gathered:', await pg.evaluate("JSON.stringify({P: __officeApi.P().x.toFixed(2)+','+__officeApi.P().z.toFixed(2)+' yaw '+__officeApi.P().yaw.toFixed(2), a: [...__officeApi.scene.S.agents.values()].map(a => [a.id, a.mode, Math.round(a.pos.x), Math.round(a.pos.y)])})"))
            await pg.evaluate("__officeApi.gather(false); __officeApi.enterRoom('hallway')"); await pg.wait_for_timeout(1800); await pg.screenshot(path=f'screens/{PRE}_{name}_inside_hallway.png')
            await pg.evaluate("__officeApi.setView('overview')"); await pg.wait_for_timeout(1500); await pg.screenshot(path=f'screens/{PRE}_{name}_overview.png')
            print(name, await pg.evaluate("JSON.stringify(window.__office)"))
            await ctx.close()
        await b.close()
asyncio.run(main())
