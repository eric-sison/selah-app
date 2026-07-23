import { chromium } from "@playwright/test"

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1400, height: 850 } })

await page.goto("http://localhost:3000/auth/sign-in")
await page.fill('input[name="email"]', "admin@selah.local")
await page.fill('input[name="password"]', "password123")
await page.click('button[type="submit"]')
await page.waitForTimeout(2000)

await page.goto("http://localhost:3000/line-ups")
await page.waitForTimeout(1500)
await page.click('text=Sermon')
await page.waitForTimeout(1500)

async function snap(label) {
  const info = await page.evaluate(() => {
    const avatarGroup = document.querySelector('[data-slot="avatar-group"]')
    const btn = document.querySelector('button[aria-label="Add to roster"]')
    const membersSpan = Array.from(document.querySelectorAll('span')).find(s => /members?$/.test(s.textContent || '') && s.children.length === 0)
    const styleOf = (el) => el ? { position: getComputedStyle(el).position, display: getComputedStyle(el).display } : null
    const guards = Array.from(avatarGroup.querySelectorAll('[data-base-ui-focus-guard]')).map(g => ({
      rect: g.getBoundingClientRect(),
      style: styleOf(g),
    }))
    return {
      avatarGroupRect: avatarGroup.getBoundingClientRect(),
      btnRect: btn.getBoundingClientRect(),
      membersSpanRect: membersSpan?.getBoundingClientRect(),
      guards,
    }
  })
  console.log(label, JSON.stringify(info, null, 2))
}

await snap("BEFORE")
await page.click('button[aria-label="Add to roster"]')
await page.waitForTimeout(400)
await snap("AFTER")

await browser.close()
