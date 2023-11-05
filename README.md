# Earnings Ticker

Elevate your motivation and seize the day with **Earnings Ticker**, an extension that calculates your real-time earnings based on your annual USD salary and work hours. Simply input your salary and work schedule, and marvel as your income accumulates before your eyes during your workday.

## Features

**Real-Time Earnings Display:** Keep track of your hard-earned money as you work. Your earnings update in real time, providing a constant stream of motivation.

**Customizable Work Hours:** Specify your daily work start and end times to get the most accurate earnings data tailored to your schedule.

**Unobtrusive Yet Accessible:** The extension sits quietly in your status bar, ensuring it doesn't distract you from your main tasks.

## How-To

1. Open the **Command Palette** on Visual Studio Code.
2. Enter `Start Earnings Ticker` and follow the prompts.
3. Enter `Cancel Earnings Ticker` to cancel.

## Default Settings

- The extension assumes 261 calendar workdays (removing all weekends).
- The extension assumes 26 days off to account for holidays, sick days, and vacation days.

## Customizable Settings

- `earningsTicker.numberOfAnnualWorkdays`: Configure the number of workdays in your calendar year.

- `earningsTicker.numberOfDaysOffWork`: Configure the number of days taken off from work.

## Known Issues

- Currently only supports USD currency.
- Does not account for odd working hours.
- Earnings accumulation does not persist across workspaces.

## To-Do

- [ ] Make currency adjustable.
- [ ] Make earnings accumulation persist across workspaces.
- [x] Add configuration settings.
