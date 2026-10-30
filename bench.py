# fps benchmark (headless chrome, software raster): python3 bench.py [url]
import asyncio, sys
from playwright.async_api import async_playwright
URL = sys.argv[1] if len(sys.argv) > 1 else 'http://127.0.0.1:5181/'
JS = """() => new Promise(r => { let n=0, t0=performance.now(), worst=0, last=t0; function f(now){ worst=Math.max(worst, now-last); last=now; if(++n<180) requestAnimationFrame(f); else r({fps: n*1000/(now-t0), worst}); } requestAnimationFrame(f); })"""
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--disable-gpu'])
        for name, w, h, dpr, mob in [('desktop', 1440, 900, 1, False), ('desktop-hidpi', 1440, 900, 2, False), ('mobile', 390, 844, 3, True)]:
            ctx = await b.new_context(viewport={'width': w, 'height': h}, device_scale_factor=dpr, is_mobile=mob, has_touch=mob)
            pg = await ctx.new_page(); cdp = await ctx.new_cdp_session(pg); await cdp.send('Emulation.setCPUThrottlingRate', {'rate': 4}); await pg.goto(URL + '?nosw=1'); await pg.wait_for_function("window.__office && window.__office.agents > 0", timeout=60000)
            await pg.wait_for_timeout(1500)
            r1 = await pg.evaluate(JS)
            await pg.evaluate("document.getElementById('gatherBtn').click()"); await pg.wait_for_timeout(300)
            r2 = await pg.evaluate(JS)
            print(f"{name:14s} idle fps={r1['fps']:.1f} worst={r1['worst']:.0f}ms | walking fps={r2['fps']:.1f} worst={r2['worst']:.0f}ms", flush=True)
            await ctx.close()
        await b.close()
asyncio.run(main())
