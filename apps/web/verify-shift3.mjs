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

const info1 = await page.evaluate(() => {
  const scrollDiv = document.querySelector('.overflow-y-auto')
  return { clientWidth: scrollDiv.clientWidth, scrollWidth: scrollDiv.scrollWidth, hasScrollbar: scrollDiv.scrollHeight > scrollDiv.clientHeight }
})
console.log("before:", info1)

await page.click('button[aria-label="Add to roster"]')
await page.waitForTimeout(400)

const info2 = await page.evaluate(() => {
  const scrollDiv = document.querySelector('.overflow-y-auto')
  const popupPortalParent = document.querySelector('[data-slot="popover-content"]')?.closest('body > div, body > *')
  return {
    clientWidth: scrollDiv.clientWidth,
    scrollWidth: scrollDiv.scrollWidth,
    hasScrollbar: scrollDiv.scrollHeight > scrollDiv.clientHeight,
    popoverParentTag: document.querySelector('[data-slot="popover-content"]')?.parentElement?.outerHTML?.slice(0,200),
  }
})
console.log("after:", info2)

// Check where popover content is in DOM
const popoverLocation = await page.evaluate(() => {
  const popup = document.querySelector('[data-slot="popover-content"]')
  if (!popup) return "not found"
  let el = popup
  const path = []
  while (el && el !== document.body) {
    path.push(el.tagName + (el.className ? '.' + String(el.className).split(' ').slice(0,2).join('.') : ''))
    el = el.parentElement
  }
  return path.join(' < ')
})
console.log("popover DOM path:", popoverLocation)

await browser.close()
