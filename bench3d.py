# inside-mode benchmark (headless chrome, SwiftShader software WebGL - no GPU on the build box): python3 bench3d.py
import asyncio, sys
from playwright.async_api import async_playwright
URL = sys.argv[1] if len(sys.argv) > 1 else 'http://127.0.0.1:5181/'
JS = """() => new Promise(r => { let n=0, t0=performance.now(), worst=0, last=t0; function f(now){ worst=Math.max(worst, now-last); last=now; if(++n<90) requestAnimationFrame(f); else r({fps: n*1000/(now-t0), worst}); } requestAnimationFrame(f); })"""
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'])
        for name, w, h, dpr, mob in [('desktop', 1440, 900, 1, False), ('mobile', 390, 844, 3, True)]:
            ctx = await b.new_context(viewport={'width': w, 'height': h}, device_scale_factor=dpr, is_mobile=mob, has_touch=mob)
            pg = await ctx.new_page(); await pg.goto(URL + '?nosw=1&nogreet=1'); await pg.wait_for_function("window.__office && window.__office.view3d", timeout=60000)
            await pg.wait_for_timeout(2500)
            r1 = await pg.evaluate(JS)
            info = await pg.evaluate("(() => { const r = __officeApi.scene && window.__office; const R = __officeApi.renderer(); return R ? {calls: R.info.render.calls, tris: R.info.render.triangles, px: R.domElement.width + 'x' + R.domElement.height, tex: R.info.memory.textures} : null })()")
            await pg.evaluate("__officeApi.gather(true)"); await pg.wait_for_timeout(500)
            r2 = await pg.evaluate(JS)
            print(f"{name:8s} inside idle fps={r1['fps']:.1f} worst={r1['worst']:.0f}ms | gathering fps={r2['fps']:.1f} worst={r2['worst']:.0f}ms | {info}", flush=True)
            await ctx.close()
        await b.close()
asyncio.run(main())
