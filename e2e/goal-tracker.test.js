import assert from 'node:assert/strict'
import { after, before, beforeEach, test } from 'node:test'
import { createServer } from 'vite'
import { Builder, By, until } from 'selenium-webdriver'
import chrome from 'selenium-webdriver/chrome.js'

const baseUrl = 'http://127.0.0.1:4173'
const fixture = {
  goals: [{
    id: 'e2e-goal',
    name: 'Read more books',
    description: 'A test goal',
    startDate: '2026-01-01',
    endDate: '2026-12-31',
    measurement: 'Books completed',
    unit: 'books',
    startValue: 0,
    currentValue: 2,
    targetValue: 12,
    direction: 'count',
    suggestedWeeklyTarget: 0.25,
    weeklyTarget: 1,
    createdAt: '2026-01-01T12:00:00.000Z',
  }],
  activities: [{
    id: 'e2e-activity',
    goalId: 'e2e-goal',
    date: '2026-06-14',
    amount: 2,
    unit: 'books',
    note: 'Finished two books',
    entryType: 'add',
    createdAt: '2026-06-14T12:00:00.000Z',
  }],
}

let server
let driver

before(async () => {
  server = await createServer({ server: { host: '127.0.0.1', port: 4173 } })
  await server.listen()
})

beforeEach(async () => {
  const options = new chrome.Options().addArguments('--window-size=1440,1000', '--no-sandbox', '--disable-dev-shm-usage')
  if (process.env.HEADLESS !== 'false') options.addArguments('--headless=new')
  driver = await new Builder().forBrowser('chrome').setChromeOptions(options).build()
  await driver.get(baseUrl)
  await driver.executeScript(
    'localStorage.setItem(arguments[0], arguments[1]); localStorage.setItem(arguments[2], arguments[3]);',
    'goal-tracker-data-v1',
    JSON.stringify(fixture),
    'goal-tracker-theme',
    'light',
  )
  await driver.navigate().refresh()
  await driver.wait(until.elementLocated(By.xpath("//h1[normalize-space()='Your goals']")), 5000)
})

after(async () => {
  await driver?.quit()
  await server?.close()
})

test.afterEach(async () => {
  await driver?.quit()
  driver = null
})

test('homepage loads the dashboard and saved goal', async () => {
  assert.equal(await driver.getTitle(), 'Goal Tracker')
  const goal = await driver.wait(until.elementLocated(By.xpath("//*[normalize-space()='Read more books']")), 5000)
  assert.equal(await goal.isDisplayed(), true)
})

test('clicking New goal displays the goal creation flow', async () => {
  await driver.findElement(By.css('[data-testid="new-goal-button"]')).click()
  const input = await driver.wait(until.elementLocated(By.css('[data-testid="goal-name-input"]')), 5000)
  assert.equal(await input.isDisplayed(), true)
  assert.equal(await driver.findElement(By.xpath("//*[normalize-space()='Goal setup']")).isDisplayed(), true)
})

test('creating a goal displays a complete goal card with progress bars', async () => {
  const next = async () => driver.findElement(By.css('[data-testid="goal-setup-next"]')).click()
  const replaceValue = async (testId, value) => {
    const input = await driver.findElement(By.css(`[data-testid="${testId}"]`))
    await input.clear()
    await input.sendKeys(value)
  }

  await driver.findElement(By.css('[data-testid="new-goal-button"]')).click()
  await driver.findElement(By.css('[data-testid="goal-name-input"]')).sendKeys('Complete 20 workouts')
  await next()

  await replaceValue('goal-end-date-input', '2026-12-31')
  await next()

  await driver.findElement(By.css('[data-testid="goal-measurement-input"]')).sendKeys('Workouts completed')
  await driver.findElement(By.css('[data-testid="goal-unit-input"]')).sendKeys('workouts')
  await next()

  await replaceValue('goal-start-value-input', '0')
  await replaceValue('goal-target-value-input', '20')
  await next()

  await replaceValue('goal-weekly-target-input', '2')
  await next()
  await driver.findElement(By.css('[data-testid="finish-goal-setup"]')).click()

  const card = await driver.wait(until.elementLocated(By.xpath("//*[@data-testid='goal-card'][.//*[normalize-space()='Complete 20 workouts']]")), 5000)
  const text = await card.getText()
  assert.match(text, /Complete 20 workouts/)
  assert.match(text, /Target 20/)
  assert.match(text, /0 \/ 2 workouts/)
  assert.equal(await card.findElement(By.css('[data-testid="overall-progress-bar"]')).getAttribute('data-progress'), '0')
  assert.equal(await card.findElement(By.css('[data-testid="weekly-progress-bar"]')).getAttribute('data-progress'), '0')
})

test('clicking History displays the history screen', async () => {
  await driver.findElement(By.css('[data-testid="nav-history"]')).click()
  const history = await driver.wait(until.elementLocated(By.css('[data-testid="history-page"]')), 5000)
  assert.match(await history.getText(), /History/)
})

test('clicking Export displays backup tools', async () => {
  await driver.findElement(By.css('[data-testid="nav-export"]')).click()
  const exportPage = await driver.wait(until.elementLocated(By.css('[data-testid="export-page"]')), 5000)
  assert.match(await exportPage.getText(), /Full data backup/)
})
