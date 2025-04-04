import * as vscode from 'vscode';

enum Commands {
  startEarningsTicker = 'extension.startEarningsTicker',
  cancelEarningsTicker = 'extension.cancelEarningsTicker'
}
type UserInputs = string[];

export default class EarningsTicker {
  private currency: string = 'USD';
  private annualSalary: number = 0;
  private startTime: Date | null = null;
  private endTime: Date | null = null;
  private intervalId: NodeJS.Timeout | null = null;
  private statusBar: vscode.StatusBarItem | null = null;
  private workdayActive = false;
  private deactivationTimeoutSet = false;
  private numberOfAnnualWorkdays: number = vscode.workspace
    .getConfiguration('earningsTicker')
    .get<number>('numberOfAnnualWorkdays', 261);
  private numberOfDaysOffWork: number = vscode.workspace
    .getConfiguration('earningsTicker')
    .get<number>('numberOfDaysOffWork', 26);
  private daysActivelyWorking: number =
    this.numberOfAnnualWorkdays - this.numberOfDaysOffWork;

  constructor(private context: vscode.ExtensionContext) {}

  public activate() {
    vscode.workspace.onDidChangeConfiguration(e => {
      if (
        e.affectsConfiguration('earningsTicker.numberOfAnnualWorkdays') ||
        e.affectsConfiguration('earningsTicker.numberOfDaysOffWork')
      ) {
        this.reInitialize();
      }
    });

    this.loadState();

    this.context.subscriptions.push(
      vscode.commands.registerCommand(Commands.startEarningsTicker, () =>
        this.startEarningsTicker()
      )
    );

    this.context.subscriptions.push(
      vscode.commands.registerCommand(Commands.cancelEarningsTicker, () =>
        this.deactivate()
      )
    );
  }

  public async deactivate() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
    }

    if (this.statusBar) {
      this.statusBar.hide();
      this.statusBar.dispose();
    }

    await this.resetState();

    vscode.window.showInformationMessage('Earnings Ticker has been canceled.');
  }

  private async reInitialize() {
    this.updateConfigSettings();
    await this.deactivate();
    this.loadState();
    await this.startEarningsTicker();
  }

  private async startEarningsTicker() {
    // Check if we already have valid state data from another workspace
    const isActive = this.context.globalState.get<boolean>('isActive', false);
    const storedSalary = this.context.globalState.get<number>(
      'annualSalary',
      0
    );
    const hasStoredStartTime = this.context.globalState.get<string>(
      'startTime',
      ''
    );
    const hasStoredEndTime = this.context.globalState.get<string>(
      'endTime',
      ''
    );

    // If we have valid data already stored, ask if user wants to reuse it
    if (
      isActive &&
      storedSalary > 0 &&
      hasStoredStartTime &&
      hasStoredEndTime
    ) {
      const decision = await vscode.window.showInformationMessage(
        'You have an active earnings ticker configuration. Would you like to reuse it?',
        'Reuse',
        'Reset'
      );

      if (decision === 'Reuse') {
        this.loadState();
        this.updateStatusBar(this.annualSalary / this.daysActivelyWorking);
        return;
      }
    }

    // Get new inputs if we don't have data or user wants to reset
    const userInputs = await this.getUserInputs();

    if (!userInputs) {
      await this.deactivate();
    } else if (!(await this.validateAndSetInputs(userInputs))) {
      await this.deactivate();
    } else {
      this.updateStatusBar(this.annualSalary / this.daysActivelyWorking);
    }
  }

  private loadState() {
    // Check if ticker is active first
    const isActive = this.context.globalState.get<boolean>('isActive', false);

    if (!isActive) {
      // If not active, don't load earnings values
      return;
    }

    const storedSalary = this.context.globalState.get<number>(
      'annualSalary',
      0
    );

    const storedStartTime = this.context.globalState.get<string>(
      'startTime',
      ''
    );

    const storedEndTime = this.context.globalState.get<string>('endTime', '');

    // Only set values if they exist
    if (storedSalary) {
      this.annualSalary = storedSalary;
    }

    if (storedStartTime) {
      this.startTime = new Date(storedStartTime);
    }

    if (storedEndTime) {
      this.endTime = new Date(storedEndTime);
    }

    // If we have valid data, resume the ticker
    if (this.annualSalary > 0 && this.startTime && this.endTime) {
      this.updateStatusBar(this.annualSalary / this.daysActivelyWorking);
    }
  }

  private async updateState(
    annualSalary: number,
    startTime: Date,
    endTime: Date
  ): Promise<void> {
    try {
      await Promise.all([
        this.context.globalState.update('annualSalary', annualSalary),
        this.context.globalState.update('startTime', startTime?.toISOString()),
        this.context.globalState.update('endTime', endTime?.toISOString()),
        this.context.globalState.update('isActive', true)
      ]);
    } catch (error: unknown) {
      if (error instanceof Error) {
        this.showErrorMessage(`Failed to update state: ${error.message}`);
      }
    }
  }

  private async resetState() {
    // Reset memory variables
    this.annualSalary = 0;
    this.startTime = null;
    this.endTime = null;
    this.intervalId = null;
    this.statusBar = null;
    this.workdayActive = false;
    this.deactivationTimeoutSet = false;

    // Update global state to indicate the ticker is inactive
    await this.context.globalState.update('isActive', false);
    // We don't clear the other values so they can be restored if reactivated
  }

  private updateConfigSettings() {
    this.numberOfAnnualWorkdays = vscode.workspace
      .getConfiguration('earningsTicker')
      .get<number>('numberOfAnnualWorkdays', 261);
    this.numberOfDaysOffWork = vscode.workspace
      .getConfiguration('earningsTicker')
      .get<number>('numberOfDaysOffWork', 26);
    this.daysActivelyWorking =
      this.numberOfAnnualWorkdays - this.numberOfDaysOffWork;
  }

  private formatCurrency(value: number, currency = 'USD') {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currency
    }).format(value);
  }

  private async getUserInputs(): Promise<UserInputs | null> {
    const currencyInput = await this.createPrompt(
      'Enter your desired currency (e.g., USD, EUR, GBP)'
    );

    if (currencyInput === undefined || currencyInput === '') {
      return null;
    }

    const salaryInput = await this.createPrompt(
      'Enter your annual salary (NUMBERS ONLY):'
    );

    if (salaryInput === undefined || salaryInput === '') {
      return null;
    }

    const startTimeInput = await this.createPrompt(
      'Enter your shift start time (HH:MM AM/PM):'
    );

    if (startTimeInput === undefined || startTimeInput === '') {
      return null;
    }

    const endTimeInput = await this.createPrompt(
      'Enter your shift end time (HH:MM AM/PM):'
    );

    if (endTimeInput === undefined || endTimeInput === '') {
      return null;
    }

    if (salaryInput && startTimeInput && endTimeInput) {
      return [currencyInput, salaryInput, startTimeInput, endTimeInput];
    } else {
      return null;
    }
  }

  private async createPrompt(prompt: string) {
    return await vscode.window.showInputBox({ prompt });
  }

  private parseSalary(salaryInput: string): number | null {
    const parsedSalary = parseFloat(salaryInput);
    if (parsedSalary <= 0 || !Boolean(parsedSalary)) {
      this.showErrorMessage(
        'Invalid salary amount. Please enter a positive number.'
      );
      return null;
    }
    return parsedSalary;
  }

  private validateTimeFormat(time: string): boolean {
    const timeRegex = /^([0-9]|0[1-9]|1[0-2]):[0-5][0-9]\s?(?:AM|PM|am|pm)$/;
    return timeRegex.test(time);
  }

  private convertTo24Hour(time: string): [number, number] {
    const [hour, minute] = time.split(/[:\s]/, 2);
    let meridian = time.match(/AM|PM|am|pm/gi);
    let hour24 = parseInt(hour);

    // Convert PM hours to 24-hour format, except for 12 PM
    if (meridian && meridian[0].toUpperCase() === 'PM' && hour !== '12') {
      hour24 += 12;
    }

    // Convert 12 AM to 0
    if (hour === '12' && meridian && meridian[0].toUpperCase() === 'AM') {
      hour24 = 0;
    }

    return [hour24, parseInt(minute)];
  }

  private async validateAndSetInputs(userInputs: UserInputs): Promise<boolean> {
    const [currencyInput, salaryInput, startTimeInput, endTimeInput] =
      userInputs;

    const parsedSalary = this.parseSalary(salaryInput);

    if (!parsedSalary) {
      return false;
    }

    if (
      !this.validateTimeFormat(startTimeInput) ||
      !this.validateTimeFormat(endTimeInput)
    ) {
      this.showErrorMessage('Invalid time format. Use HH:MM AM/PM.');
      return false;
    }

    this.annualSalary = parsedSalary;
    this.currency = currencyInput;

    const currentDate = new Date();
    this.startTime = new Date(currentDate);
    this.endTime = new Date(currentDate);

    const [startHour, startMinute] = this.convertTo24Hour(startTimeInput);
    const [endHour, endMinute] = this.convertTo24Hour(endTimeInput);

    this.startTime.setHours(startHour, startMinute, 0, 0);
    this.endTime.setHours(endHour, endMinute, 0, 0);

    // Ensure the start time is before the end time
    if (this.endTime <= this.startTime) {
      this.showErrorMessage('Start time must be before the end time.');
      return false;
    }

    try {
      await this.updateState(this.annualSalary, this.startTime, this.endTime);
      return true;
    } catch (error: unknown) {
      if (error instanceof Error) {
        this.showErrorMessage(`An error occurred. ${error.message}`);
      } else {
        this.showErrorMessage('An unknown error occurred.');
      }
      return false;
    }
  }

  private updateStatusBar(dailySalary: number) {
    if (!this.statusBar) {
      this.statusBar = vscode.window.createStatusBarItem(
        vscode.StatusBarAlignment.Right,
        100
      );
      this.statusBar.text = '';
      this.statusBar.color = '#39FF14';
      this.statusBar.show();
    }

    if (this.intervalId) {
      clearInterval(this.intervalId);
    }

    this.intervalId = setInterval(() => {
      if (this.startTime && this.endTime && dailySalary && this.statusBar) {
        const now = new Date();

        if (now >= this.startTime && now <= this.endTime) {
          this.workdayActive = true;
          const elapsedMs = now.getTime() - this.startTime.getTime();
          const totalWorkMs = this.endTime.getTime() - this.startTime.getTime();
          const earned = (elapsedMs / totalWorkMs) * dailySalary;

          this.statusBar.text = this.formatCurrency(earned, this.currency);
        } else if (this.workdayActive && !this.deactivationTimeoutSet) {
          this.deactivationTimeoutSet = true;
          this.workdayActive = false;

          this.statusBar.text = `Congrats! You Earned ${this.formatCurrency(
            dailySalary,
            this.currency
          )}`;

          setTimeout(() => {
            this.deactivate();
          }, 10 * 60 * 1000); // 10 minutes in milliseconds

          if (this.intervalId) {
            clearInterval(this.intervalId);
          }
        } else {
          this.statusBar.text = `Congrats! You Earned ${this.formatCurrency(
            dailySalary,
            this.currency
          )}`;
          setTimeout(() => {
            this.deactivate();
          }, 2 * 60 * 5000); // 2 minutes in milliseconds

          if (this.intervalId) {
            clearInterval(this.intervalId);
          }
        }
      }
    }, 1000);
  }

  private showErrorMessage(message: string) {
    vscode.window.showErrorMessage(message);
  }
}

let ticker: EarningsTicker;

export function activate(context: vscode.ExtensionContext) {
  ticker = new EarningsTicker(context);
  ticker.activate();
}

export async function deactivate() {
  await ticker.deactivate();
}
